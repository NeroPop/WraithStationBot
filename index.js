// index.js
//
// The main file. Wispbyte runs this file to start the bot.
//
// What it does, in order:
//   1. Reads the secret token from the .env file.
//   2. Loads every slash command (commands folder) and chat trigger (triggers folder).
//   3. Logs in to Discord.
//   4. Tells Discord which slash commands exist.
//   5. Listens for slash commands and for chat messages.

const path = require('node:path');
const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { loadCommands, loadTriggers } = require('./loadFiles');

// ---- 1. Read the secret token --------------------------------------------
// Wispbyte's Environment tab saves variables into a file called ".env".
// This loads that file so the token becomes available as process.env.DISCORD_TOKEN.
// If there is no .env file we carry on, because the token may be set another way.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error; // ENOENT only means "no .env file"
}

// Tidy up the token: copy and paste often adds invisible spaces or line breaks
// at the ends, and some tools wrap the value in quote marks. Remove both.
const token = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '').trim();

if (!token) {
  console.error('No DISCORD_TOKEN found. Add it in the Environment tab on Wispbyte.');
  process.exit(1);
}

// ---- 2. Load commands and triggers ---------------------------------------
const commands = loadCommands();
const triggers = loadTriggers();

// Put the commands in a lookup table so we can find one by its name quickly.
const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

// ---- 3. Create the Discord client ----------------------------------------
// "Intents" tell Discord which kinds of events we want to receive.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // basic server information, needed for slash commands
    GatewayIntentBits.GuildMessages, // messages sent in server channels
    GatewayIntentBits.MessageContent, // the actual text of those messages
  ],
});

// ---- 4. When the bot is ready: register the slash commands ---------------
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    // set() replaces the bot's full list of global slash commands with ours.
    // That means deleting a command file removes the command on the next restart.
    const commandData = commands.map((command) => command.data.toJSON());
    await readyClient.application.commands.set(commandData);
    console.log(`Registered ${commandData.length} slash command(s).`);
  } catch (error) {
    console.error('Could not register slash commands:', error);
  }
});

// ---- 5a. Slash commands --------------------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  // Ignore anything that is not a slash command (buttons and menus, for example).
  if (!interaction.isChatInputCommand()) return;

  const command = commandsByName.get(interaction.commandName);
  if (!command) return; // Discord knows a command we no longer have

  try {
    await command.execute(interaction);
  } catch (error) {
    // The technical details go to the console. The user gets a short, private message.
    console.error(`Error in /${interaction.commandName}:`, error);

    const errorReply = {
      content: 'Something went wrong running that command. Please try again.',
      flags: MessageFlags.Ephemeral, // "Ephemeral" means only the user can see it
    };

    try {
      // If the command already replied, we must send a follow-up instead.
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    } catch (replyError) {
      console.error('Could not send the error message either:', replyError);
    }
  }
});

// ---- 5b. Chat triggers ---------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
  // Ignore other bots (and ourselves) so bots can never set each other off.
  if (message.author.bot) return;

  for (const trigger of triggers) {
    // Skip triggers whose pattern does not match this message.
    if (!trigger.pattern.test(message.content)) continue;

    try {
      await trigger.execute(message);
    } catch (error) {
      // One broken trigger must never crash the bot. Log it and move on.
      // A common cause is the bot missing permission to reply in that channel.
      console.error(`Error in trigger "${trigger.name}":`, error);
    }
  }
});

// ---- Safety nets ---------------------------------------------------------
// These log unexpected errors instead of letting them shut the whole bot down.
client.on(Events.Error, (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

// ---- 6. Log in -----------------------------------------------------------
client.login(token).catch((error) => {
  console.error(`Could not log in to Discord: ${error.message}`);

  // Help with the most common problem without ever printing the token itself.
  // A real bot token is about 72 characters long and has 3 parts joined by dots.
  console.error(
    `The saved token is ${token.length} characters long and has ${token.split('.').length} part(s). ` +
      'A real bot token has 3 parts. If that does not match, copy the token again from the ' +
      'Bot page in the Discord Developer Portal (use Reset Token if needed) and save it in the ' +
      'Environment tab on Wispbyte.'
  );

  // Close the connection properly, then exit with an error code.
  // (Exiting instantly while it is still closing can crash on Windows.)
  client.destroy();
  process.exitCode = 1;
});
