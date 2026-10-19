// stims/ayay.js
//
// A stim. It says "ayayayayayay" followed by some sad faces, and the number of "ay"s and
// the number of faces is random every time, like "ayayayay" and then two faces.
//
// To change how long it can get, change the four numbers below.

const { randomInt } = require('../random');

const MIN_AYS = 2; // fewest "ay"s
const MAX_AYS = 12; // most "ay"s
const MIN_FACES = 1; // fewest sad faces
const MAX_FACES = 7; // most sad faces

module.exports = {
  generate() {
    const ays = 'ay'.repeat(randomInt(MIN_AYS, MAX_AYS));
    const faces = '😔'.repeat(randomInt(MIN_FACES, MAX_FACES));
    return `${ays} ${faces}`;
  },

  // One or more "ay", a space, then one or more sad faces.
  pattern: /^(?:ay)+ 😔+$/u,
};
