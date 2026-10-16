// commands/ping.js
//
// The /ping command. The bot replies "Pong!" so you can tell it is alive.
//
// This file is a good template for new commands:
//   1. Copy it and rename it. The file name MUST match the command name.
//   2. Change the name and description below.
//   3. Change what happens inside execute().
//   4. Push to GitHub and restart the server on Wispbyte.

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  // "data" is what Discord shows in its command menu.
  data: new SlashCommandBuilder()
    .setName('ping') // must match the file name (ping.js)
    .setDescription('Checks that the bot is alive.'),

  // "execute" runs every time someone uses /ping.
  // "interaction" is Discord's object for this one use of the command.
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
