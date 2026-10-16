// sheets.js
//
// The one place that talks to Google Sheets. Any trigger or command that needs a
// spreadsheet uses this file, so the sign-in code is not repeated.
//
//   const { sheetIds } = require('./config');
//   const { getSheet } = require('./sheets');
//   const sheet = await getSheet(sheetIds.staffList, 'Staff');   // the tab called "Staff"
//
// The sheet IDs are listed in config.js. Signing in needs two secret settings,
// which you add in the Wispbyte Environment tab:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   the "client_email" value from the Google JSON key file
//   GOOGLE_PRIVATE_KEY             the "private_key" value from the Google JSON key file

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// The permission we ask Google for: read and edit spreadsheets, and nothing else.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Tidies up the private key so it works however it was pasted into the Environment tab.
// Google's key file has the line breaks written as the two characters \n. Some
// tools turn those into real line breaks and some keep them, so we handle both.
function normalizePrivateKey(rawKey) {
  const key = String(rawKey)
    .trim()
    .replace(/^["']|["']$/g, '') // remove quote marks around the whole key
    .replace(/\\n/g, '\n'); // turn the two characters \n into a real line break

  // A quick sanity check. We never print the key itself, only whether it looks right.
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      'GOOGLE_PRIVATE_KEY does not look like a private key. It should start with ' +
        '"-----BEGIN PRIVATE KEY-----" and end with "-----END PRIVATE KEY-----".'
    );
  }

  return key;
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

    // JWT is the "robot account" sign-in: the service account's email plus its private key.
    auth = new JWT({ email: email.trim(), key: normalizePrivateKey(rawKey), scopes: SCOPES });
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

// Used when the bot starts, to prove a connection works. Returns the spreadsheet's title.
async function checkConnection(spreadsheetId) {
  const doc = await getDoc(spreadsheetId);
  return doc.title;
}

module.exports = { getSheet, checkConnection, normalizePrivateKey };
