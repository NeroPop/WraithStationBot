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
    teaAlarm: '1gk5Ulsny8FplDDz-ARED0VrTzE9st6lPCa6BGlgcBMA', // the tea alarms that have been set
  },

  // Settings for the random stims (see the stims folder and /stim).
  // Lengths of time are written as a number plus m (minutes), h (hours) or d (days),
  // like '30m', '2h' or '1d'. You can combine them, like '1h 30m'.
  stims: {
    sheetTab: 'Stims', // the name of the tab that holds the channel settings

    // Each session picks one stim and says it this many times (a random number from min to max).
    repeatsPerSession: { min: 1, max: 8 },

    // The wait between repeats inside one session (a random time from min to max).
    // For a channel whose /stim "max" is shorter than this max, that channel's max is used
    // instead (and the min is lowered to match if needed).
    repeatGap: { min: '10m', max: '2h' },

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

  // Settings for the tea alarm (see the /tea command).
  teaAlarm: {
    sheetTab: 'TeaAlarm', // the name of the tab that holds the alarms

    // The person who gets pinged when an alarm goes off (their Discord user ID).
    pingUserId: '150931226767785985',

    // Anyone with one of these roles can use /tea. To allow another role, add its ID to the list
    // (in Discord: Server Settings > Roles > right-click the role > Copy Role ID).
    allowedRoleIds: ['1514769056635289741'],

    // These people can always use /tea, whatever roles they have (Discord user IDs).
    alwaysAllowedUserIds: ['150931226767785985'],

    // After an alarm is set, nobody can set another one for this long (shared by everyone).
    cooldown: '1h',

    // How far ahead an alarm can be set.
    maxAhead: '7d',

    // If the bot was offline when an alarm was due, it still sends it if it is at most this late.
    // After that the alarm is marked "Missed" and nothing is sent.
    lateGrace: '15m',

    // Clock times like 15:30 are read in this time zone (the time zone of the person being pinged).
    timezone: 'Europe/London',

    // The folder of pictures. The bot picks one at random for each alarm.
    imagesFolder: 'images/tea',

    // How often the bot checks whether an alarm is due, in seconds.
    checkEverySeconds: 15,

    // How often the bot re-reads the TeaAlarm sheet, to pick up edits made by hand.
    sheetRefresh: '5m',

    // If an alarm fails to send (for example Discord had a hiccup), try again after this long.
    retryAfterError: '2m',
  },
};
