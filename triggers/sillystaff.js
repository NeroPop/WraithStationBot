// triggers/sillystaff.js
//
// A chat trigger. Whenever someone says "silly" followed by a staff name,
// the bot posts "Silly [name]" in the same channel.
//
//   Someone types:  "silly steve"     The bot posts:  "Silly Steve"
//
// The staff list and the cooldown timestamps both live in a Google Sheet.
// The sheet needs a tab called "Staff" with two column headings in row 1:
//
//     Name   |  Last Said
//     Steve  |  (the bot fills this in)
//     Nero   |
//
// - Only names in the "Name" column work. Other names are ignored.
// - Capital letters in what people type do not matter.
// - After the bot says "Silly Steve" it writes the time into "Last Said". If that
//   time is less than 30 minutes ago, the bot stays quiet. Each name has its own timer.
// - The bot posts a normal message in the channel (not a reply to the person).
// - Because the times are saved in the sheet, cooldowns survive a bot restart.
//
// To change the cooldown, edit COOLDOWN_MINUTES below.
// To change the names, just edit the spreadsheet. Changes are picked up within 5 minutes.

const { getSheet } = require('../sheets');
const { sheetIds } = require('../config'); // the staff list's spreadsheet ID lives in config.js

// ---- Settings you might want to change -----------------------------------
const SHEET_TAB = 'Staff'; // the name of the tab at the bottom of the spreadsheet
const NAME_HEADING = 'Name'; // the heading of the column holding the staff names
const TIME_HEADING = 'Last Said'; // the heading of the column the bot writes times into
const COOLDOWN_MINUTES = 30; // how long before the same name can be said again
const LIST_REFRESH_MINUTES = 5; // how often the bot re-reads the sheet

const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000; // the same times in milliseconds
const LIST_REFRESH_MS = LIST_REFRESH_MINUTES * 60 * 1000;

// ---- What the bot remembers in memory ------------------------------------
// We do NOT ask Google on every message, because Google limits how often we may ask.
// Instead we keep a copy of the sheet and refresh it every few minutes.

// The copy of the staff list. lowercase name -> { name, row, lastSaidMs }
//   name       the name as written in the sheet (used when the bot replies)
//   row        the sheet row, used when we need to write a new time
//   lastSaidMs the last time the bot said this name, from the "Last Said" column
let staffByKey = new Map();

// When the copy was last refreshed (0 means never).
let loadedAt = 0;

// If a refresh is running right now, this holds it, so two messages never refresh at once.
let loadingNow = null;

// The pattern for finding names in a message, built from the list each time it refreshes.
// "(?!)" is a pattern that can never match, used while the list is empty.
let namesPatternText = '(?!)';

// The times the bot has said each name since it started. This protects against two
// messages arriving at the same instant, and against a refresh bringing back an old time.
const saidRecently = new Map(); // lowercase name -> time in milliseconds

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

  // Make sure the two columns exist, with a clear message if they do not.
  for (const heading of [NAME_HEADING, TIME_HEADING]) {
    if (!sheet.headerValues.includes(heading)) {
      throw new Error(`The "${SHEET_TAB}" tab needs a column headed "${heading}" in row 1.`);
    }
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

    // Turn the "Last Said" text into a time. A blank or unreadable cell becomes 0,
    // which means "never said", so the bot is allowed to speak.
    const parsed = Date.parse(row.get(TIME_HEADING));
    fresh.set(key, { name, row, lastSaidMs: Number.isNaN(parsed) ? 0 : parsed });
  }

  // Build the pattern part that lists every name, like: Steve|Nero
  // Longest names first, and a space inside a name may be one or more spaces.
  const namePart = [...fresh.values()]
    .map((entry) => entry.name)
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeForPattern(name).replace(/ /g, '\\s+'))
    .join('|');

  namesPatternText =
    namePart === ''
      ? '(?!)'
      : `${NOT_PRECEDED_BY_LETTER}silly\\s+(${namePart})${NOT_FOLLOWED_BY_LETTER}`;

  staffByKey = fresh;
  loadedAt = Date.now();
}

// ---- The trigger itself --------------------------------------------------
module.exports = {
  // A quick, cheap first check that runs on EVERY message: does it contain "silly"
  // followed by a word? Only then do we look at the staff list. This keeps the bot
  // fast, and it means we only ever read the sheet for messages that might matter.
  // Flags: i ignores capital letters, u lets \p{L} and \p{N} work.
  pattern: /(?<![\p{L}\p{N}_])silly\s+[\p{L}\p{N}]/iu,

  // Optional: example messages that "npm run check" uses to test the pattern above.
  // (The real name check needs the spreadsheet, so it is not tested here.)
  examples: {
    shouldMatch: ['silly steve', 'SILLY NERO', 'oh you silly goose!'],
    shouldNotMatch: ['silly', 'silly ', 'xsilly steve', 'hello there'],
  },

  // Runs when a message contains "silly" and a word. "message" is the Discord message.
  async execute(message) {
    // Make sure the bot is allowed to post in this kind of channel.
    if (!message.channel.isSendable()) return;

    // Make sure we have a recent copy of the staff list (reads the sheet if it is old).
    await loadStaff(LIST_REFRESH_MS);

    const now = Date.now();

    // A message can name more than one person ("silly Steve and silly Nero").
    // The "g" flag makes matchAll() find every match instead of only the first.
    const findAllNames = new RegExp(namesPatternText, 'giu');
    const claimed = []; // the names we will say, as { key, entry, previousMs }

    for (const match of message.content.matchAll(findAllNames)) {
      // match[1] is the name as the person typed it. Look up the sheet's spelling.
      const key = match[1].toLowerCase().replace(/\s+/g, ' ');
      const entry = staffByKey.get(key);
      if (!entry || claimed.some((item) => item.key === key)) continue;

      // The last time we said this name: the sheet's time, or our own memory if newer.
      const lastMs = Math.max(entry.lastSaidMs, saidRecently.get(key) ?? 0);
      if (now - lastMs < COOLDOWN_MS) continue; // still on cooldown, stay quiet

      // Claim it straight away (before any waiting) so another message arriving at the
      // same moment cannot also say this name.
      claimed.push({ key, entry, previousMs: saidRecently.get(key) });
      saidRecently.set(key, now);
    }

    // Nothing to say (not a staff name, or every name was on cooldown), so stay quiet.
    if (claimed.length === 0) return;

    // Post the message first. If it fails, undo the claim so the next attempt can work.
    try {
      // channel.send() posts a normal message in the same channel (not a reply).
      // parse: [] means this message can never ping anyone.
      await message.channel.send({
        content: claimed.map((item) => `Silly ${item.entry.name}`).join('\n'),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      for (const item of claimed) {
        if (item.previousMs === undefined) saidRecently.delete(item.key);
        else saidRecently.set(item.key, item.previousMs);
      }
      throw error; // index.js writes the error to the console
    }

    // Now save the time in the sheet. We re-read the sheet first (loadStaff(0)) because
    // someone may have added or removed rows, which would move the row we remembered.
    await loadStaff(0);

    const timestamp = new Date(now).toISOString(); // for example 2026-10-16T16:45:00.000Z
    for (const item of claimed) {
      const freshEntry = staffByKey.get(item.key);
      if (!freshEntry) continue; // the name was removed from the sheet a moment ago

      freshEntry.row.set(TIME_HEADING, timestamp);
      await freshEntry.row.save({ raw: true }); // raw: save the text exactly as written
      freshEntry.lastSaidMs = now;
    }
  },
};
