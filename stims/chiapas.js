// stims/chiapas.js
//
// A stim. It says "chiapas", but every letter is repeated a random number of times,
// so it can come out as "chhhiiappasss" or "cccccchiappaaaass". It is different every time.
//
// To change how stretched out the letters get, change the two numbers below.

const { randomInt } = require('../random');

const MIN_REPEATS = 1; // every letter appears at least this many times
const MAX_REPEATS = 8; // and at most this many times

module.exports = {
  generate() {
    return 'chiapas'
      .split('') // c, h, i, a, p, a, s
      .map((letter) => letter.repeat(randomInt(MIN_REPEATS, MAX_REPEATS))) // repeat each letter
      .join('');
  },

  // Each letter appears one or more times, in order.
  pattern: /^c+h+i+a+p+a+s+$/,
};
