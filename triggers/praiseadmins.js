// triggers/praiseadmins.js
//
// A chat trigger. Whenever someone says "Praise be the admins", the bot replies
// "For all they do is Divine and Holy!"
//
// If the message ALREADY contains that reply (for example someone typed the whole
// thing themselves), the bot stays quiet so it does not repeat what was just said.
//
// Capital letters and punctuation do not matter, so all of these trigger it:
//   Praise be the admins
//   PRAISE BE THE ADMINS!
//   Praise be, the admins.

// Between every pair of words we allow one or more spaces and/or punctuation marks.
//   \s    means any space
//   \p{P} means any punctuation mark (comma, full stop, exclamation mark, and so on)
const GAP = '[\\s\\p{P}]+';

// The words we trigger on, and the words the bot replies with (written as patterns).
const TRIGGER_WORDS = `\\bpraise${GAP}be${GAP}the${GAP}admins\\b`;
const REPLY_WORDS = `for${GAP}all${GAP}they${GAP}do${GAP}is${GAP}divine${GAP}and${GAP}holy`;

module.exports = {
  // The pattern the bot looks for in every message. It has two parts:
  //   (?!...)  a "not followed by" check. It looks at the WHOLE message and fails
  //            if the reply words are anywhere in it, which is how we stay quiet
  //            when the reply has already been said.
  //   [\s\S]*  means "any characters at all, including line breaks"
  // Flags: i ignores capital letters, u lets \p{P} (punctuation) work.
  pattern: new RegExp(`^(?![\\s\\S]*${REPLY_WORDS})[\\s\\S]*${TRIGGER_WORDS}`, 'iu'),

  // Optional: example messages that "npm run check" uses to test the pattern.
  examples: {
    shouldMatch: [
      'Praise be the admins',
      'PRAISE BE THE ADMINS!',
      'Praise be, the admins.',
      'everyone say it with me: praise be the admins',
    ],
    shouldNotMatch: [
      // The reply has already been said, so the bot stays quiet.
      'Praise be the admins. For all they do is Divine and Holy!',
      'for all they do is divine and holy, praise be the admins',
      // Not the right words.
      'praise be the moderators',
      'praise the admins',
      'hello there',
    ],
  },

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // reply() makes a Discord reply to their message.
    // repliedUser: false means the person is NOT pinged by the reply.
    await message.reply({
      content: 'For all they do is Divine and Holy!',
      allowedMentions: { repliedUser: false },
    });
  },
};
