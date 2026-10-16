// stims/wormtown.js
//
// A stim. The bot picks a stim at random, then says it 1 to 5 times (see config.js).
//
// Every stim file exports:
//   generate  a function that returns the text to say. It is called every time the stim
//             is said, so a stim can come out slightly different each time.
//   pattern   (optional) what the text must look like. "npm run check" uses it to make
//             sure the stim always produces something sensible.
//
// You do not need to add the small text formatting ("-#"). The bot adds it automatically.
//
// To add a new stim: copy a file in this folder, rename it, and change generate().
// Then push and restart the server. Nobody can add stims through Discord.

module.exports = {
  generate() {
    return '...Wormtown';
  },

  pattern: /^\.\.\.Wormtown$/,
};
