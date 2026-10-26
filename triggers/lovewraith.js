// triggers/lovewraith.js
//
// A chat trigger. Whenever someone tells Wraith they love them, the bot reacts to that
// message with a heart and a robot: ❤️ 🤖  (two reactions, in that order).
//
// These all work (capital letters and a comma do not matter):
//   ily wraith           ily, wraith           ILY WRAITH
//   ilysm wraith         ilyyy wraith          ilu wraith
//   I love you wraith    i love u wraith       love you, Wraith!
//   luv you wraith       I love you so much wraith
//
// These do NOT work (on purpose): "ily" on its own, "i love you all wraith", "ily wraithstation".
//
// To change the reactions, edit the list below. To allow more ways of saying it, edit LOVE.
// The bot needs the "Add Reactions" permission in the channel (it already has this).

// ---- Settings you might want to change -----------------------------------
// The reactions to add, in order. Each one is a single emoji in quote marks.
const REACTIONS = ['❤️', '🤖'];

// The person the love is for. Change this word to change who the bot reacts for.
const NAME = 'wraith';

// The different ways of saying "I love you". Each way is separated by a | ("or").
//   (?:i\s+)?             an optional "i " in front ("love you" works as well as "i love you")
//   (?:love|luv)          "love" or "luv"
//   (?:you|u|ya)          "you", "u" or "ya"
//   ily(?:sm|y*)          "ily", "ilysm", or "ilyyy" with any number of extra y's
//   ilu+                  "ilu", or "iluuu" with any number of extra u's
const LOVE =
  '(?:(?:i\\s+)?(?:love|luv)\\s+(?:you|u|ya)(?:\\s+(?:so\\s+much|very\\s+much|lots|a\\s+lot))?|ily(?:sm|y*)|ilu+)';

// Discord error codes where the reaction simply cannot be added, and that is fine:
//   10008  the message was deleted before we could react
//   90001  the person has blocked the bot's reactions
//   30010  the message already has the maximum number of different reactions
const HARMLESS_ERRORS = [10008, 90001, 30010];

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b        means "edge of a word", so "family wraith" (which contains "ily") and
  //             "ily wraithstation" do NOT match
  //   [\s,]+    means spaces and/or a comma between the two parts
  //   i         means "ignore capital letters"
  pattern: new RegExp(`\\b${LOVE}[\\s,]+${NAME}\\b`, 'i'),

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
    ],
    shouldNotMatch: [
      'ily',
      'wraith',
      'ily wraithstation',
      'family wraith',
      'i love you',
      'i love you all wraith',
      'i hate you wraith',
      'ily nero',
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
