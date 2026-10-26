// staffTrigger.js
//
// The shared engine behind triggers that react to a phrase followed by a staff name,
// like "silly Steve" or "good job Steve". Each of those triggers is a short file that
// says WHICH phrase to look for, WHAT to reply, and WHICH spreadsheet column keeps its
// cooldown times. Everything else (reading the staff list, the cooldowns) lives here,
// so it is written once.
//
//   const { createStaffTrigger } = require('../staffTrigger');
//   module.exports = createStaffTrigger({ phrase: 'silly', ... });
//
// THE STAFF SHEET
// The staff list is the "Staff" tab of the staff spreadsheet (its ID is in config.js).
// Row 1 holds the column headings. One column is always needed:
//
//     Name   |  Last Silly  |  Last Good Job
//     Steve  |  (bot)      |  (bot)
//     Nero   |             |
//
// "Name" lists the staff. Every trigger also has its OWN time column, where the bot saves
// when it last replied for each name (so each trigger has its own cooldown, and cooldowns
// survive a restart). The bot never writes in the "Name" column.
//
// HOW A TRIGGER WORKS
//   - Only names in the "Name" column work. Other names are ignored.
//   - Capital letters in what people type do not matter.
//   - After the bot replies for a name, it saves the time in the trigger's own column. If that
//     time is less than the cooldown ago, the bot stays quiet for that name.
//   - The bot posts a normal message in the channel (not a reply to the person).
//   - Changes to the sheet are picked up within 5 minutes.

const { getSheet } = require('./sheets');
const { sheetIds } = require('./config'); // the staff list's spreadsheet ID lives in config.js
const { createQueue } = require('./taskQueue');

// ---- Settings you might want to change -----------------------------------
const SHEET_TAB = 'Staff'; // the name of the tab at the bottom of the spreadsheet
const NAME_HEADING = 'Name'; // the heading of the column holding the staff names
const LIST_REFRESH_MINUTES = 5; // how often the bot re-reads the sheet

const LIST_REFRESH_MS = LIST_REFRESH_MINUTES * 60 * 1000; // the same time in milliseconds

// ---- What the bot remembers in memory (shared by every staff trigger) ----
// We do NOT ask Google on every message, because Google limits how often we may ask.
// Instead we keep one copy of the sheet and refresh it every few minutes.

// The copy of the staff list. lowercase name -> { name, row }
//   name  the name as written in the sheet (used when the bot replies)
//   row   the sheet row, which holds every time column and is used to save new times
let staffByKey = new Map();

// The column headings found in row 1 of the sheet.
let headings = [];

// When the copy was last refreshed (0 means never).
let loadedAt = 0;

// If a refresh is running right now, this holds it, so two messages never refresh at once.
let loadingNow = null;

// The part of a pattern that lists every name, like "Steve|Nero". Empty while the list is empty.
let namePart = '';

// Saving a time has to happen one trigger at a time. Rows are saved whole, so two triggers
// saving at the very same moment could overwrite each other's column.
const runExclusive = createQueue();

// ---- Pattern helpers -----------------------------------------------------
// Names might contain characters with a special meaning in patterns (like a dot or a
// bracket). This puts a backslash in front of them so they are treated as plain text.
function escapeForPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// These replace \b ("edge of a word"), because \b does not understand letters like
// e-acute. They mean "there is no letter or number right before/after here".
//   \p{L} is any letter, \p{N} is any number
const NOT_PRECEDED_BY_LETTER = '(?<![\\p{L}\\p{N}_])';
const NOT_FOLLOWED_BY_LETTER = '(?![\\p{L}\\p{N}_])';

// ---- Reading the sheet ---------------------------------------------------

// Re-reads the sheet, but only if our copy is older than "maxAgeMs".
// Pass 0 to force a fresh read.
async function loadStaff(maxAgeMs) {
  if (Date.now() - loadedAt < maxAgeMs) return; // our copy is recent enough

  // Only start one refresh at a time. Anyone else who asks just waits for it.
  if (!loadingNow) {
    loadingNow = readSheet().finally(() => {
      loadingNow = null;
    });
  }

  await loadingNow;
}

async function readSheet() {
  const sheet = await getSheet(sheetIds.staffList, SHEET_TAB);
  const rows = await sheet.getRows(); // also reads the headings into sheet.headerValues

  // The "Name" column is needed by every trigger. (Each trigger checks for its own time
  // column when it needs it, so a missing time column only affects that one trigger.)
  if (!sheet.headerValues.includes(NAME_HEADING)) {
    throw new Error(`The "${SHEET_TAB}" tab needs a column headed "${NAME_HEADING}" in row 1.`);
  }

  const fresh = new Map();

  for (const row of rows) {
    // Tidy the name: remove extra spaces, and skip empty rows.
    const name = String(row.get(NAME_HEADING) ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (name === '') continue;

    // If a name is listed twice, the first one wins.
    const key = name.toLowerCase();
    if (fresh.has(key)) continue;

    fresh.set(key, { name, row });
  }

  // Build the pattern part that lists every name, like: Steve|Nero
  // Longest names first, and a space inside a name may be one or more spaces.
  namePart = [...fresh.values()]
    .map((entry) => entry.name)
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeForPattern(name).replace(/ /g, '\\s+'))
    .join('|');

  staffByKey = fresh;
  headings = [...sheet.headerValues];
  loadedAt = Date.now();
}

// When did a trigger last reply for this name? Read from the trigger's own time column.
// A blank or unreadable cell counts as 0, which means "never", so the bot is allowed to speak.
function lastTimeOf(entry, timeHeading) {
  const parsed = Date.parse(entry.row.get(timeHeading));
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Saves the time in a trigger's own column for each of the given names.
// We re-read the sheet first (loadStaff(0)) because someone may have added or removed rows,
// which would move the row we remembered.
function saveTimes(timeHeading, keys, now) {
  return runExclusive(async () => {
    await loadStaff(0);

    const timestamp = new Date(now).toISOString(); // for example 2026-10-16T16:45:00.000Z
    for (const key of keys) {
      const entry = staffByKey.get(key);
      if (!entry) continue; // the name was removed from the sheet a moment ago

      entry.row.set(timeHeading, timestamp);
      await entry.row.save({ raw: true }); // raw: save the text exactly as written
    }
  });
}

// ---- Making a trigger ----------------------------------------------------

// Builds a trigger. The options are:
//   phrase           the words to look for before the name, like 'silly' or 'good job'
//   timeHeading      the sheet column this trigger saves its times in, like 'Last Silly'
//   cooldownMinutes  how long before the same name can get a reply again
//   reply(name)      returns the text to post for one name
//   gap              (optional) what may sit between the phrase and the name, as pattern
//                    text. The default is one or more spaces.
//   examples         (optional) example messages that "npm run check" uses to test the phrase
function createStaffTrigger({ phrase, timeHeading, cooldownMinutes, reply, gap = '\\s+', examples }) {
  const cooldownMs = cooldownMinutes * 60 * 1000;

  // The phrase as pattern text. Spaces inside it may be one or more spaces ("good  job").
  const phrasePattern = escapeForPattern(phrase).replace(/ /g, '\\s+');

  // The times this trigger has replied for each name since it started. This protects against
  // two messages arriving at the same instant, and against a refresh bringing back an old time.
  const saidRecently = new Map(); // lowercase name -> time in milliseconds

  return {
    // A quick, cheap first check that runs on EVERY message: does it contain the phrase
    // followed by a word? Only then do we look at the staff list. This keeps the bot fast,
    // and it means we only ever read the sheet for messages that might matter.
    // Flags: i ignores capital letters, u lets \p{L} and \p{N} work.
    pattern: new RegExp(`${NOT_PRECEDED_BY_LETTER}${phrasePattern}${gap}[\\p{L}\\p{N}]`, 'iu'),

    examples,

    // Runs when a message contains the phrase and a word. "message" is the Discord message.
    async execute(message) {
      // Make sure the bot is allowed to post in this kind of channel.
      if (!message.channel.isSendable()) return;

      // Make sure we have a recent copy of the staff list (reads the sheet if it is old).
      await loadStaff(LIST_REFRESH_MS);
      if (namePart === '') return; // the staff list is empty

      // A message can name more than one person ("silly Steve and silly Nero").
      // The "g" flag makes matchAll() find every match instead of only the first.
      const findAllNames = new RegExp(`${NOT_PRECEDED_BY_LETTER}${phrasePattern}${gap}(${namePart})${NOT_FOLLOWED_BY_LETTER}`, 'giu');
      const found = []; // the staff names in the message, as { key, entry }

      for (const match of message.content.matchAll(findAllNames)) {
        // match[1] is the name as the person typed it. Look up the sheet's spelling.
        const key = match[1].toLowerCase().replace(/\s+/g, ' ');
        const entry = staffByKey.get(key);
        if (!entry || found.some((item) => item.key === key)) continue;

        found.push({ key, entry });
      }

      // No staff name was said (for example "good job everyone"), so stay quiet.
      if (found.length === 0) return;

      // We can only keep the cooldown if the sheet has this trigger's time column.
      if (!headings.includes(timeHeading)) {
        throw new Error(`The "${SHEET_TAB}" tab needs a column headed "${timeHeading}" in row 1.`);
      }

      const now = Date.now();
      const claimed = []; // the names we will reply for, as { key, entry, previousMs }

      for (const { key, entry } of found) {
        // The last time we replied for this name: the sheet's time, or our own memory if newer.
        const lastMs = Math.max(lastTimeOf(entry, timeHeading), saidRecently.get(key) ?? 0);
        if (now - lastMs < cooldownMs) continue; // still on cooldown, stay quiet

        // Claim it straight away (before any waiting) so another message arriving at the
        // same moment cannot also reply for this name.
        claimed.push({ key, entry, previousMs: saidRecently.get(key) });
        saidRecently.set(key, now);
      }

      // Every name was on cooldown, so stay quiet.
      if (claimed.length === 0) return;

      // Post the message first. If it fails, undo the claim so the next attempt can work.
      try {
        // channel.send() posts a normal message in the same channel (not a reply).
        // parse: [] means this message can never ping anyone.
        await message.channel.send({
          content: claimed.map((item) => reply(item.entry.name)).join('\n'),
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        for (const item of claimed) {
          if (item.previousMs === undefined) saidRecently.delete(item.key);
          else saidRecently.set(item.key, item.previousMs);
        }
        throw error; // index.js writes the error to the console
      }

      // Now save the times in the sheet.
      await saveTimes(
        timeHeading,
        claimed.map((item) => item.key),
        now
      );
    },
  };
}

module.exports = { createStaffTrigger };
