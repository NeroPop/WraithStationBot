// teaAlarm.js
//
// The brain behind the tea alarm. It does three jobs:
//   1. Remembers every alarm (kept in the "TeaAlarm" Google Sheet, so a restart loses nothing).
//   2. Every few seconds, checks whether an alarm is due and sends it.
//   3. Gives the /tea command a few functions to set, cancel and list alarms.
//
// HOW AN ALARM WORKS
//   - Someone allowed to use /tea picks a time. The alarm is saved as a row in the sheet.
//   - When the time comes, the bot posts in the same channel: it pings the person from
//     config.js and shows an embed ("Tea Alarm!") with a random picture from the images folder.
//   - Only ONE alarm can be set per cooldown period (1 hour by default), shared by everyone.
//     The cooldown counts from when an alarm is SET. Cancelling an alarm resets the cooldown,
//     so a wrong time can be fixed straight away.
//   - If the bot was offline when an alarm was due, it still sends it if it is only a little
//     late (15 minutes by default). Otherwise the alarm is marked "Missed" and nothing is sent.
//
// All the numbers and IDs (the person to ping, the allowed roles, the cooldown...) are in config.js.

const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getSheet, ensureHeadings, appendRow } = require('./sheets');
const { sheetIds, teaAlarm: teaConfig } = require('./config');
const { MINUTE, parseDuration, parseTimeOfDay, resolveTimeZone, nextOpening } = require('./timeUtils');
const { pickRandom, randomInt } = require('./random');
const { createQueue } = require('./taskQueue');

// ---- Settings (read from config.js) --------------------------------------
// Turns the friendly text in config.js ("1h", "15m") into numbers the code can use.
// If something in config.js is wrong, this says exactly which setting and why.
function readSettings() {
  const duration = (text, label, options) => {
    const ms = parseDuration(text, options);
    if (ms === null) {
      throw new Error(
        `config.js: teaAlarm.${label} is "${text}", which is not a valid length of time. ` +
          'Use a number plus m, h or d, like "15m" or "1h".'
      );
    }
    return ms;
  };

  // Discord IDs are long numbers.
  const idList = (list, label) => {
    if (!Array.isArray(list) || list.some((id) => !/^\d{15,25}$/.test(String(id)))) {
      throw new Error(`config.js: teaAlarm.${label} must be a list of Discord IDs (long numbers), like ['123456789012345678'].`);
    }
    return list.map(String);
  };

  const settings = {
    sheetTab: teaConfig.sheetTab,
    pingUserId: idList([teaConfig.pingUserId], 'pingUserId')[0],
    allowedRoleIds: idList(teaConfig.allowedRoleIds, 'allowedRoleIds'),
    alwaysAllowedUserIds: idList(teaConfig.alwaysAllowedUserIds, 'alwaysAllowedUserIds'),
    cooldownMs: duration(teaConfig.cooldown, 'cooldown', { allowZero: true }),
    maxAheadMs: duration(teaConfig.maxAhead, 'maxAhead'),
    lateGraceMs: duration(teaConfig.lateGrace, 'lateGrace', { allowZero: true }),
    timezone: resolveTimeZone(teaConfig.timezone),
    imagesFolder: path.resolve(__dirname, teaConfig.imagesFolder), // an absolute path also works
    checkEveryMs: teaConfig.checkEverySeconds * 1000,
    sheetRefreshMs: duration(teaConfig.sheetRefresh, 'sheetRefresh'),
    retryAfterErrorMs: duration(teaConfig.retryAfterError, 'retryAfterError'),
  };

  if (!settings.timezone) {
    throw new Error(`config.js: teaAlarm.timezone "${teaConfig.timezone}" is not a real time zone. Try "Europe/London".`);
  }
  if (!(settings.checkEveryMs >= 5000)) {
    throw new Error('config.js: teaAlarm.checkEverySeconds must be at least 5.');
  }

  return settings;
}

const SETTINGS = readSettings();

// The column headings of the TeaAlarm tab, in order. The bot writes them itself if the tab is empty.
const HEADINGS = ['Alarm ID', 'Alarm Time', 'Channel ID', 'Channel Name', 'Server', 'Set By', 'Set By ID', 'Set At', 'Status'];

// The words shown in the Status column for each state.
const STATUS_TEXT = { pending: 'Pending', sent: 'Sent', cancelled: 'Cancelled', missed: 'Missed', failed: 'Failed (cannot post)' };

// ---- What the bot remembers ----------------------------------------------
// One entry per alarm, keyed by the alarm's ID. Each entry looks like:
//   id, alarmMs (when it goes off), channelId, channelName, serverName,
//   setBy (username), setById, setAtMs (when it was set),
//   status ('pending', 'sent', 'cancelled', 'missed' or 'failed'),
//   retryAtMs (try again after this time, if sending failed), unsaved (the last save failed)
let alarms = new Map();

let discordClient = null; // the Discord bot, set when the alarms start
let timer = null; // the repeating check
let lastLoadAt = 0; // when we last read the sheet
let everLoaded = false; // has the sheet been read successfully at least once?
let lastSetAtMs = 0; // when the most recent alarm was set (for the cooldown)
let noImagesWarned = false; // so the "no pictures" warning is only printed once

// Only one thing may change the alarms at a time (a check, or a /tea command).
const runExclusive = createQueue();

// ---- Who may use /tea ----------------------------------------------------

// Is this person allowed to use /tea? "roleIds" is the list of role IDs they have.
function canUse(userId, roleIds) {
  if (SETTINGS.alwaysAllowedUserIds.includes(userId)) return true;
  return roleIds.some((roleId) => SETTINGS.allowedRoleIds.includes(roleId));
}

// ---- Reading what time was asked for -------------------------------------

// Turns what someone typed into the moment the alarm should go off.
//   "15:30" or "15"  -> the next time the clock reads that, in the configured time zone
//   "20m", "1h 30m"  -> that long from now
// Returns { atMs } when it worked, or { error } with one of: 'format', 'tooSoon', 'tooFar'.
function parseAlarmTime(text, now = Date.now()) {
  const input = String(text ?? '').trim();

  const clockTime = parseTimeOfDay(input);
  let atMs;

  if (clockTime !== null) {
    atMs = nextOpening(now, clockTime, SETTINGS.timezone); // the next time the clock reads that
  } else {
    const wait = parseDuration(input);
    if (wait === null) return { error: 'format' };
    if (wait < MINUTE) return { error: 'tooSoon' };
    atMs = now + wait;
  }

  if (atMs - now > SETTINGS.maxAheadMs) return { error: 'tooFar' };
  return { atMs };
}

// ---- The cooldown --------------------------------------------------------

// Works out when the cooldown started: the time the most recent alarm was set, ignoring
// cancelled alarms. That is why cancelling resets the cooldown: the cancelled alarm stops
// counting, so a wrong time can be fixed straight away. (An alarm that was already sent,
// or missed, still counts, so cancelling when nothing is waiting changes nothing.)
function updateCooldownStart() {
  lastSetAtMs = 0;
  for (const alarm of alarms.values()) {
    if (alarm.status !== 'cancelled') lastSetAtMs = Math.max(lastSetAtMs, alarm.setAtMs);
  }
}

// ---- Reading and writing the sheet ---------------------------------------

// Opens the TeaAlarm tab, writing the headings first if the tab is empty.
async function getAlarmSheet() {
  const sheet = await getSheet(sheetIds.teaAlarm, SETTINGS.sheetTab);
  await ensureHeadings(sheet, HEADINGS);
  return sheet;
}

// Finds the row for an alarm, or undefined if it has no row.
function findRow(rows, alarmId) {
  return rows.find((row) => String(row.get('Alarm ID') ?? '').trim() === alarmId);
}

// Turns one row of the sheet into an alarm. Returns null for blank or unreadable rows.
function readAlarmRow(row) {
  const cell = (heading) => String(row.get(heading) ?? '').trim();

  const id = cell('Alarm ID');
  const alarmMs = Date.parse(cell('Alarm Time'));
  if (id === '' || Number.isNaN(alarmMs) || !/^\d+$/.test(cell('Channel ID'))) return null;

  const statusWord = cell('Status').toLowerCase();
  const setAtMs = Date.parse(cell('Set At'));

  return {
    id,
    alarmMs,
    channelId: cell('Channel ID'),
    channelName: cell('Channel Name'),
    serverName: cell('Server'),
    setBy: cell('Set By'),
    setById: cell('Set By ID'),
    setAtMs: Number.isNaN(setAtMs) ? 0 : setAtMs,
    status: ['pending', 'sent', 'cancelled', 'missed'].includes(statusWord) ? statusWord : statusWord.startsWith('failed') ? 'failed' : 'other',
    retryAtMs: null,
    unsaved: false,
  };
}

// All the values of an alarm as text, keyed by column heading.
function alarmToValues(alarm) {
  return {
    'Alarm ID': alarm.id,
    'Alarm Time': new Date(alarm.alarmMs).toISOString(),
    'Channel ID': alarm.channelId,
    'Channel Name': alarm.channelName,
    Server: alarm.serverName,
    'Set By': alarm.setBy,
    'Set By ID': alarm.setById,
    'Set At': new Date(alarm.setAtMs).toISOString(),
    Status: STATUS_TEXT[alarm.status] ?? alarm.status,
  };
}

// Reads the whole TeaAlarm tab into memory. What the bot has just done (but failed to
// save) is kept, so a Google hiccup never makes an alarm go off twice.
async function loadAlarms() {
  lastLoadAt = Date.now(); // set first, so a failure waits a while before trying again

  const sheet = await getAlarmSheet();
  const rows = await sheet.getRows();

  const loaded = new Map();
  const toSave = [];

  for (const row of rows) {
    const fresh = readAlarmRow(row);
    if (!fresh || loaded.has(fresh.id)) continue;

    const existing = alarms.get(fresh.id);
    if (existing) {
      fresh.retryAtMs = existing.retryAtMs;
      if (existing.unsaved) {
        fresh.status = existing.status; // keep what the bot did, and save it again below
        fresh.unsaved = true;
        toSave.push(fresh);
      }
    }

    loaded.set(fresh.id, fresh);
  }

  alarms = loaded;
  updateCooldownStart();
  everLoaded = true;

  for (const alarm of toSave) await saveStatus(alarm);
}

// Makes sure the sheet has been read at least once.
async function ensureLoaded() {
  if (!everLoaded) await loadAlarms();
}

// Saves an alarm's status. A failure to save is logged, not thrown, because the bot must keep going.
async function saveStatus(alarm) {
  try {
    const sheet = await getAlarmSheet();
    const row = findRow(await sheet.getRows(), alarm.id);

    if (!row) {
      alarms.delete(alarm.id); // the row was deleted from the sheet by hand
      return;
    }

    row.set('Status', STATUS_TEXT[alarm.status] ?? alarm.status);
    await row.save({ raw: true }); // raw: save the text exactly as written

    alarm.unsaved = false;
  } catch (error) {
    alarm.unsaved = true; // we will try again the next time the sheet is read
    console.error(`Could not save the tea alarm status: ${error.message}`);
  }
}

// ---- Sending an alarm ----------------------------------------------------

// Discord error codes that mean "the bot can no longer post in this channel":
// 10003 Unknown Channel, 50001 Missing Access, 50013 Missing Permissions.
const CHANNEL_GONE_CODES = [10003, 50001, 50013];
const MISSING_PERMISSIONS = 50013;

class ChannelUnavailableError extends Error {}

// Picks a random picture from the images folder. Returns null if there are none.
// Discord only accepts these kinds of picture, and files bigger than 8 MB are skipped.
function pickImage() {
  let files = [];

  try {
    files = fs
      .readdirSync(SETTINGS.imagesFolder)
      .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name))
      .filter((name) => fs.statSync(path.join(SETTINGS.imagesFolder, name)).size <= 8 * 1024 * 1024);
  } catch (error) {
    // The folder does not exist. That is fine, the alarm just goes out without a picture.
  }

  if (files.length === 0) {
    if (!noImagesWarned) {
      noImagesWarned = true;
      console.warn(`No pictures found in ${SETTINGS.imagesFolder}, so tea alarms will not have an image.`);
    }
    return null;
  }

  const name = pickRandom(files);
  const extension = path.extname(name).toLowerCase();

  // We give the file a plain name when attaching it, so odd characters in file names never matter.
  return { filePath: path.join(SETTINGS.imagesFolder, name), attachmentName: `tea${extension}` };
}

// Builds the message to post. It pings the person in the message text (a mention inside
// an embed would not notify them) and shows the embed below it.
function buildAlarmMessage(alarm, image) {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c) // yellow (Discord's own yellow). Change this to change the stripe colour.
      .setTitle('☕ Tea Alarm! ☕')
    .setDescription('Go put the kettle on!')
    .setFooter({ text: `Set by ${alarm.setBy}` });

  const message = {
    content: `<@${SETTINGS.pingUserId}>`,
    embeds: [embed],
    allowedMentions: { users: [SETTINGS.pingUserId] }, // only this person can be pinged
  };

  if (image) {
    embed.setImage(`attachment://${image.attachmentName}`);
    message.files = [new AttachmentBuilder(image.filePath, { name: image.attachmentName })];
  }

  return message;
}

// Posts an alarm in its channel.
async function sendAlarm(alarm) {
  let channel;
  try {
    channel = await discordClient.channels.fetch(alarm.channelId);
  } catch (error) {
    if (CHANNEL_GONE_CODES.includes(error.code)) throw new ChannelUnavailableError(error.message);
    throw error;
  }

  if (!channel || !channel.isSendable()) throw new ChannelUnavailableError('the channel cannot be posted in');

  const image = pickImage();

  try {
    await channel.send(buildAlarmMessage(alarm, image));
  } catch (error) {
    // Sending a picture needs the "Attach Files" permission. If that is what is missing,
    // send the alarm again without a picture, so the person still gets pinged.
    if (image && error.code === MISSING_PERMISSIONS) {
      console.warn('The bot is missing the Attach Files permission, so the tea alarm was sent without a picture.');
      try {
        await channel.send(buildAlarmMessage(alarm, null));
        return;
      } catch (retryError) {
        error = retryError;
      }
    }

    if (CHANNEL_GONE_CODES.includes(error.code)) throw new ChannelUnavailableError(error.message);
    throw error;
  }
}

// ---- The repeating check -------------------------------------------------

// Runs every few seconds. Sends any alarms that are due.
function tick() {
  return runExclusive(async () => {
    // Re-read the sheet now and then, to pick up changes made by hand.
    if (Date.now() - lastLoadAt >= SETTINGS.sheetRefreshMs) {
      try {
        await loadAlarms();
      } catch (error) {
        console.error(`Could not read the TeaAlarm sheet: ${error.message}`);
      }
    }

    const now = Date.now();

    for (const alarm of [...alarms.values()]) {
      if (alarm.status !== 'pending' || alarm.alarmMs > now) continue; // not due yet
      if (alarm.retryAtMs && alarm.retryAtMs > now) continue; // waiting to retry after an error

      // Too late (the bot was probably offline): skip it rather than ping at a silly time.
      if (now - alarm.alarmMs > SETTINGS.lateGraceMs) {
        alarm.status = 'missed';
        console.warn(`A tea alarm for ${new Date(alarm.alarmMs).toISOString()} was missed (the bot was offline).`);
        await saveStatus(alarm);
        continue;
      }

      try {
        await sendAlarm(alarm);
        alarm.status = 'sent';
        console.log(`[tea] Sent a tea alarm in #${alarm.channelName}`);
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          console.warn(`Could not send the tea alarm in #${alarm.channelName}: ${error.message}`);
          alarm.status = 'failed';
        } else {
          console.error(`Could not send the tea alarm in #${alarm.channelName}: ${error.message}`);
          alarm.retryAtMs = now + SETTINGS.retryAfterErrorMs; // try again soon, until it is too late
          continue;
        }
      }

      await saveStatus(alarm);
    }
  });
}

// Starts the tea alarms. Call this once, when the bot is ready.
// Returns how many alarms are waiting (0 if the sheet could not be read yet).
async function startTeaAlarms(client) {
  discordClient = client;

  let waiting = 0;
  try {
    await runExclusive(loadAlarms);
    waiting = [...alarms.values()].filter((alarm) => alarm.status === 'pending').length;
  } catch (error) {
    // Not fatal: the check below tries again every few minutes.
    console.warn(`Tea alarms are waiting for the TeaAlarm sheet: ${error.message}`);
  }

  clearInterval(timer);
  timer = setInterval(() => {
    tick().catch((error) => console.error('Tea alarm check failed:', error));
  }, SETTINGS.checkEveryMs);

  return waiting;
}

// Stops the repeating check (used by tests).
function stopTeaAlarms() {
  clearInterval(timer);
  timer = null;
}

// ---- Functions for the /tea command --------------------------------------

// When the next alarm may be set (a time in milliseconds), or 0 if one can be set right now.
function nextAllowedTime(now = Date.now()) {
  const end = lastSetAtMs + SETTINGS.cooldownMs;
  return end > now ? end : 0;
}

// Sets an alarm. "details" has: atMs, channelId, channelName, serverName, setBy, setById.
// Returns { ok: true, alarm } or, if the cooldown is running, { ok: false, nextAllowedMs }.
function setAlarm(details) {
  return runExclusive(async () => {
    await ensureLoaded();

    const now = Date.now();
    const blockedUntil = nextAllowedTime(now);
    if (blockedUntil > 0) return { ok: false, nextAllowedMs: blockedUntil };

    const alarm = {
      id: `${now.toString(36)}${randomInt(1000, 9999)}`, // a unique ID such as "lq1x8a2g4821"
      alarmMs: details.atMs,
      channelId: details.channelId,
      channelName: details.channelName,
      serverName: details.serverName,
      setBy: details.setBy,
      setById: details.setById,
      setAtMs: now,
      status: 'pending',
      retryAtMs: null,
      unsaved: false,
    };

    // Save first. If saving fails, the command reports a problem and no alarm exists.
    await appendRow(sheetIds.teaAlarm, SETTINGS.sheetTab, alarmToValues(alarm));

    alarms.set(alarm.id, alarm);
    updateCooldownStart(); // the cooldown starts now
    return { ok: true, alarm };
  });
}

// Cancels every waiting alarm in a channel. Returns the alarms that were cancelled.
// A cancelled alarm stops counting towards the cooldown, so after cancelling, a new
// alarm can be set straight away (this lets a wrong time be fixed easily).
function cancelAlarms(channelId) {
  return runExclusive(async () => {
    await ensureLoaded();

    const cancelled = [...alarms.values()].filter((alarm) => alarm.status === 'pending' && alarm.channelId === channelId);

    for (const alarm of cancelled) {
      alarm.status = 'cancelled';
      await saveStatus(alarm);
    }

    updateCooldownStart();
    return cancelled;
  });
}

// The waiting alarms in a channel, soonest first.
function getPending(channelId) {
  return runExclusive(async () => {
    await ensureLoaded();
    return [...alarms.values()]
      .filter((alarm) => alarm.status === 'pending' && alarm.channelId === channelId)
      .sort((a, b) => a.alarmMs - b.alarmMs);
  });
}

module.exports = {
  startTeaAlarms,
  stopTeaAlarms,
  setAlarm,
  cancelAlarms,
  getPending,
  nextAllowedTime,
  canUse,
  parseAlarmTime,
  readSettings,
  tick,
  settings: SETTINGS,
};
