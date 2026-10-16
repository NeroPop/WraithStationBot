// check.js
//
// A safety check you run on your PC BEFORE pushing to GitHub:
//
//     npm run check
//
// It does NOT connect to Discord and does NOT need your token. It only makes sure
// that every file in "commands" and "triggers" is written correctly, and that
// each trigger pattern passes its own example tests. If anything is wrong it
// explains what and exits with an error, so you can fix it before the bot restarts.

const { loadCommands, loadTriggers } = require('./loadFiles');

// Counts problems so we can report them all at the end.
let problems = 0;

// ---- Check the slash commands --------------------------------------------
try {
  const commands = loadCommands(); // throws a clear error if a file is written wrongly

  for (const command of commands) {
    // toJSON() is what we send to Discord. It throws if the command is invalid
    // (for example a name with capital letters or a description that is too long).
    command.data.toJSON();
    console.log(`OK  command  /${command.data.name}`);
  }
} catch (error) {
  problems++;
  console.error(`FAIL  commands: ${error.message}`);
}

// ---- Check the chat triggers ---------------------------------------------
try {
  const triggers = loadTriggers(); // throws a clear error if a file is written wrongly

  for (const trigger of triggers) {
    const examples = trigger.examples || {};

    // Every "shouldMatch" example must match the pattern.
    for (const text of examples.shouldMatch || []) {
      if (!trigger.pattern.test(text)) {
        problems++;
        console.error(`FAIL  trigger ${trigger.name}: should match "${text}" but did not`);
      }
    }

    // Every "shouldNotMatch" example must NOT match the pattern.
    for (const text of examples.shouldNotMatch || []) {
      if (trigger.pattern.test(text)) {
        problems++;
        console.error(`FAIL  trigger ${trigger.name}: should NOT match "${text}" but did`);
      }
    }

    console.log(`OK  trigger  ${trigger.name}`);
  }
} catch (error) {
  problems++;
  console.error(`FAIL  triggers: ${error.message}`);
}

// ---- Report --------------------------------------------------------------
if (problems > 0) {
  console.error(`\nCheck failed with ${problems} problem(s). Fix them before pushing.`);
  process.exit(1); // a non-zero exit code tells npm that the check failed
}

console.log('\nAll checks passed. Safe to push.');
