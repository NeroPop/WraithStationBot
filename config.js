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
  },
};
