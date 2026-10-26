// check.js
//
// A safety check you run on your PC BEFORE pushing to GitHub:
//
//     npm run check
//
// It does NOT connect to Discord and does NOT need your token. It only makes sure
// that every file in "commands", "triggers" and "stims" is written correctly, that
// each trigger pattern passes its own example tests, that every stim always produces
// sensible text, and that the stim settings in config.js make sense. If anything is wrong it
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

    // A command can list the picture it uses (imagePath). A missing picture is a reminder to
    // commit it, not a failure, because the command still works without it.
    if (command.imagePath) {
      const present = require('node:fs').existsSync(command.imagePath);
      console.log(present ? `OK  picture  /${command.data.name} has its picture` : `NOTE  /${command.data.name} picture not found at ${command.imagePath}`);
    }
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

// ---- Check the stims and their settings ----------------------------------
try {
  const { readSettings, toSmallText, stims } = require('./stimScheduler'); // loads the stims folder too

  readSettings(); // throws a clear error if something in config.js is wrong
  console.log('OK  config   stim settings in config.js');

  if (stims.length === 0) throw new Error('the stims folder has no stims in it.');

  for (const stim of stims) {
    // A stim is different each time, so we try it many times.
    for (let attempt = 0; attempt < 200; attempt++) {
      const text = stim.generate();

      if (typeof text !== 'string' || text.trim() === '') {
        throw new Error(`stims/${stim.name}.js: generate() must return some text, but it returned ${JSON.stringify(text)}.`);
      }

      if (toSmallText(text).length > 2000) {
        throw new Error(`stims/${stim.name}.js: the text is longer than Discord's 2000 character limit.`);
      }

      if (stim.pattern && !stim.pattern.test(text)) {
        throw new Error(`stims/${stim.name}.js: the text "${text}" does not match its own pattern.`);
      }
    }

    console.log(`OK  stim     ${stim.name}   (for example: ${toSmallText(stim.generate())})`);
  }
} catch (error) {
  problems++;
  console.error(`FAIL  stims: ${error.message}`);
}

// ---- Check the tea alarm settings and pictures ---------------------------
try {
  const fs = require('node:fs');
  const { readSettings, settings } = require('./teaAlarm');

  readSettings(); // throws a clear error if something in config.js is wrong
  console.log('OK  config   tea alarm settings in config.js');

  // Pictures are optional, so a missing folder is a reminder and not a failure.
  const pictures = fs.existsSync(settings.imagesFolder)
    ? fs.readdirSync(settings.imagesFolder).filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name))
    : [];
  console.log(
    pictures.length > 0
      ? `OK  pictures ${pictures.length} tea picture(s) in ${settings.imagesFolder}`
      : `NOTE  no tea pictures yet. Put .png, .jpg, .gif or .webp files in the images/tea folder.`
  );
} catch (error) {
  problems++;
  console.error(`FAIL  tea alarm: ${error.message}`);
}

// ---- Report --------------------------------------------------------------
if (problems > 0) {
  console.error(`\nCheck failed with ${problems} problem(s). Fix them before pushing.`);
  process.exit(1); // a non-zero exit code tells npm that the check failed
}

console.log('\nAll checks passed. Safe to push.');
