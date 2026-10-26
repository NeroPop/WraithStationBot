// triggers/whattime.js
//
// A chat trigger. The bot watches normal messages and, whenever someone says
// "what time", it replies "Time you got a watch".
//
// This file is a good template for new triggers:
//   1. Copy it and rename it.
//   2. Change the pattern to the words you want to react to.
//   3. Change what happens inside execute().
//   4. Push to GitHub and restart the bot's server.

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b      means "edge of a word", so "what timeline" does NOT match
  //   i       means "ignore capital letters", so "What Time" matches too
  pattern: /\bwhat time\b/i,

  // Optional: example messages that "npm run check" uses to test the pattern.
  examples: {
    shouldMatch: ['what time is it', 'So WHAT TIME do we start?', 'what time'],
    shouldNotMatch: ['what timeline is this', 'whattime', 'hello there'],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // reply() makes a Discord reply to their message.
    // repliedUser: false means the person is NOT pinged by the reply.
    await message.reply({
      content: 'Time you got a watch',
      allowedMentions: { repliedUser: false },
    });
  },
};
