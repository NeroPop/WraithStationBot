// lib/loadFiles.js
//
// This file reads the "commands", "triggers" and "stims" folders and hands back everything
// it finds. Both index.js (the real bot) and scripts/check.js (the safety check) use it,
// so the rules for what makes a valid command or trigger live in ONE place.
//
// If a file is written wrongly, the error message names the file so it is easy to fix.

const fs = require('node:fs');
const path = require('node:path');

// Finds every .js file inside one of the project's folders. Those folders (commands, triggers,
// stims) are in the main project folder, one level up from this lib folder.
// Returns a list like: [{ fileName: 'ping', filePath: 'C:/.../commands/ping.js' }]
function getJsFiles(folderName) {
  const folderPath = path.join(__dirname, '..', folderName); // '..' means one level up, the main project folder

  return fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith('.js')) // ignore anything that is not a .js file
    .map((file) => ({
      fileName: path.basename(file, '.js'), // "ping.js" becomes "ping"
      filePath: path.join(folderPath, file),
    }));
}

// Loads every slash command from the "commands" folder.
//
// Each command file must export:
//   data    -> the command's name and description (made with SlashCommandBuilder)
//   execute -> the function that runs when someone uses the command
//
// House rule: the command name must match the file name (/ping lives in ping.js).
function loadCommands() {
  const commands = [];

  for (const { fileName, filePath } of getJsFiles('commands')) {
    const command = require(filePath);

    if (!command.data || typeof command.execute !== 'function') {
      throw new Error(`commands/${fileName}.js must export "data" and an "execute" function.`);
    }

    if (command.data.name !== fileName) {
      throw new Error(
        `commands/${fileName}.js sets the command name to "${command.data.name}", ` +
          `but the file name and command name must match.`
      );
    }

    commands.push(command);
  }

  return commands;
}

// Loads every chat trigger from the "triggers" folder.
//
// Each trigger file must export:
//   pattern -> a regular expression. If a message matches it, the trigger runs.
//   execute -> the function that runs, and it receives the Discord message.
//
// A file may also export "examples" (optional) so scripts/check.js can test the pattern:
//   examples: { shouldMatch: ['some text'], shouldNotMatch: ['other text'] }
function loadTriggers() {
  const triggers = [];

  for (const { fileName, filePath } of getJsFiles('triggers')) {
    const trigger = require(filePath);

    if (!(trigger.pattern instanceof RegExp) || typeof trigger.execute !== 'function') {
      throw new Error(`triggers/${fileName}.js must export a "pattern" (RegExp) and an "execute" function.`);
    }

    // A pattern with the "g" or "y" flag remembers its position between tests,
    // which makes it match unpredictably. We refuse those to avoid confusing bugs.
    if (trigger.pattern.global || trigger.pattern.sticky) {
      throw new Error(`triggers/${fileName}.js: the pattern must not use the "g" or "y" flags.`);
    }

    // Keep the file name on the trigger so log messages can say which one it was.
    triggers.push({ ...trigger, name: fileName });
  }

  return triggers;
}

// Loads every stim from the "stims" folder.
//
// Each stim file must export:
//   generate -> a function that returns the text to say (called every time it is said)
//   pattern  -> (optional) a regular expression the text must match, used by scripts/check.js
function loadStims() {
  const stims = [];

  for (const { fileName, filePath } of getJsFiles('stims')) {
    const stim = require(filePath);

    if (typeof stim.generate !== 'function') {
      throw new Error(`stims/${fileName}.js must export a "generate" function that returns the text to say.`);
    }

    if (stim.pattern !== undefined && !(stim.pattern instanceof RegExp)) {
      throw new Error(`stims/${fileName}.js: "pattern" must be a regular expression.`);
    }

    // Keep the file name on the stim. It is how the bot remembers which stim it is saying.
    stims.push({ ...stim, name: fileName });
  }

  return stims;
}

module.exports = { loadCommands, loadTriggers, loadStims };
