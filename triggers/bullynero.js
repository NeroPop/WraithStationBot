// triggers/bullynero.js
//
// A chat trigger. Whenever someone says "bully nero", the bot replies with one of the
// messages in the list below, all along the lines of "don't bully Nero".
//
//   Someone types:  "let's bully nero"     The bot replies:  "Be nice to Nero!"  (or another from the list)
//
// - Capital letters do not matter ("BULLY NERO" works too).
// - The bot never gives the same answer twice in a row.
// - The bot replies to the message without pinging the person.
//
// To add, remove or change an answer, just edit the list below. Each answer is one line in
// quote marks, followed by a comma.

// ---- The answers (one is picked at random) -------------------------------
const REPLIES = [
  "Don't bully Nero.",
  'Hey! No bullying Nero in here.',
  'Be nice to Nero!',
  'Nero has feelings too, you know.',
  "Leave Nero alone, he's doing his best.",
  'Not on my watch. Nero is protected.',
  'Can we please not bully Nero?',
  'Nero deserves kindness (and a cup of tea).',
  'Bullying Nero is against the rules. I just made that rule.',
  'Put the bully hat down and walk away from Nero.',
  'Nero is under JesterStation protection.',
  'No. Nero stays unbullied.',
  'Bully Nero? Absolutely not.',
  "Imagine bullying Nero. Couldn't be me.",
  'Nero is a sweet summer child. Leave him be.',
  'Bullying Nero? Not in this server.',
  "I will personally defend Nero's honour.",
  'Please direct all bullying away from Nero.',
  'Nero did nothing wrong. Probably.',
  'Nero is off limits.',
  'A wild bully appeared! Nero used Protect.',
  'Back away from Nero... slowly.',
  'Nero is having a nice day. Do not ruin it.',
  'Nero is not available for bullying.',
  'Sir, this is a Nero-friendly zone.',
  'Nero is a treasure. Treat him like one.',
  'We do not bully Nero here. We offer him biscuits.',
  'Nero has a hardworking heart. Be gentle.',
  'Are you sure you want to bully Nero? The bot says no.',
  'Bullying Nero detected. Deploying kindness.',
  'Error 404: reason to bully Nero not found.',
  'Nero is a protected species.',
  'The Nero Protection Squad has been notified.',
  'Nero gets compliments, not bullying.',
  "You wouldn't bully Nero. Would you? ...Would you?",
  'Nero makes the tea, so be nice to him.',
  'Be kind to Nero. He has the kettle.',
  "You wouldn't steal a car. You wouldn't steal a handbag. You wouldn't bully a Nero.",
  'Nero deserves a medal, not mean words.',
  'Nero, you are safe with me. Bullies, begone.',
  'Bullies must leave Nero alone or face the Jester.',
  'The Jester has spoken: no bullying Nero.',
  'By order of JesterStation, bullying Nero is banned.',
  'This message was brought to you by: not bullying Nero.',
  'Nero is one of the good ones.',
  'Nero is cool, and you know it.',
  'How about you say something nice about Nero instead?',
  'Compliment Nero. Do it now.',
  'Nero has been through enough.',
  'I came here to defend Nero and chew bubblegum. And I am all out of bubblegum.',
  'Nero deserves a biscuit. Be nice.',
  'Bullying Nero is not cool. Be cool.',
  'Think of how Nero must feel. Now stop.',
  "Nero is trying his best, and honestly it's working.",
  "Bully Nero again and I'll tell the other bots.",
  'I am a small bot with a big heart, and Nero is under my wing.',
  'Nero is loved here. Remember that.',
  'Who bullies Nero? Not on this server.',
  'We are all friends of Nero here.',
  "Nero smiles, the server smiles. Don't ruin it.",
  'One does not simply bully Nero.',
  'Is it really necessary to bully Nero? I think not.',
  'Bullying Nero will make the tea go cold.',
  'Nero is a legend. Legends do not get bullied.',
  'If you must bully something, bully a spreadsheet. Leave Nero alone.',
];

// The answer we gave last time, so we can avoid repeating it straight away.
let lastReply = null;

module.exports = {
  // The pattern the bot looks for in every message.
  //   \b      means "edge of a word", so "bullynero" and "bully nerotic" do NOT match
  //   \s+     means one or more spaces between the two words
  //   i       means "ignore capital letters"
  pattern: /\bbully\s+nero\b/i,

  // Optional: example messages that "npm run check" uses to test the pattern above.
  examples: {
    shouldMatch: ['bully nero', 'BULLY NERO', "let's bully nero today", 'bully   Nero!'],
    shouldNotMatch: ['bully', 'nero', 'bullynero', 'bully nerotic', 'bully somebody else'],
  },

  // The answers, listed here so "npm run check" can make sure they are sensible.
  replies: REPLIES,

  // Runs when a message matches. "message" is the Discord message that matched.
  async execute(message) {
    // Pick an answer at random, but not the same one as last time (if there is a choice).
    const choices = REPLIES.filter((reply) => reply !== lastReply);
    const reply = choices[Math.floor(Math.random() * choices.length)];
    lastReply = reply;

    // reply() makes a Discord reply to their message.
    // repliedUser: false means the person is NOT pinged by the reply.
    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    });
  },
};
