// triggers/lovewraith.js
//
// A chat trigger. Whenever someone tells Wraith (or WraithStation) they love them, the bot
// reacts to that message with a heart and a robot: ❤️ 🤖  (two reactions, in that order).
//
// These all work (capital letters and a comma do not matter):
//   ily wraith               ily, wraith              ILY WRAITH
//   ilysm wraith             ilyyy wraith             ilu wraith
//   I love you wraith        i love u wraith          love you, Wraith!
//   luv you wraith           I love you so much wraith
//   i love wraith            I love WraithStation     ily wraithstation
//   ily @Wraith              I love you @Wraith       (an @mention of Wraith works too)
//
// These do NOT work (on purpose): "ily" on its own, "i love you all wraith", "ily wraiths",
// "i don't love wraith", and "wraith ily" (the love comes first, then the name).
//
// To change the reactions, edit the list below. To allow more ways of saying it, edit the
// patterns below. The bot needs the "Add Reactions" permission in the channel (it already has this).

// ---- Settings you might want to change -----------------------------------
// The reactions to add, in order. Each one is a single emoji in quote marks.
const REACTIONS = ['❤️', '🤖'];

// Wraith's Discord user ID. When someone @mentions Wraith, Discord writes the mention in the
// message as <@ID>, so this lets "ily @Wraith" work too.
const WRAITH_USER_ID = '397461051827814411';

// Who the love is for: "wraith", "wraithstation" or "wraith station", or an @mention of Wraith.
//   \b        means "edge of a word", so "wraiths" does NOT match
//   <@!?ID>   an @mention (the ! is added by Discord in some cases, so it is optional)
const TARGET = `(?:wraith(?:\\s?station)?\\b|<@!?${WRAITH_USER_ID}>)`;

// Ways of saying "I love YOU" (these need the word "you", "u" or "ya", or a short form like ily).
//   (?:i\s+)?             an optional "i " in front ("love you" works as well as "i love you")
//   (?:love|luv)          "love" or "luv"
//   (?:you|u|ya)          "you", "u" or "ya"
//   ily(?:sm|y*)          "ily", "ilysm", or "ilyyy" with any number of extra y's
//   ilu+                  "ilu", or "iluuu" with any number of extra u's
const LOVE_YOU =
  '(?:(?:i\\s+)?(?:love|luv)\\s+(?:you|u|ya)(?:\\s+(?:so\\s+much|very\\s+much|lots|a\\s+lot))?|ily(?:sm|y*)|ilu+)';

// Ways of saying "I love [name]" without the word "you", like "i love wraith".
// This one needs the "i" at the start, so "i don't love wraith" or "they love wraith" do not count.
const LOVE_DIRECT = '(?:i\\s+(?:love|luv))';

// Discord error codes where the reaction simply cannot be added, and that is fine:
//   10008  the message was deleted before we could react
//   90001  the person has blocked the bot's reactions
//   30010  the message already has the maximum number of different reactions
const HARMLESS_ERRORS = [10008, 90001, 30010];

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b        at the very start means the love must begin at the edge of a word, so
  //             "family wraith" (which contains "ily") does NOT match
  //   [\s,]+    means spaces and/or a comma between the love and the name
  //   i         means "ignore capital letters"
  pattern: new RegExp(`\\b(?:${LOVE_YOU}|${LOVE_DIRECT})[\\s,]+${TARGET}`, 'i'),

  // Optional: example messages that "npm run check" uses to test the pattern above.
  examples: {
    shouldMatch: [
      'ily wraith',
      'ILY WRAITH',
      'ily, wraith',
      'ilysm wraith',
      'ilyyy wraith',
      'ilu wraith',
      'I love you wraith',
      'i love you, Wraith!',
      'love you wraith',
      'i love u wraith',
      'luv you wraith',
      'I love you so much wraith',
      'well ily wraith lol',
      'i love wraith',
      'I love WraithStation',
      'ily wraithstation',
      'ily wraith station',
      'i luv WraithStation',
      `ily <@${WRAITH_USER_ID}>`,
      `I love you <@!${WRAITH_USER_ID}>`,
    ],
    shouldNotMatch: [
      'ily',
      'wraith',
      'family wraith',
      'i love you',
      'i love you all wraith',
      'i hate you wraith',
      'ily nero',
      'ily wraiths',
      'ily wraithstations',
      "i don't love wraith",
      'they love wraith',
      'wraith ily',
      'i love nero',
      'ily <@123456789012345678>',
    ],
  },

  // The reactions, listed here so "npm run check" and the tests can see them.
  reactions: REACTIONS,

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    for (const emoji of REACTIONS) {
      try {
        await message.react(emoji); // adds the reaction, one after the other
      } catch (error) {
        // Some problems are harmless (the message was deleted, for example). Stop quietly.
        if (HARMLESS_ERRORS.includes(error.code)) return;

        throw error; // anything else is written to the console by index.js
      }
    }
  },
};
