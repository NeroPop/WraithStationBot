// triggers/ohnowraith.js
//
// A chat trigger. Whenever someone says "Oh no, not Wraith from WraithStation",
// the bot replies "Who will host the Minecraft Gauntlet now? :("
//
// Punctuation and capital letters do not matter, so all of these work:
//   Oh no, not Wraith from WraithStation
//   oh no... NOT wraith from wraithstation!
//   Oh no! Not Wraith from Wraith Station

// Between every pair of words we allow one or more spaces and/or punctuation marks.
//   \s   means any space
//   \p{P} means any punctuation mark (comma, full stop, exclamation mark, and so on)
// Putting them in square brackets with a + means "any mix of these, one or more times".
const GAP = '[\\s\\p{P}]+';

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b   means "edge of a word", so it will not match in the middle of another word
  //   wraith\s?station   allows "WraithStation" and "Wraith Station"
  //   i    means "ignore capital letters"
  //   u    means "understand Unicode", which \p{P} needs in order to work
  pattern: new RegExp(
    `\\boh${GAP}no${GAP}not${GAP}wraith${GAP}from${GAP}wraith\\s?station\\b`,
    'iu'
  ),

  // Optional: example messages that "npm run check" uses to test the pattern.
  examples: {
    shouldMatch: [
      'Oh no, not Wraith from WraithStation',
      'oh no... NOT wraith from wraithstation!',
      'OH NO NOT WRAITH FROM WRAITHSTATION',
      'Oh no! Not Wraith from Wraith Station',
      'well, oh no - not Wraith from WraithStation?!',
    ],
    shouldNotMatch: [
      'oh no not wraith',
      'not wraith from wraithstation',
      'oh yes not wraith from wraithstation',
      'ohno notwraith fromwraithstation',
      'hello there',
    ],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // reply() makes a Discord reply to their message.
    // repliedUser: false means the person is NOT pinged by the reply.
    await message.reply({
      content: 'Who will host the Minecraft Gauntlet now? :(',
      allowedMentions: { repliedUser: false },
    });
  },
};
