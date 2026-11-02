// triggers/bullynero.js
//
// A chat trigger. Whenever someone talks about being unkind to Nero (bullying him, being mean to
// him, roasting him, putting him in prison and so on), the bot replies with one of the messages
// in the list below, all along the lines of "don't bully Nero".
//
//   Someone types:  "let's bully nero"     The bot replies:  "Be nice to Nero!"  (or another from the list)
//
// HOW IT WORKS
// - TRIGGERS (further down) lists the phrases. A message sets the bot off if it CONTAINS any of them,
//   so "ngl it would be so fun to be mean to nero rn" works as well as "be mean to nero".
//   It does not matter how the sentence starts, so "i dont know lets bully nero" and even
//   "don't bully nero" set it off too (the bot is simply backing the person up).
// - {N} in a phrase stands for Nero's name. It matches nero, neropop and nero pop (any capitals) and a
//   real @mention of him.
// - Capital letters do not matter. The bot never gives the same answer twice in a row.
// - After a reply, the bot stays quiet in that channel for a short while (COOLDOWN_SECONDS).
// - The bot replies to the message without pinging the person.
//
// To add or remove a phrase, edit TRIGGERS. To add, remove or change an answer, edit REPLIES.
// Each one is a line in quote marks, followed by a comma.
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

// ---- The phrases that set it off -----------------------------------------
// {N} stands for Nero's name (see NAME below). A message sets the bot off if it contains any of these
// phrases, with anything before or after. Capital letters do not matter, and a comma is fine between
// the words ("shut up, nero"). To add a phrase, add a line. To remove one, delete its line.
const TRIGGERS = [
  // Bullying and being mean
  'bully {N}',
  'bullying {N}',
  'be mean to {N}',
  'be rude to {N}',
  '{N} deserves to be bullied',
  '{N} should get bullied',

  // Roasting, teasing and mocking
  'roast {N}',
  'tease {N}',
  'make fun of {N}',
  'mock {N}',
  'laugh at {N}',
  'poke fun at {N}',
  'pick on {N}',

  // Ganging up and targeting
  'gang up on {N}',
  'attack {N}',
  'dogpile {N}',
  'target {N}',
  'pile on {N}',

  // Playful "punishments"
  'put {N} in a prison',
  'lock {N} up',
  'send {N} to jail',
  'throw {N} in the bin',
  'yeet {N}',
  'bonk {N}',
  'ban {N}',
  'exile {N}',
  'put {N} in the dungeon',
  'kick {N}',

  // Insults aimed at Nero
  'I hate {N}',
  '{N} sucks',
  '{N} is the worst',
  '{N} is useless',
  'nobody likes {N}',
  'ew {N}',
  'shut up {N}',
];

// ---- Nero's name ---------------------------------------------------------
// All of these count, in any capitals: nero, neropop, nero pop, and a real @mention of him.
// The number is Nero's Discord user ID. When someone @mentions him, Discord writes the mention
// in the message as <@ID> (or <@!ID> for people with a nickname).
const NERO_USER_ID = '150931226767785985';
const NAME = `(?:nero\\s?pop|nero|<@!?${NERO_USER_ID}>)`;

// ---- How often it may reply ----------------------------------------------
// After a reply, the bot stays quiet in that same channel for this many seconds.
const COOLDOWN_SECONDS = 20;

// ---- Turning the list above into a pattern -------------------------------
// These two mean "there is no letter or number right before/after here" (so "bully nerotic"
// does not count as bullying nero).  \p{L} is any letter and \p{N} is any number.
const NOT_PRECEDED_BY_LETTER = '(?<![\\p{L}\\p{N}_])';
const NOT_FOLLOWED_BY_LETTER = '(?![\\p{L}\\p{N}_])';

// Puts a backslash before characters that have a special meaning in patterns.
function escapeForPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// Turns a phrase like 'put {N} in a prison' into pattern text. Between words there may be spaces
// and/or a comma.
function phraseToPattern(phrase) {
  return phrase
    .split(' ')
    .map((word) => (word === '{N}' ? NAME : escapeForPattern(word)))
    .join('[\\s,]+');
}

// One pattern that matches any of the phrases, anywhere in a message.
// Flags: i ignores capital letters, u lets \p{L} and \p{N} work.
const PATTERN = new RegExp(
  `${NOT_PRECEDED_BY_LETTER}(?:${TRIGGERS.map(phraseToPattern).join('|')})${NOT_FOLLOWED_BY_LETTER}`,
  'iu'
);

// ---- What the bot remembers ----------------------------------------------
// The answer we gave last time, so we can avoid repeating it straight away.
let lastReply = null;

// When the bot last replied in each channel (channel ID -> time in milliseconds).
const lastReplyAt = new Map();

// For "npm run check": one example for every phrase, using the different ways of writing Nero's name.
const EXAMPLE_NAMES = ['nero', 'Nero Pop', 'neropop', 'NERO', `<@${NERO_USER_ID}>`, `<@!${NERO_USER_ID}>`, 'nero pop'];

module.exports = {
  // The pattern the bot looks for in every message: does it contain one of the phrases?
  pattern: PATTERN,

  // Example messages that "npm run check" uses to test the pattern above.
  examples: {
    // Every phrase, written with a different spelling of Nero's name each time, plus a few more.
    shouldMatch: [
      ...TRIGGERS.map((phrase, number) => phrase.replace('{N}', EXAMPLE_NAMES[number % EXAMPLE_NAMES.length])),
      "it's fun to be mean to Nero",
      'put nero in a prison /j',
      'ngl it would be so fun to be mean to nero rn',
      'i dont know lets bully nero',
      "don't bully nero",
    ],
    shouldNotMatch: [
      "let's get nero",
      'nero is so annoying',
      'be nice to nero',
      'I love nero',
      'nero is great',
      'nero is being mean',
      'who bullied nero?',
      'nero is not annoying',
      'bully nerotic',
      'kick nerotic',
      'bully',
      'nero',
    ],
  },

  // The answers, listed here so "npm run check" can make sure they are sensible.
  replies: REPLIES,

  // Runs when a message contains one of the phrases. "message" is the Discord message.
  async execute(message) {
    // The bot only calls this for matching messages, but check again so it is safe to call directly.
    if (!PATTERN.test(message.content ?? '')) return;

    // Stay quiet if the bot already replied in this channel a moment ago.
    const channelId = message.channel?.id ?? message.channelId ?? 'unknown';
    const now = Date.now();
    const previousReplyAt = lastReplyAt.get(channelId);
    if (previousReplyAt !== undefined && now - previousReplyAt < COOLDOWN_SECONDS * 1000) return;

    // Claim the channel straight away (before any waiting), so two messages arriving at the
    // same moment cannot both get a reply.
    lastReplyAt.set(channelId, now);

    // Pick an answer at random, but not the same one as last time (if there is a choice).
    const choices = REPLIES.filter((reply) => reply !== lastReply);
    const reply = choices[Math.floor(Math.random() * choices.length)];

    try {
      // reply() makes a Discord reply to their message.
      // repliedUser: false means the person is NOT pinged by the reply.
      await message.reply({
        content: reply,
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      // The reply failed, so give the channel back and let the next message try again.
      if (previousReplyAt === undefined) lastReplyAt.delete(channelId);
      else lastReplyAt.set(channelId, previousReplyAt);
      throw error; // index.js writes the error to the console
    }

    lastReply = reply; // remember it only once it was really sent
  },
};