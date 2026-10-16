// sheets.js
//
// The one place that talks to Google Sheets. Any trigger or command that needs a
// spreadsheet uses this file, so the sign-in code is not repeated.
//
//   const { sheetIds } = require('./config');
//   const { getSheet } = require('./sheets');
//   const sheet = await getSheet(sheetIds.staffList, 'Staff');   // the tab called "Staff"
//   await appendRow(sheetIds.suggestions, 'Suggestions', { ... }); // add a row at the bottom
//
// The sheet IDs are listed in config.js. Signing in needs two secret settings,
// which you add in the Wispbyte Environment tab:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   the "client_email" value from the Google JSON key file
//   GOOGLE_PRIVATE_KEY             the "private_key" value from the Google JSON key file

const { createPrivateKey } = require('node:crypto'); // used to test that the private key is readable
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// The permission we ask Google for: read and edit spreadsheets, and nothing else.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Tidies up the private key so it works however it was pasted into the Environment tab.
//
// Google's key file writes the line breaks as the two characters \n. Depending on how
// the key was pasted, it may arrive with real line breaks, with \n, with doubled \\n,
// or with stray quote marks, commas or spaces around it. Instead of guessing which,
// this pulls out only the part between the BEGIN and END lines, throws away everything
// that is not allowed in a key, and rebuilds it in the exact shape Google's tools expect.
function normalizePrivateKey(rawKey) {
  // Find the part between the BEGIN and END lines.
  const found = String(rawKey).match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!found) {
    throw new Error(
      'GOOGLE_PRIVATE_KEY does not look like a private key. It should contain ' +
        '"-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----".'
    );
  }

  // Inside, a key only ever contains letters, numbers, + / and =.
  // First remove every \n marker (one or more backslashes followed by n), then
  // remove anything else that does not belong (spaces, quotes, commas, real line breaks).
  const body = found[1].replace(/\\+n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');

  // A whole key has a length that divides by 4 (and is about 1600 characters long).
  // If not, part of it went missing when it was copied. We say how long it is, but never
  // print the key itself.
  if (body.length === 0 || body.length % 4 !== 0) {
    throw new Error(
      `GOOGLE_PRIVATE_KEY looks cut off or damaged (its middle part is ${body.length} characters, ` +
        'and a whole key has about 1600). Copy it again from the Google JSON file.'
    );
  }

  // Rebuild it with a line break every 64 characters, which is the standard layout.
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

// The robot account's sign-in. It is the same for every spreadsheet, so we make it once.
let auth = null;

function getAuth() {
  if (!auth) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;

    // Tell the user exactly which settings are missing.
    const missing = [];
    if (!email) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!rawKey) missing.push('GOOGLE_PRIVATE_KEY');
    if (missing.length > 0) {
      throw new Error(`Google Sheets is not set up. Missing in the Environment tab: ${missing.join(', ')}`);
    }

    const key = normalizePrivateKey(rawKey);

    // Test the key right now, on this computer, before involving Google. If it cannot be
    // read, we say so clearly instead of showing a confusing "DECODER" error later.
    try {
      createPrivateKey(key);
    } catch (error) {
      throw new Error(
        'GOOGLE_PRIVATE_KEY has the right start and end but the middle part is damaged, so it ' +
          'cannot be read. Copy it again from the "private_key" line of the Google JSON file.'
      );
    }

    // JWT is the "robot account" sign-in: the service account's email plus its private key.
    auth = new JWT({ email: email.trim(), key, scopes: SCOPES });
  }

  return auth;
}

// The remembered connections, one per spreadsheet. Opening a spreadsheet is slow (about
// a second), so we only do it once per spreadsheet and keep the result.
//   key: the spreadsheet's ID    value: the connection (or the attempt to connect)
const connections = new Map();

// Opens a spreadsheet by its ID.
async function connect(spreadsheetId) {
  const doc = new GoogleSpreadsheet(spreadsheetId, getAuth());
  await doc.loadInfo(); // downloads the spreadsheet's title and list of tabs
  return doc;
}

// Returns the connected spreadsheet. If connecting fails, we forget the failure so
// the next call tries again (useful if the internet blipped or settings were fixed).
function getDoc(spreadsheetId) {
  if (!connections.has(spreadsheetId)) {
    const attempt = connect(spreadsheetId).catch((error) => {
      connections.delete(spreadsheetId);
      throw error;
    });
    connections.set(spreadsheetId, attempt);
  }

  return connections.get(spreadsheetId);
}

// Returns one tab of a spreadsheet, found by its name (the text on the tab at the bottom).
async function getSheet(spreadsheetId, tabName) {
  const doc = await getDoc(spreadsheetId);

  // If the tab is not in our remembered list, refresh the list once in case it was just created.
  if (!doc.sheetsByTitle[tabName]) await doc.loadInfo();

  const sheet = doc.sheetsByTitle[tabName];
  if (!sheet) {
    const found = Object.keys(doc.sheetsByTitle).join(', ');
    throw new Error(`The spreadsheet "${doc.title}" has no tab called "${tabName}". Tabs found: ${found}`);
  }

  return sheet;
}

// ---- Adding rows ---------------------------------------------------------
// Google Sheets can turn a block of cells into a "table" (Format > Convert to table).
// A table only grows if rows are added in a table-aware way. The simple "add a row at
// the bottom" method does NOT know about tables, so the new row would land just below
// the table instead of inside it. appendRow() below handles both cases.

// Looks for a table on the given tab that has every column we want to fill in.
// Returns the table's details, or null if the tab has no suitable table.
async function findTable(spreadsheetId, sheet, headings) {
  // Ask Google for a short summary of the spreadsheet: just each tab's ID and its tables.
  // ("fields" limits the answer to the bits we need.)
  const response = await getAuth().request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    params: { fields: 'sheets(properties(sheetId),tables(tableId,columnProperties(columnIndex,columnName)))' },
  });

  const thisTab = (response.data.sheets ?? []).find((tab) => tab.properties.sheetId === sheet.sheetId);

  // Pick the first table that contains a column for every heading we are writing.
  return (
    (thisTab?.tables ?? []).find((table) => {
      const columnNames = (table.columnProperties ?? []).map((column) => column.columnName);
      return headings.every((heading) => columnNames.includes(heading));
    }) ?? null
  );
}

// Adds one row INSIDE a table, so the table grows to include it.
// Any table columns we have no value for (such as extra tick boxes you added) are left empty.
async function appendToTable(spreadsheetId, table, valuesByHeading) {
  // Put the values in the table's column order.
  const columns = [...table.columnProperties].sort((a, b) => a.columnIndex - b.columnIndex);

  // stringValue saves the text exactly as typed. It is never treated as a formula.
  // An empty cell ({}) is left blank.
  const cells = columns.map((column) => {
    const value = valuesByHeading[column.columnName];
    return value === undefined || value === '' ? {} : { userEnteredValue: { stringValue: String(value) } };
  });

  await getAuth().request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    method: 'POST',
    data: {
      requests: [
        {
          // appendCells with a tableId adds the row to the end of that table's body.
          // "fields" says we only set values, so any dropdowns or tick boxes stay as they are.
          appendCells: { tableId: table.tableId, rows: [{ values: cells }], fields: 'userEnteredValue' },
        },
      ],
    },
  });
}

// Adds one new row to the bottom of a tab. Pass the values keyed by column heading:
//   await appendRow(sheetIds.suggestions, 'Suggestions', { Date: '...', Suggestion: '...' });
// If the tab contains a Google Sheets table, the row goes inside it (and the table grows).
// Otherwise it is added under the data like normal. Text is always saved exactly as typed,
// never as a formula.
async function appendRow(spreadsheetId, tabName, valuesByHeading) {
  const sheet = await getSheet(spreadsheetId, tabName);

  const table = await findTable(spreadsheetId, sheet, Object.keys(valuesByHeading));
  if (table) {
    await appendToTable(spreadsheetId, table, valuesByHeading);
    return;
  }

  await sheet.addRow(valuesByHeading, { raw: true }); // raw: save the text exactly as written
}

// Used when the bot starts, to prove a connection works. Returns the spreadsheet's title.
async function checkConnection(spreadsheetId) {
  const doc = await getDoc(spreadsheetId);
  return doc.title;
}

module.exports = { getSheet, appendRow, checkConnection, normalizePrivateKey };
