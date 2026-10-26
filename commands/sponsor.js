// commands/sponsor.js
//
// The /sponsor command. It posts a shout-out embed for Steve in the channel:
//
//     JesterStation Was brought to you by: SteveStreamsUK !!
//
// with Steve's icon underneath, and a small footer at the bottom of the embed:
//
//     With everything actually being made by Nero.
//
// Everyone in the channel can see it.
//
// To change the wording, the footer, the picture or the colour, change the settings below.
//
// The picture is sent as an attachment, which needs the "Attach Files" permission.
// If the bot does not have it, the shout-out is still posted, just without the picture.

const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');

// ---- Settings you might want to change -----------------------------------
const TEXT = 'JesterStation Was brought to you by: SteveStreamsUK !!'; // the words in the embed
const FOOTER = 'With everything actually being made by Nero.'; // the small text at the bottom of the embed
const IMAGE_PATH = path.join(__dirname, '..', 'images', 'steve', 'steve_icon.png'); // the picture
const COLOR = 0xe2ffcf; // the stripe down the side of the embed

// The error code Discord gives when the bot is missing a permission (here, Attach Files).
const MISSING_PERMISSIONS = 50013;

// Builds the message to post. Pass false to leave the picture out.
function buildMessage(withImage) {
  // The footer belongs on the embed (the card the bot posts), not on the command definition.
  // setFooter() takes an object with the words in "text".
  const embed = new EmbedBuilder().setColor(COLOR).setTitle(TEXT).setFooter({ text: FOOTER });
  const message = { embeds: [embed] };

  if (withImage) {
    const fileName = path.basename(IMAGE_PATH);
    embed.setImage(`attachment://${fileName}`); // show the attached picture inside the embed
    message.files = [new AttachmentBuilder(IMAGE_PATH, { name: fileName })];
  }

  return message;
}

module.exports = {
  // "data" is what Discord shows in its command menu.
  data: new SlashCommandBuilder()
    .setName('sponsor') // must match the file name (sponsor.js)
    .setDescription('Shout out who brought you JesterStation.'),

  // The picture's location, so "npm run check" can make sure the file is really there.
  imagePath: IMAGE_PATH,

  // "execute" runs every time someone uses /sponsor.
  async execute(interaction) {
    // If the picture file is missing, post the shout-out without it instead of failing.
    const hasImage = fs.existsSync(IMAGE_PATH);
    if (!hasImage) console.warn(`The sponsor picture is missing (${IMAGE_PATH}), so /sponsor has no image.`);

    try {
      await interaction.reply(buildMessage(hasImage));
    } catch (error) {
      // Attaching a picture needs the "Attach Files" permission. If that is what is missing,
      // post the shout-out again without the picture so people still see it.
      if (hasImage && error.code === MISSING_PERMISSIONS) {
        console.warn('The bot is missing the Attach Files permission, so /sponsor was posted without a picture.');
        await interaction.reply(buildMessage(false));
        return;
      }

      throw error; // index.js writes the error to the console and tells the user
    }
  },
};
