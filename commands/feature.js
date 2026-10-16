// commands/feature.js
//
// The /feature command. Someone types /feature and then their idea, and the bot saves
// it as a new row in the "Suggestions" tab of the suggestions spreadsheet:
//
//     Date  |  Suggested By  |  Suggestion  |  Server
//
// - "Suggested By" is the person's Discord username (it never changes, unlike nicknames).
// - The reply is private, so only the person who sent the suggestion sees it.
// - The text is saved exactly as typed. It is never treated as a spreadsheet formula,
//   so something like =IMPORTXML(...) just shows up as text.
// - If the sheet is completely empty, the bot adds the column headings itself.
// - If the tab is formatted as a Google Sheets table, new rows are added inside the table.
// - Extra columns you add yourself (such as "Wraith Approved?") are left alone and empty.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getSheet, appendRow } = require('../sheets');
const { sheetIds } = require('../config'); // the suggestions spreadsheet ID lives in config.js

// ---- Settings you might want to change -----------------------------------
const SHEET_TAB = 'Suggestions'; // the name of the tab at the bottom of the spreadsheet

// The column headings, in order. The bot uses these exact names to place each value.
const HEADINGS = ['Date', 'Suggested By', 'Suggestion', 'Server'];

// Remembers whether we have already checked the headings since the bot started,
// so we only do that check once instead of on every suggestion.
let headingsChecked = false;

// Makes sure row 1 of the sheet has the headings we need.
//   - If row 1 is completely empty, we write the headings in.
//   - If row 1 already has headings, we check that ours are all there.
async function ensureHeadings(sheet) {
  if (headingsChecked) return;

  // Read the first four cells of row 1. An empty row comes back as nothing at all.
  const firstRow = (await sheet.getCellsInRange('A1:D1'))?.[0] ?? [];
  const rowIsEmpty = firstRow.every((cell) => String(cell ?? '').trim() === '');

  if (rowIsEmpty) {
    await sheet.setHeaderRow(HEADINGS); // write the headings into row 1
  } else {
    await sheet.loadHeaderRow(); // read the headings that are already there
  }

  // Make sure every heading we need exists, with a clear message if one does not.
  for (const heading of HEADINGS) {
    if (!sheet.headerValues.includes(heading)) {
      throw new Error(`The "${SHEET_TAB}" tab needs a column headed "${heading}" in row 1.`);
    }
  }

  headingsChecked = true;
}

module.exports = {
  // "data" is what Discord shows in its command menu.
  data: new SlashCommandBuilder()
    .setName('feature') // must match the file name (feature.js)
    .setDescription('Suggest a feature for the bot.')
    .addStringOption((option) =>
      option
        .setName('suggestion') // the box that appears after typing /feature
        .setDescription('Your idea, in a sentence or two.')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(1000)
    ),

  // "execute" runs every time someone uses /feature.
  async execute(interaction) {
    // Saving to Google takes a moment, and Discord only waits 3 seconds for a reply.
    // deferReply() tells Discord "working on it" first. Ephemeral means only the
    // person who used the command can see the reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const suggestion = interaction.options.getString('suggestion', true).trim();

    const sheet = await getSheet(sheetIds.suggestions, SHEET_TAB);
    await ensureHeadings(sheet);

    // Add one new row at the bottom. The names on the left are the column headings.
    // appendRow() puts the row inside the Google Sheets table if the tab has one (so the
    // table grows), and saves the text exactly as typed so it can never run as a formula.
    // Columns we do not mention here (like "Wraith Approved?") are left empty.
    await appendRow(sheetIds.suggestions, SHEET_TAB, {
      Date: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', // 2026-10-16 20:15 UTC
      'Suggested By': interaction.user.username,
      Suggestion: suggestion,
      Server: interaction.guild?.name ?? 'Direct message',
    });

    await interaction.editReply('Thanks! Your suggestion has been saved.');
  },
};
