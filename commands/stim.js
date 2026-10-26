// commands/stim.js
//
// The /stim command. It controls where and when the bot says its random "stims"
// (the small text phrases from the stims folder). The bot ONLY stims in channels that
// were set up with this command.
//
//   /stim set     start (or change) stimming in the channel you type it in
//   /stim off     stop stimming in this channel
//   /stim status  show this channel's settings and when the next stim is due
//
// Only people with the "Manage Channels" permission can see and use this command.
// Server admins can change that in Server Settings > Integrations.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require('discord.js');
const { configureChannel, disableChannel, getChannelStatus } = require('../services/stimScheduler');
const { stims: stimConfig } = require('../config');
const {
  parseDuration,
  formatDuration,
  parseTimeOfDay,
  formatTimeOfDay,
  resolveTimeZone,
} = require('../lib/timeUtils');

// A correct example, shown whenever someone gets the command wrong.
const EXAMPLE = '`/stim set from:10 until:22 min:12h max:3d`';

// Tells people how to fill in the boxes. Shown when something is wrong.
const HOW_TO = [
  '**How to fill it in**',
  '• **from** and **until**: the hours the bot may stim, on the 24 hour clock. Examples: `10`, `10:30`, `22`.',
  '• **min** and **max**: the shortest and longest wait between stim sessions. Use a number and **m** (minutes), **h** (hours) or **d** (days). Examples: `90m`, `12h`, `3d`.',
  `• **timezone** (optional): the time zone for those hours. Default is ${stimConfig.defaultTimezone}. Example: \`America/New_York\`.`,
  `Full example: ${EXAMPLE}`,
].join('\n');

// A Discord timestamp that shows in each reader's own time zone, like "16 October 2026 at 20:15".
function discordTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `<t:${seconds}:f> (<t:${seconds}:R>)`;
}

// Checks what the person typed for /stim set.
// Returns { problems, values }. If "problems" is empty, "values" holds the cleaned-up settings.
function readSetOptions(interaction) {
  const problems = [];
  const text = (name) => interaction.options.getString(name);

  const activeFrom = parseTimeOfDay(text('from'));
  if (activeFrom === null) {
    problems.push(`• **from**: "${text('from')}" is not a time. Use the 24 hour clock, like \`10\` or \`10:30\`.`);
  }

  const activeUntil = parseTimeOfDay(text('until'));
  if (activeUntil === null) {
    problems.push(`• **until**: "${text('until')}" is not a time. Use the 24 hour clock, like \`22\` or \`22:30\`.`);
  }

  const minGapMs = parseDuration(text('min'));
  if (minGapMs === null) {
    problems.push(`• **min**: "${text('min')}" is not a length of time. Use a number and m, h or d, like \`90m\`, \`12h\` or \`1d\`.`);
  }

  const maxGapMs = parseDuration(text('max'));
  if (maxGapMs === null) {
    problems.push(`• **max**: "${text('max')}" is not a length of time. Use a number and m, h or d, like \`2h\`, \`36h\` or \`3d\`.`);
  }

  // Time zone is optional. If it was left out, use the default.
  const timezoneText = text('timezone') ?? stimConfig.defaultTimezone;
  const timezone = resolveTimeZone(timezoneText);
  if (!timezone) {
    problems.push(`• **timezone**: "${timezoneText}" is not a time zone. Use a name like \`Europe/London\` or \`America/New_York\`.`);
  }

  // These checks only make sense when both gaps were understood.
  const { min: limitMin, max: limitMax } = stimConfig.sessionGapLimits;
  const limitMinMs = parseDuration(limitMin);
  const limitMaxMs = parseDuration(limitMax);

  if (minGapMs !== null && maxGapMs !== null) {
    if (minGapMs > maxGapMs) {
      problems.push('• **min** is longer than **max**. The shortest wait must not be longer than the longest wait.');
    }
    if (minGapMs < limitMinMs || maxGapMs > limitMaxMs) {
      problems.push(`• The waits must be between ${formatDuration(limitMinMs)} and ${formatDuration(limitMaxMs)}.`);
    }
  }

  return { problems, values: { activeFrom, activeUntil, minGapMs, maxGapMs, timezone } };
}

// The settings of a channel, as a short list of lines.
function describeSettings(state) {
  return [
    `• Active hours: **${formatTimeOfDay(state.activeFrom)}** to **${formatTimeOfDay(state.activeUntil)}** (${state.timezone})`,
    `• Wait between sessions: **${formatDuration(state.minGapMs)}** to **${formatDuration(state.maxGapMs)}**`,
  ].join('\n');
}

// A private reply (only the person who used the command can see it).
function privately(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

module.exports = {
  // "data" is what Discord shows in its command menu.
  data: new SlashCommandBuilder()
    .setName('stim') // must match the file name (stim.js)
    .setDescription('Control the random stims in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) // who can see and use it
    .setContexts(InteractionContextType.Guild) // servers only, not direct messages
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Start (or change) stims in this channel.')
        .addStringOption((option) =>
          option.setName('from').setDescription('Hour the stims may start, 24 hour clock. Example: 10 or 10:30').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('until').setDescription('Hour the stims must stop, 24 hour clock. Example: 22 or 22:30').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('min').setDescription('Shortest wait between sessions. Use m, h or d. Example: 12h').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('max').setDescription('Longest wait between sessions. Use m, h or d. Example: 3d').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('timezone').setDescription(`Time zone for the hours. Default: ${stimConfig.defaultTimezone}`)
        )
    )
    .addSubcommand((sub) => sub.setName('off').setDescription('Stop stims in this channel.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the stim settings for this channel.')),

  // "execute" runs every time someone uses /stim.
  async execute(interaction) {
    // Saving to Google takes a moment, and Discord only waits 3 seconds for a reply.
    // deferReply() tells Discord "working on it" first. Ephemeral means only the
    // person who used the command can see the reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.channel;

    // ---- /stim set -------------------------------------------------------
    if (subcommand === 'set') {
      const { problems, values } = readSetOptions(interaction);

      if (problems.length > 0) {
        await privately(interaction, `That did not work:\n${problems.join('\n')}\n\n${HOW_TO}`);
        return;
      }

      // Make sure the bot can actually post here, so it does not accept settings it cannot use.
      if (!channel?.isSendable() || interaction.appPermissions?.has(PermissionFlagsBits.SendMessages) === false) {
        await privately(interaction, 'I cannot post in this channel. Please give me the **Send Messages** permission here, then try again.');
        return;
      }

      const state = await configureChannel({
        channelId: channel.id,
        channelName: channel.name ?? 'unknown',
        serverName: interaction.guild?.name ?? 'unknown',
        setBy: interaction.user.username,
        ...values,
      });

      await privately(
        interaction,
        [
          'Stims are set up in this channel.',
          describeSettings(state),
          `• First stim: around ${discordTime(state.nextRunMs)}`,
          '',
          'Run `/stim set` again here to change these, or `/stim off` to stop.',
        ].join('\n')
      );
      return;
    }

    // ---- /stim off -------------------------------------------------------
    if (subcommand === 'off') {
      const wasSetUp = await disableChannel(channel.id);

      await privately(
        interaction,
        wasSetUp
          ? 'Stims are now off in this channel. Run `/stim set` to turn them back on.'
          : 'Stims were not set up in this channel, so there is nothing to turn off.'
      );
      return;
    }

    // ---- /stim status ----------------------------------------------------
    const state = await getChannelStatus(channel.id);

    if (!state) {
      await privately(interaction, `Stims are not set up in this channel yet.\n\n${HOW_TO}`);
      return;
    }

    if (state.problem) {
      await privately(interaction, `This channel's row in the Stims sheet has a problem: ${state.problem}. Fix it in the sheet, or run \`/stim set\` again.`);
      return;
    }

    const lines = [`**Stims in this channel:** ${state.statusText}`, describeSettings(state)];
    if (state.status === 'active' && state.nextRunMs) {
      lines.push(`• Next stim: around ${discordTime(state.nextRunMs)}`);
      if (state.repeatsLeft > 0) lines.push(`• A session is in progress with ${state.repeatsLeft} more to go.`);
    }
    await privately(interaction, lines.join('\n'));
  },
};
