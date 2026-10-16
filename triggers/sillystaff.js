// triggers/sillystaff.js
//
// A chat trigger. Whenever someone says "silly" followed by a staff name,
// the bot posts "Silly [name]" in the same channel.
//
//   Someone types:  "silly steve"     The bot posts:  "Silly Steve"
//
// - Only names in staffNames.js (in the main folder) work. Other names are ignored.
// - Capital letters in what people type do not matter.
// - Each name has its own cooldown. After the bot says "Silly Steve", it will not say
//   it again for 30 minutes, but "Silly Nero" is still allowed during that time.
// - The cooldown is shared across ALL channels and servers.
// - The bot posts a normal message in the channel (not a reply to the person).
//
// To change the list of names, edit staffNames.js. To change the cooldown, edit
// COOLDOWN_MINUTES below.

const staffNames = require('../staffNames');

// How long to wait before the bot will say "Silly [name]" for the SAME name again.
const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000; // the same time in milliseconds

// ---- Prepare the name list -----------------------------------------------
// We tidy the list once, when the bot starts:
//   - remove extra spaces and empty entries
//   - ignore repeats (so "Steve" and "steve" count as one name)
// The result is a lookup table: lowercase name -> the name as written in the list.
// The bot uses the list's spelling when it replies, so "silly STEVE" becomes "Silly Steve".
const namesByLowercase = new Map();

for (const name of staffNames) {
  const cleaned = String(name).trim().replace(/\s+/g, ' ');
  if (cleaned !== '' && !namesByLowercase.has(cleaned.toLowerCase())) {
    namesByLowercase.set(cleaned.toLowerCase(), cleaned);
  }
}

// ---- The cooldown timers -------------------------------------------------
// Remembers, for each name, the time (in milliseconds) when its cooldown ends.
//   key:   the lowercase name, for example "steve"
//   value: the time the cooldown ends
// This lives in the bot's memory only, so every cooldown resets when the bot restarts.
const cooldownEnds = new Map();

// ---- Build the pattern ---------------------------------------------------
// Names might contain characters with a special meaning in patterns (like a dot or a
// bracket). This puts a backslash in front of them so they are treated as plain text.
function escapeForPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// These two checks replace \b ("edge of a word") because \b does not understand
// letters like e-acute. They mean "there is no letter or number right before/after here".
//   \p{L} is any letter, \p{N} is any number
const NOT_PRECEDED_BY_LETTER = '(?<![\\p{L}\\p{N}_])';
const NOT_FOLLOWED_BY_LETTER = '(?![\\p{L}\\p{N}_])';

// Turn the names into one pattern part like: Steve|Nero
// Longest names first, and spaces inside a name may be one or more spaces.
const namePart = [...namesByLowercase.values()]
  .sort((a, b) => b.length - a.length)
  .map((name) => escapeForPattern(name).replace(/ /g, '\\s+'))
  .join('|');

// The full pattern text: the word "silly", one or more spaces, then one of the names.
// The brackets around the names "capture" the name so execute() can see which one it was.
// If the list is empty, "(?!)" is a pattern that can never match, so nothing triggers.
const patternText =
  namePart === ''
    ? '(?!)'
    : `${NOT_PRECEDED_BY_LETTER}silly\\s+(${namePart})${NOT_FOLLOWED_BY_LETTER}`;

// ---- Example tests for "npm run check" -----------------------------------
// These are built from the first name in the list, so they stay correct
// whenever you edit staffNames.js.
const firstName = [...namesByLowercase.values()][0];

module.exports = {
  // The pattern the bot looks for in every message.
  // Flags: i ignores capital letters, u lets \p{L} and \p{N} work.
  pattern: new RegExp(patternText, 'iu'),

  examples: {
    shouldMatch: firstName
      ? [`silly ${firstName}`, `SILLY ${firstName.toUpperCase()}`, `oh you silly ${firstName.toLowerCase()}!`]
      : [],
    shouldNotMatch: firstName
      ? [
          'silly',
          'silly zzzznotastaffmember',
          firstName, // the name on its own, without "silly"
          `silly ${firstName}xyz`, // the name must be a whole word
          `xsilly ${firstName}`, // "silly" must be a whole word
        ]
      : ['silly'],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // Make sure the bot is allowed to post in this kind of channel.
    if (!message.channel.isSendable()) return;

    const now = Date.now();

    // A message can name more than one person ("silly Steve and silly Nero").
    // The "g" flag makes matchAll() find every match instead of only the first.
    const findAllNames = new RegExp(patternText, 'giu');
    const namesToSay = []; // the names we will reply about (those not on cooldown)
    const keysUsed = []; // their lowercase versions, used for the cooldown timers

    for (const match of message.content.matchAll(findAllNames)) {
      // match[1] is the name as the person typed it. Look up the list's spelling.
      const key = match[1].toLowerCase().replace(/\s+/g, ' ');
      const name = namesByLowercase.get(key);

      const onCooldown = (cooldownEnds.get(key) ?? 0) > now;
      const alreadyListed = keysUsed.includes(key);

      // Skip names on cooldown and names that appear twice in the same message.
      if (!name || onCooldown || alreadyListed) continue;

      namesToSay.push(name);
      keysUsed.push(key);
      cooldownEnds.set(key, now + COOLDOWN_MS); // start the cooldown for this name
    }

    // Nothing to say (every name was on cooldown), so stay quiet.
    if (namesToSay.length === 0) return;

    try {
      // channel.send() posts a normal message in the same channel (not a reply).
      // parse: [] means this message can never ping anyone.
      await message.channel.send({
        content: namesToSay.map((name) => `Silly ${name}`).join('\n'),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      // The message failed to send (for example the bot lacks permission here),
      // so cancel the cooldowns we just started. Then let index.js log the error.
      for (const key of keysUsed) cooldownEnds.delete(key);
      throw error;
    }
  },
};
