// config.js
//
// Settings that are NOT secret and may be shared on GitHub.
// (Secrets like the bot token and Google key stay in the Wispbyte Environment tab.)

module.exports = {
  // The Google Sheets the bot uses. To add a new one for a future feature:
  //   1. Share the spreadsheet with the service account's email (as Editor).
  //   2. Add a line below: a short name, then the sheet's ID.
  //      The ID is the part of the web address between "/d/" and "/edit".
  //   3. In your code, use it like:  getSheet(sheetIds.myNewSheet, 'Tab name')
  sheetIds: {
    staffList: '15ZoVXK1YLt-gTEl6zN6V5MlGc0ANxjf76Tt0lZM0hP4', // the "silly [name]" staff list
    suggestions: '1I5r0n5g4e-aa7sU8iMAKDQ1348p7an0eJ-gdpGj0AYY', // feature suggestions from /feature
    stims: '1zX-fG0ad6DKou_3uOTeUshrcVDDa0Xi4GqBQ8xZyqPA', // which channels stim, and their schedules
  },

  // Settings for the random stims (see the stims folder and /stim).
  // Lengths of time are written as a number plus m (minutes), h (hours) or d (days),
  // like '30m', '2h' or '1d'. You can combine them, like '1h 30m'.
  stims: {
    sheetTab: 'Stims', // the name of the tab that holds the channel settings

    // Each session picks one stim and says it this many times (a random number from min to max).
    repeatsPerSession: { min: 1, max: 5 },

    // The wait between repeats inside one session (a random time from min to max).
    repeatGap: { min: '30m', max: '2h' },

    // When a session starts at the opening time (for example 10:00), the bot waits a
    // random extra amount up to this long, so it is not exactly on the dot. Use '0m' for none.
    startJitter: '30m',

    // The time zone used when /stim set does not say one.
    defaultTimezone: 'Europe/London',

    // The shortest and longest "gap between sessions" that /stim set will accept.
    sessionGapLimits: { min: '1m', max: '60d' },

    // How often the bot checks whether a stim is due, in seconds.
    checkEverySeconds: 30,

    // How often the bot re-reads the Stims sheet, to pick up edits made by hand.
    sheetRefresh: '5m',

    // If the bot was offline and a stim is overdue by more than this, it counts as "missed".
    // The bot then does one catch-up stim and starts a fresh session.
    missedAfter: '5m',

    // If a stim fails to send (for example Discord had a hiccup), try again after this long.
    retryAfterError: '5m',
  },
};
