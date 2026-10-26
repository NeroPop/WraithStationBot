// triggers/thanksbot.js
//
// A chat trigger. Whenever someone thanks the bot, it replies "You're welcome" and @mentions
// the person who said thanks.
//
//   Someone types:  "thanks bot"     The bot replies:  "You're welcome @TheirName"
//
// These all work (capital letters and a comma do not matter):
//   thanks bot            thanks jester          thank you bot          Thanks, Jester!
//   thank u jester        thx bot                ty bot                 tysm jester
//   thanks so much bot    thanks jesterstation   thanks @JesterStation  (an @mention of the bot works too)
//
// The bot replies to their message and mentions them once, so they get a single notification.
//
// To change the answer, edit REPLY below. To change the names the bot answers to, edit NAMES.

// ---- Settings you might want to change -----------------------------------
// What the bot says. "userId" is the Discord ID of the person who said thanks, and
// <@userId> is how Discord writes an @mention of them.
const REPLY = (userId) => `You're welcome <@${userId}>`;

// The bot's own Discord user ID (it is the same as the application ID). When someone @mentions
// the bot, Discord writes the mention in the message as <@ID>, so this lets "thanks @JesterStation" work.
const BOT_USER_ID = '1560645164807098490';

// The names the bot answers to (as pattern text).
//   bot                    the word "bot"
//   jester(?:\s?station)?  "jester", "jesterstation" or "jester station"
//   <@!?ID>                an @mention of the bot (the ! is added by Discord in some cases)
const NAMES = `(?:bot\\b|jester(?:\\s?station)?\\b|<@!?${BOT_USER_ID}>)`;

// The ways of saying thanks (as pattern text).
//   thank(?:s|\s?(?:you|u))   "thanks", "thank you", "thankyou", "thank u"
//   thx|thnx|tysm|ty          the short forms
//   and an optional "so much", "very much", "a lot" or "a bunch" after any of them
const THANKS =
  '(?:thank(?:s|\\s?(?:you|u))|thx|thnx|tysm|ty)(?:\\s+(?:so\\s+much|very\\s+much|a\\s+lot|a\\s+bunch))?';

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b        at the start means the thanks must begin at the edge of a word, so a word that
  //             merely ends in "ty" (like "party") does NOT match
  //   [\s,]+    means spaces and/or a comma between the thanks and the name
  //   i         means "ignore capital letters"
  pattern: new RegExp(`\\b${THANKS}[\\s,]+${NAMES}`, 'i'),

  // Optional: example messages that "npm run check" uses to test the pattern above.
  examples: {
    shouldMatch: [
      'thanks bot',
      'THANKS BOT',
      'Thanks, Jester!',
      'thanks jester',
      'thank you bot',
      'thank you jester',
      'thank u jester',
      'thankyou bot',
      'thx bot',
      'ty bot',
      'tysm jester',
      'thanks so much bot',
      'thanks a lot jester',
      'thanks jesterstation',
      'thanks jester station',
      'ok that worked, thanks bot',
      `thanks <@${BOT_USER_ID}>`,
      `thank you <@!${BOT_USER_ID}>`,
    ],
    shouldNotMatch: [
      'thanks',
      'thank you',
      'bot',
      'jester',
      'thanks botany',
      'thanks bots',
      'thanks jesters',
      'party bot',
      'bot thanks',
      'thanks nero',
      'thanks <@123456789012345678>',
    ],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    const userId = message.author.id; // the person who said thanks

    // reply() makes a Discord reply to their message.
    //   users: [userId]         lets the @mention in our text notify them (just once)
    //   repliedUser: false      stops the reply itself from notifying them a second time
    //   failIfNotExists: false  if they delete their message first, still post our answer
    await message.reply({
      content: REPLY(userId),
      allowedMentions: { users: [userId], repliedUser: false },
      failIfNotExists: false,
    });
  },
};
