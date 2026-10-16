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

// Used when the bot starts, to prove a connection works. Returns the spreadsheet's title.
async function checkConnection(spreadsheetId) {
  const doc = await getDoc(spreadsheetId);
  return doc.title;
}

module.exports = { getSheet, checkConnection, normalizePrivateKey };
