// triggers/goodjob.js
//
// A chat trigger. Whenever someone says "good job" followed by a staff name,
// the bot posts "Good job [name] smile" in the same channel (the word "smile", not an emoji).
//
//   Someone types:  "good job steve"     The bot posts:  "Good job Steve smile"
//   Someone types:  "Good job, Nero!"    The bot posts:  "Good job Nero smile"
//
// It works exactly like the "silly" trigger. The staff list comes from the "Staff" tab of the
// staff spreadsheet, and this trigger keeps its OWN cooldown times in a separate column,
// "Last Good Job", so it never interferes with the silly trigger's cooldown.
// The shared code that does the work is in staffTrigger.js, which also explains the rules.
//
// IMPORTANT: the Staff tab needs a column headed "Last Good Job" in row 1 (next to "Last Silly").
//
// To change the cooldown or the last word, edit the settings below.
// To change the names, just edit the spreadsheet. Changes are picked up within 5 minutes.

const { createStaffTrigger } = require('../staffTrigger');

// ---- Settings you might want to change -----------------------------------
const COOLDOWN_MINUTES = 20; // how long before the same name can get a "good job" again
const TIME_HEADING = 'Last Good Job'; // the sheet column this trigger saves its times in
const SMILE = 'smile'; // the word the bot adds after the name (written out, not an emoji)

module.exports = createStaffTrigger({
  phrase: 'good job', // the words to look for before the name
  gap: ',?\\s+', // between "good job" and the name: spaces, with an optional comma ("good job, Steve")
  timeHeading: TIME_HEADING,
  cooldownMinutes: COOLDOWN_MINUTES,

  // What to post for each name. "name" is spelled the way it is in the sheet.
  reply: (name) => `Good job ${name} ${SMILE}`,

  // Example messages that "npm run check" uses to test the pattern.
  // (The real name check needs the spreadsheet, so it is not tested here.)
  examples: {
    shouldMatch: ['good job steve', 'Good Job, Nero!', 'GOOD JOB   wraith', 'wow good job everyone'],
    shouldNotMatch: ['good job', 'good job ', 'goodjob steve', 'xgood job steve', 'good jobs steve', 'hello there'],
  },
});
