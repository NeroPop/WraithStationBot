// triggers/sillystaff.js
//
// A chat trigger. Whenever someone says "silly" followed by a staff name,
// the bot posts "Silly [name]" in the same channel.
//
//   Someone types:  "silly steve"     The bot posts:  "Silly Steve"
//
// The staff list comes from the "Staff" tab of the staff spreadsheet, and this trigger keeps
// its cooldown times in that tab's "Last Silly" column. The shared code that does the work
// (reading the sheet, the cooldowns) is in lib/staffTrigger.js, which also explains the rules.
//
// - Each name has its own cooldown. After the bot says "Silly Steve", it will not say it
//   again for that name until the cooldown is over, but "Silly Nero" is still allowed.
//
// To change the cooldown, edit COOLDOWN_MINUTES below.
// To change the names, just edit the spreadsheet. Changes are picked up within 5 minutes.

const { createStaffTrigger } = require('../lib/staffTrigger');

// ---- Settings you might want to change -----------------------------------
const COOLDOWN_MINUTES = 20; // how long before the same name can be said again
const TIME_HEADING = 'Last Silly'; // the sheet column this trigger saves its times in

module.exports = createStaffTrigger({
  phrase: 'silly', // the word to look for before the name
  timeHeading: TIME_HEADING,
  cooldownMinutes: COOLDOWN_MINUTES,

  // What to post for each name. "name" is spelled the way it is in the sheet.
  reply: (name) => `Silly ${name}`,

  // Example messages that "npm run check" uses to test the pattern.
  // (The real name check needs the spreadsheet, so it is not tested here.)
  examples: {
    shouldMatch: ['silly steve', 'SILLY NERO', 'oh you silly goose!'],
    shouldNotMatch: ['silly', 'silly ', 'xsilly steve', 'hello there'],
  },
});
