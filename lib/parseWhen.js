// lib/parseWhen.js
//
// Turns what a person types into a moment in time, for things like the tea alarm.
// It understands clock times, with or without a day:
//
//   "19:20"  "7:20pm"  "7.20pm"  "9am"  "9"  "noon"  "midnight"    the NEXT time the clock reads that
//   "saturday 7:20pm"  "7:20pm on saturday"  "sat 19:20"           that time on the next Saturday
//   "tomorrow 9am"  "today 6pm"  "tonight 9pm"                      that time tomorrow / today
//
// Capital letters and commas do not matter, and little words like "on", "at", "next" and "this"
// are ignored ("next saturday at 7pm" works). Clock times without am or pm use the 24 hour clock,
// so "7" means 07:00 and "19" means 19:00.
//
// A day name means the next time that day comes round. If today is Saturday, "saturday 7pm" is
// today at 7pm when it is not 7pm yet, and next Saturday once 7pm has gone by.
//
// It does NOT understand waits like "20m" or "1h 30m". It returns null for those, so the caller
// can try reading them as a wait instead.

const { nextOpening, zonedDateParts, addDays, zonedInstant } = require('./timeUtils');

// The words for days, and what each one means:
//   a number is a day of the week (0 is Sunday, 6 is Saturday)
//   'today' and 'tomorrow' are those days
// (A Map is used so that odd words like "constructor" are never mistaken for a day.)
const DAY_WORDS = new Map([
  ['today', 'today'],
  ['tonight', 'today'],
  ['tomorrow', 'tomorrow'],
  ['sunday', 0], ['sun', 0],
  ['monday', 1], ['mon', 1],
  ['tuesday', 2], ['tues', 2], ['tue', 2],
  ['wednesday', 3], ['weds', 3], ['wed', 3],
  ['thursday', 4], ['thurs', 4], ['thur', 4], ['thu', 4],
  ['friday', 5], ['fri', 5],
  ['saturday', 6], ['sat', 6],
]);

// Little words that mean nothing here, so "7:20pm on saturday" is the same as "7:20pm saturday".
const FILLER_WORDS = new Set(['on', 'at', 'next', 'this', 'coming', 'the']);

// Reads a clock time like "7:20pm", "19:20", "9am", "noon" and returns minutes since midnight
// (7:20pm is 1160). Returns null if it is not a valid clock time.
function parseClock(text) {
  if (text === 'noon') return 12 * 60;
  if (text === 'midnight') return 0;

  // Hours, optional minutes (after a : or a .), and an optional am or pm.
  const match = text.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const suffix = match[3];
  if (minutes > 59) return null;

  if (suffix) {
    // With am or pm, the hour must be 1 to 12. 12am is midnight and 12pm is noon.
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (suffix === 'pm' ? 12 : 0);
  } else if (hours > 23) {
    return null; // without am or pm it is the 24 hour clock, which stops at 23
  }

  return hours * 60 + minutes;
}

// Works out the moment someone means.
//   text      what they typed
//   now       the current time in milliseconds
//   timeZone  the time zone the clock times are in, like 'Europe/London'
// Returns:
//   null            it is not a clock time or a day (the caller can try something else)
//   { atMs }        the moment they mean
//   { error: 'past' }   they said "today" with a time that has already gone by
function parseWhen(text, now, timeZone) {
  // Tidy the text: lower case, commas become spaces, then split into words and drop the filler.
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && !FILLER_WORDS.has(word));

  // There can be at most one day word ("saturday sunday 7pm" makes no sense).
  const dayWords = words.filter((word) => DAY_WORDS.has(word));
  if (dayWords.length > 1) return null;

  // Whatever is left must be a clock time.
  const clock = parseClock(words.filter((word) => !DAY_WORDS.has(word)).join(' '));
  if (clock === null) return null;

  // No day given: the next time the clock reads that, whether that is later today or tomorrow.
  if (dayWords.length === 0) return { atMs: nextOpening(now, clock, timeZone) };

  const day = DAY_WORDS.get(dayWords[0]);
  const today = zonedDateParts(now, timeZone);

  // The moment the clock reads that time, a number of days from today.
  const onDayNumber = (daysAhead) => {
    const date = addDays(today, daysAhead);
    return zonedInstant(date.year, date.month, date.day, clock, timeZone);
  };

  if (day === 'today') {
    const atMs = onDayNumber(0);
    return atMs > now ? { atMs } : { error: 'past' };
  }

  if (day === 'tomorrow') return { atMs: onDayNumber(1) };

  // A day of the week: the next time it comes round. If it is that day today but the time
  // has already gone, it means the same day next week.
  let daysAhead = (day - today.weekday + 7) % 7;
  let atMs = onDayNumber(daysAhead);
  if (atMs <= now) {
    daysAhead += 7;
    atMs = onDayNumber(daysAhead);
  }

  return { atMs };
}

module.exports = { parseWhen, parseClock };
