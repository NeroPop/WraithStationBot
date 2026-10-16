// triggers/goldenapple.js
//
// A chat trigger. Whenever someone says "golden apple", the bot replies
// "*coveted* golden apple" (the stars make "coveted" italic in Discord).
//
// If the word "coveted" already appears BEFORE "golden apple" in the message,
// the bot stays quiet, because the joke has already been made.
//
// What triggers it:
//   I found a golden apple        (capital letters do not matter)
//   golden apples                 (plural works too)
//   golden-apple                  (a hyphen works too)
//
// What does NOT trigger it:
//   coveted golden apple          ("coveted" came first)
//   a very coveted, shiny golden apple
//   golden delicious apple        (other words in between)

// Between "golden" and "apple" we allow spaces or a hyphen, but not other
// punctuation. That way "it was golden. Apple pie is nice" does not trigger it.
const GAP = '[\\s-]+';

// The words we trigger on. "apples?" means the "s" is optional.
const TRIGGER_WORDS = `\\bgolden${GAP}apples?\\b`;

module.exports = {
  // The pattern the bot looks for in every message. It has two parts:
  //   (?!...)  a "not followed by" check. It fails if the word "coveted" shows up
  //            somewhere BEFORE "golden apple". If "coveted" only comes after,
  //            the check passes and the bot still replies.
  //   [\s\S]*  means "any characters at all, including line breaks"
  // The i flag ignores capital letters.
  pattern: new RegExp(`^(?![\\s\\S]*\\bcoveted\\b[\\s\\S]*${TRIGGER_WORDS})[\\s\\S]*${TRIGGER_WORDS}`, 'i'),

  // Optional: example messages that "npm run check" uses to test the pattern.
  examples: {
    shouldMatch: [
      'golden apple',
      'I found a Golden Apple!',
      'GOLDEN APPLES',
      'golden-apple',
      // "coveted" comes AFTER the golden apple, so the bot still replies.
      'the golden apple is coveted',
    ],
    shouldNotMatch: [
      // "coveted" comes BEFORE the golden apple, so the bot stays quiet.
      'coveted golden apple',
      '*coveted* golden apple',
      'Coveted Golden Apple',
      'a very coveted, shiny golden apple',
      // Not the right words.
      'red apple',
      'golden delicious apple',
      'goldenapple',
    ],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // reply() makes a Discord reply to their message.
    // repliedUser: false means the person is NOT pinged by the reply.
    await message.reply({
      content: '*coveted* golden apple',
      allowedMentions: { repliedUser: false },
    });
  },
};
