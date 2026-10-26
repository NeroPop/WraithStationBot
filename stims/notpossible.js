// stims/notpossible.js
//
// A stim. It says "this is NOT possible." exactly like that every time, with no variations.
//
// (The bot adds the small text formatting "-#" by itself, so you will see it in small text.)

module.exports = {
  generate() {
    return 'this is NOT possible.';
  },

  pattern: /^this is NOT possible\.$/,
};
