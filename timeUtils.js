// timeUtils.js
//
// Helpers for reading and showing times, plus the "is it inside the active hours?" maths.
// Used by the /stim command and the stim scheduler. Nothing in here talks to Discord or Google.
//
// Three kinds of time are handled:
//   - lengths of time:  "30m", "2h", "1d 12h"   (parseDuration / formatDuration)
//   - times of day:     "10", "10:30", "22:00"  (parseTimeOfDay / formatTimeOfDay)
//   - time zones:       "Europe/London"         (resolveTimeZone)

// How many milliseconds are in each unit.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The spellings we accept for each unit, and which unit they mean.
const UNIT_SPELLINGS = {
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
};

// ---- Lengths of time -----------------------------------------------------

// Turns text like "30m", "2h", "1d" or "1h 30m" into milliseconds.
// Returns null if the text is not a valid length of time.
// Zero is refused unless you pass { allowZero: true }.
function parseDuration(text, { allowZero = false } = {}) {
  const input = String(text ?? '').trim().toLowerCase();
  if (input === '') return null;

  // Each piece is a number followed by a unit, like "1.5h". The "y" (sticky) flag makes
  // the pattern match exactly at lastIndex, so we can walk along the text piece by piece.
  const piece = /(\d+(?:\.\d+)?)\s*([a-z]+)/y;

  let total = 0;
  let position = 0;

  while (position < input.length) {
    piece.lastIndex = position;
    const match = piece.exec(input);
    if (!match || !(match[2] in UNIT_SPELLINGS)) return null; // not a number plus a known unit

    total += Number(match[1]) * UNIT_SPELLINGS[match[2]];
    position = piece.lastIndex;

    while (input[position] === ' ') position++; // allow spaces between pieces
  }

  const ms = Math.round(total);
  if (ms < 0 || (ms === 0 && !allowZero)) return null;
  return ms;
}

// Turns milliseconds into short text like "30m", "2h" or "1d 12h".
// parseDuration() can read this text back, so it is safe to store in the spreadsheet.
function formatDuration(ms) {
  let minutes = Math.round(ms / MINUTE);

  const days = Math.floor(minutes / 1440);
  minutes -= days * 1440;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

// ---- Times of day --------------------------------------------------------

// Turns "10", "10:30" or "22:00" into minutes since midnight (10:30 becomes 630).
// It uses the 24 hour clock. Returns null if the text is not a valid time.
function parseTimeOfDay(text) {
  // Optional seconds are allowed (like "10:00:00") because Google Sheets sometimes adds them.
  const match = String(text ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

// Turns minutes since midnight back into text like "10:30".
function formatTimeOfDay(minutesSinceMidnight) {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ---- Time zones ----------------------------------------------------------

// Checks a time zone name like "Europe/London" and returns its correct spelling,
// or null if there is no such time zone.
function resolveTimeZone(name) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: String(name).trim() }).resolvedOptions().timeZone;
  } catch (error) {
    return null; // Intl throws an error for names it does not know
  }
}

// Building a time formatter is slow, so we keep one per time zone and reuse it.
const formatters = new Map();

// What time is it on the clock in that time zone, as minutes since midnight?
// (For example 10:30 in London is 630, whatever the server's own clock says.)
function localMinutes(ms, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    );
  }

  const parts = formatters.get(timeZone).formatToParts(new Date(ms));
  const hours = Number(parts.find((part) => part.type === 'hour').value) % 24;
  const minutes = Number(parts.find((part) => part.type === 'minute').value);
  return hours * 60 + minutes;
}

// Writes a moment as a 24 hour clock time in a time zone, like "15:30".
// With withDate set it also shows the day, like "Mon 26 Oct, 15:30".
// (Discord's own timestamps switch between 12 and 24 hour depending on each person's
// language setting, so this gives a time that always reads the same way.)
function formatClock(ms, timeZone, withDate = false) {
  const options = { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (withDate) Object.assign(options, { weekday: 'short', day: 'numeric', month: 'short' });
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(ms));
}

// ---- Active hours --------------------------------------------------------
// "Active hours" are a daily window, such as 10:00 to 22:00. The start is included and
// the end is not. A window can cross midnight (22:00 to 02:00). If the start and end are
// the same, the window is the whole day.

// Is this moment inside the active hours?
function isWithinActive(ms, from, until, timeZone) {
  if (from === until) return true;

  const now = localMinutes(ms, timeZone);
  if (from < until) return now >= from && now < until;
  return now >= from || now < until; // the window crosses midnight
}

// How long the daily window is, in minutes.
function windowMinutes(from, until) {
  return from === until ? 1440 : (until - from + 1440) % 1440;
}

// The next moment (after the given time) when the active hours open.
function nextOpening(ms, from, timeZone) {
  const minuteStart = ms - (ms % MINUTE);

  // How many minutes until the clock next reads the opening time?
  let delta = (from - localMinutes(minuteStart, timeZone) + 1440) % 1440;
  if (delta === 0) delta = 1440;

  let candidate = minuteStart + delta * MINUTE;

  // Clocks changing for summer or winter time can leave us an hour out, so
  // check the clock at our answer and nudge it until it matches.
  for (let attempt = 0; attempt < 3; attempt++) {
    let difference = from - localMinutes(candidate, timeZone);
    if (difference > 720) difference -= 1440;
    if (difference < -720) difference += 1440;
    if (difference === 0) break;
    candidate += difference * MINUTE;
  }

  return candidate;
}

module.exports = {
  MINUTE,
  HOUR,
  DAY,
  parseDuration,
  formatDuration,
  parseTimeOfDay,
  formatTimeOfDay,
  resolveTimeZone,
  localMinutes,
  formatClock,
  isWithinActive,
  windowMinutes,
  nextOpening,
};
