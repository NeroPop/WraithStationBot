// commands/tea.js
//
// The /tea command. It sets an alarm that pings a person (chosen in config.js) in the
// channel where you set it, with a "Tea Alarm!" message and a random tea picture.
//
//   /tea set time:15:30             alarm at the next 15:30 (UK time)
//   /tea set time:7:20pm            the same idea, with am/pm
//   /tea set time:saturday 7:20pm   alarm at 7:20pm on the next Saturday (also "7:20pm on saturday")
//   /tea set time:tomorrow 9am      alarm at 9am tomorrow
//   /tea set time:20m               alarm in 20 minutes (also "1h 30m" or "5d 5h 13m")
//   /tea cancel            cancel the waiting alarms in this channel
//   /tea status            show the waiting alarms in this channel, and when the next may be set
//
// Only people with an allowed role can use it (the roles are listed in config.js).
// Only one alarm can be set per hour (the cooldown is also in config.js), shared by everyone.
// Cancelling an alarm resets that limit, so a wrong time can be fixed straight away.

const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const tea = require('../services/teaAlarm');
const { formatDuration } = require('../lib/timeUtils');

const { settings } = tea;

// A correct example, shown whenever someone gets the time wrong.
const HOW_TO = [
  '**How to set the time**',
  `• A day and a time, in ${settings.timezone} time. Examples: \`saturday 7:20pm\`, \`7:20pm on saturday\`, \`sat 19:20\`, \`tomorrow 9am\`, \`today 6pm\`. A day name means the next time that day comes round.`,
  '• Or just a time, which means the next time the clock reads that. Examples: `7:20pm`, `19:20`, `9am`, `noon`. Without am or pm it is the 24 hour clock.',
  '• Or a wait, using **m** (minutes), **h** (hours) or **d** (days). Examples: `20m`, `1h 30m`, `5d 5h 13m`.',
  `• It can be at most ${formatDuration(settings.maxAheadMs)} ahead.`,
  'Full examples: `/tea set time:saturday 7:20pm` or `/tea set time:15:30`',
].join('\n');

// A Discord timestamp. Each person sees it in their OWN time zone and language.
//   style "t" shows just the time (15:30), "F" shows the day, date and time (Saturday, 7 November
//   2026 at 19:20), "R" shows "in 20 minutes".
function stamp(ms, style) {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// Shows an alarm's time using Discord's timestamp, so each reader sees it in their own time zone.
// For an alarm that is soon, the time is enough. For one further away, the day and date are shown
// too, so everyone can see exactly which day it is (important for "saturday 7:20pm").
function alarmTime(alarmMs, now = Date.now()) {
  return alarmMs - now < 20 * 60 * 60 * 1000 ? stamp(alarmMs, 't') : stamp(alarmMs, 'F');
}

// The IDs of the roles the person has. Discord gives these in two possible shapes.
function rolesOf(member) {
  if (!member?.roles) return [];
  if (Array.isArray(member.roles)) return member.roles;
  return [...(member.roles.cache?.keys() ?? [])];
}

// A private reply (only the person who used the command can see it).
function privately(interaction, content) {
  return interaction.editReply({ content, allowedMentions: { parse: [] } });
}

// A message everyone in the channel can see. It never pings anyone.
async function publicly(interaction, content) {
  try {
    await interaction.channel.send({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`Could not post the tea alarm notice: ${error.message}`);
  }
}

module.exports = {
  // "data" is what Discord shows in its command menu.
  data: new SlashCommandBuilder()
    .setName('tea') // must match the file name (tea.js)
    .setDescription('Set a tea alarm.')
    .setContexts(InteractionContextType.Guild) // servers only, not direct messages
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a tea alarm in this channel.')
        .addStringOption((option) =>
          option
            .setName('time')
            .setDescription('When: saturday 7:20pm, tomorrow 9am, 15:30 or 7:20pm (UK time), or a wait like 20m.')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancel the waiting tea alarms in this channel.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the waiting tea alarms in this channel.')),

  // "execute" runs every time someone uses /tea.
  async execute(interaction) {
    // Saving to Google takes a moment, and Discord only waits 3 seconds for a reply.
    // deferReply() tells Discord "working on it" first. Ephemeral means only the
    // person who used the command can see the reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ---- Only people with an allowed role may use it ---------------------
    if (!tea.canUse(interaction.user.id, rolesOf(interaction.member))) {
      const roles = settings.allowedRoleIds.map((id) => `<@&${id}>`).join(', ');
      await privately(interaction, `Only people with one of these roles can use tea alarms: ${roles}`);
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.channel;

    // ---- /tea set --------------------------------------------------------
    if (subcommand === 'set') {
      const text = interaction.options.getString('time', true);
      const parsed = tea.parseAlarmTime(text);

      if (parsed.error === 'format') {
        await privately(interaction, `"${text}" is not a time I understand.\n\n${HOW_TO}`);
        return;
      }
      if (parsed.error === 'past') {
        await privately(interaction, `That time has already passed today. Try \`tomorrow\` or a day name, like \`saturday 7:20pm\`.\n\n${HOW_TO}`);
        return;
      }
      if (parsed.error === 'tooSoon') {
        await privately(interaction, `That is too soon. A wait must be at least 1 minute.\n\n${HOW_TO}`);
        return;
      }
      if (parsed.error === 'tooFar') {
        await privately(interaction, `That is too far ahead. The furthest I can go is ${formatDuration(settings.maxAheadMs)}.\n\n${HOW_TO}`);
        return;
      }

      // Make sure the bot can actually post here, so it does not accept an alarm it cannot send.
      const permissions = interaction.appPermissions;
      if (!channel?.isSendable() || permissions?.has(PermissionFlagsBits.SendMessages) === false) {
        await privately(interaction, 'I cannot post in this channel. Please give me the **Send Messages** permission here, then try again.');
        return;
      }

      const result = await tea.setAlarm({
        atMs: parsed.atMs,
        channelId: channel.id,
        channelName: channel.name ?? 'unknown',
        serverName: interaction.guild?.name ?? 'unknown',
        setBy: interaction.user.username,
        setById: interaction.user.id,
      });

      // The once-an-hour limit is running.
      if (!result.ok) {
        await privately(
          interaction,
          `A tea alarm was set recently. They can only be set once every ${formatDuration(settings.cooldownMs)}.\n` +
            `The next one can be set ${stamp(result.nextAllowedMs, 'R')} (${stamp(result.nextAllowedMs, 't')}).`
        );
        return;
      }

      const { alarm } = result;
      await publicly(
        interaction,
        `☕ <@${interaction.user.id}> set a tea alarm for ${alarmTime(alarm.alarmMs, alarm.setAtMs)} (${stamp(alarm.alarmMs, 'R')}).`
      );

      // Tell the person privately if pictures will not work in this channel.
      const pictureNote =
        permissions?.has(PermissionFlagsBits.AttachFiles) === false
          ? '\nNote: I am missing the **Attach Files** permission here, so the alarm will go out without a picture.'
          : '';
      // The full day and date is shown here so you can check the bot understood you correctly.
      await privately(
        interaction,
        `Done! Your tea alarm is set for ${stamp(alarm.alarmMs, 'F')}. Use \`/tea cancel\` if that is wrong or you change your mind.${pictureNote}`
      );
      return;
    }

    // ---- /tea cancel -----------------------------------------------------
    if (subcommand === 'cancel') {
      const cancelled = await tea.cancelAlarms(channel.id);

      if (cancelled.length === 0) {
        await privately(interaction, 'There are no waiting tea alarms in this channel.');
        return;
      }

      const times = cancelled.map((alarm) => alarmTime(alarm.alarmMs)).join(', ');
      await publicly(interaction, `☕ <@${interaction.user.id}> cancelled the tea alarm for ${times}.`);
      await privately(interaction, `Cancelled. The ${formatDuration(settings.cooldownMs)} limit has been reset, so you can set a new alarm straight away.`);
      return;
    }

    // ---- /tea status -----------------------------------------------------
    const pending = await tea.getPending(channel.id);
    const nextAllowed = tea.nextAllowedTime();

    const lines = [
      pending.length === 0
        ? 'There are no waiting tea alarms in this channel.'
        : `**Waiting tea alarms in this channel:**\n${pending.map((alarm) => `• ${alarmTime(alarm.alarmMs)} (${stamp(alarm.alarmMs, 'R')}), set by ${alarm.setBy}`).join('\n')}`,
      nextAllowed > 0
        ? `The next alarm can be set ${stamp(nextAllowed, 'R')} (${stamp(nextAllowed, 't')}).`
        : 'An alarm can be set right now.',
    ];
    await privately(interaction, lines.join('\n'));
  },
};
