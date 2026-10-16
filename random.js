// random.js
//
// Small helpers for picking random things. Used by the stims and the stim scheduler.

// A random whole number from min to max, including both ends.
//   randomInt(1, 5) gives 1, 2, 3, 4 or 5.
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// A random time length (in milliseconds) somewhere between min and max.
function randomBetween(minMs, maxMs) {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

// A random item from a list.
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { randomInt, randomBetween, pickRandom };
