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
const { getSheet, ensureHeadings, appendRow } = require('../lib/sheets');
const { sheetIds } = require('../config'); // the suggestions spreadsheet ID lives in config.js

// ---- Settings you might want to change -----------------------------------
const SHEET_TAB = 'Suggestions'; // the name of the tab at the bottom of the spreadsheet

// The column headings, in order. The bot uses these exact names to place each value.
const HEADINGS = ['Date', 'Suggested By', 'Suggestion', 'Server'];

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
    await ensureHeadings(sheet, HEADINGS); // writes the headings if the tab is empty

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
