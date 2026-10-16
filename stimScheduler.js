// stimScheduler.js
//
// The brain behind the random stims. It does three jobs:
//   1. Remembers which channels are set up for stims (kept in the "Stims" Google Sheet).
//   2. Every few seconds, checks whether a stim is due and says it.
//   3. Gives the /stim command a few functions to change the settings.
//
// HOW A SESSION WORKS
//   - The bot picks ONE stim at random (never the same one as the last session).
//   - It says that stim 1 to 5 times, waiting 30 minutes to 2 hours between each.
//   - If the next repeat would land outside the active hours, the session ends early
//     and a new one starts when the active hours next open (plus a little random delay).
//   - After a normal session, the next one starts somewhere between the channel's
//     "min" and "max" gap, moved into the active hours if it would land outside them.
//   - Everything the bot needs to carry on after a restart is saved in the sheet.
//
// The numbers (1 to 5 repeats, 30m to 2h, and so on) are in config.js.
// The stims themselves are the files in the "stims" folder.

const { getSheet, ensureHeadings, appendRow } = require('./sheets');
const { sheetIds, stims: stimConfig } = require('./config');
const { loadStims } = require('./loadFiles');
const {
  parseDuration,
  formatDuration,
  parseTimeOfDay,
  formatTimeOfDay,
  resolveTimeZone,
  isWithinActive,
  windowMinutes,
  nextOpening,
} = require('./timeUtils');
const { randomInt, randomBetween, pickRandom } = require('./random');

// ---- Settings (read from config.js) --------------------------------------
// Turns the friendly text in config.js ("30m", "2h") into numbers the code can use.
// If something in config.js is wrong, this says exactly which setting and why.
function readSettings() {
  const duration = (text, label, options) => {
    const ms = parseDuration(text, options);
    if (ms === null) {
      throw new Error(
        `config.js: stims.${label} is "${text}", which is not a valid length of time. ` +
          'Use a number plus m, h or d, like "30m" or "2h".'
      );
    }
    return ms;
  };

  const settings = {
    sheetTab: stimConfig.sheetTab,
    repeatsMin: stimConfig.repeatsPerSession.min,
    repeatsMax: stimConfig.repeatsPerSession.max,
    repeatGapMinMs: duration(stimConfig.repeatGap.min, 'repeatGap.min'),
    repeatGapMaxMs: duration(stimConfig.repeatGap.max, 'repeatGap.max'),
    startJitterMs: duration(stimConfig.startJitter, 'startJitter', { allowZero: true }),
    defaultTimezone: resolveTimeZone(stimConfig.defaultTimezone),
    gapLimitMinMs: duration(stimConfig.sessionGapLimits.min, 'sessionGapLimits.min'),
    gapLimitMaxMs: duration(stimConfig.sessionGapLimits.max, 'sessionGapLimits.max'),
    checkEveryMs: stimConfig.checkEverySeconds * 1000,
    sheetRefreshMs: duration(stimConfig.sheetRefresh, 'sheetRefresh'),
    missedAfterMs: duration(stimConfig.missedAfter, 'missedAfter'),
    retryAfterErrorMs: duration(stimConfig.retryAfterError, 'retryAfterError'),
  };

  if (!Number.isInteger(settings.repeatsMin) || !Number.isInteger(settings.repeatsMax) || settings.repeatsMin < 1 || settings.repeatsMin > settings.repeatsMax) {
    throw new Error('config.js: stims.repeatsPerSession needs whole numbers, with min at least 1 and max at least min.');
  }
  if (settings.repeatGapMinMs > settings.repeatGapMaxMs) {
    throw new Error('config.js: stims.repeatGap.min must not be longer than stims.repeatGap.max.');
  }
  if (settings.gapLimitMinMs > settings.gapLimitMaxMs) {
    throw new Error('config.js: stims.sessionGapLimits.min must not be longer than sessionGapLimits.max.');
  }
  if (!settings.defaultTimezone) {
    throw new Error(`config.js: stims.defaultTimezone "${stimConfig.defaultTimezone}" is not a real time zone. Try "Europe/London".`);
  }
  if (!(settings.checkEveryMs >= 5000)) {
    throw new Error('config.js: stims.checkEverySeconds must be at least 5.');
  }

  return settings;
}

const SETTINGS = readSettings();

// The column headings of the Stims tab, in order. The bot writes them itself if the tab is empty.
const HEADINGS = [
  'Channel ID',
  'Channel Name',
  'Server',
  'Status',
  'Active From',
  'Active Until',
  'Timezone',
  'Min Gap',
  'Max Gap',
  'Next Run',
  'Stims Left',
  'Current Stim',
  'Set By',
];

// The columns the bot changes while it runs. Everything else is only written by /stim set,
// so that edits you make by hand to hours and gaps are never overwritten by an old copy.
const RUNTIME_HEADINGS = ['Status', 'Next Run', 'Stims Left', 'Current Stim'];

// ---- The stims -----------------------------------------------------------
const stims = loadStims();
const stimsByName = new Map(stims.map((stim) => [stim.name, stim]));

// Turns text into Discord "small text" by putting -# at the start of every line.
function toSmallText(text) {
  return String(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `-# ${line}`)
    .join('\n');
}

// Picks a stim at random, avoiding the one used last time (if there is any other choice).
function chooseStim(lastName) {
  const others = stims.filter((stim) => stim.name !== lastName);
  return pickRandom(others.length > 0 ? others : stims) ?? null;
}

// ---- What the bot remembers ----------------------------------------------
// One entry per channel, keyed by channel ID. Each entry looks like:
//   channelId, channelName, serverName, setBy
//   status          'active', 'off', 'paused' or 'other'
//   statusText      the words shown in the sheet's Status column
//   activeFrom, activeUntil   minutes since midnight (10:00 is 600)
//   timezone        like 'Europe/London'
//   minGapMs, maxGapMs        the wait between sessions
//   nextRunMs       when the next stim is due (or null)
//   repeatsLeft     how many more times the current stim will be said
//   currentStim     the name of the current stim (kept after the session as "last used")
//   catchUp         true if this stim was missed while the bot was offline
//   unsaved         true if the last save to the sheet failed
//   problem         text if the row in the sheet cannot be understood
let channels = new Map();

let discordClient = null; // the Discord bot, set when the scheduler starts
let timer = null; // the repeating check
let lastLoadAt = 0; // when we last read the sheet
let everLoaded = false; // has the sheet been read successfully at least once?
const warned = new Set(); // problems we have already told the console about

// Only one thing may change the schedule at a time (a check, or a /stim command). This
// queues them up so they never trip over each other.
let queue = Promise.resolve();
function runExclusive(task) {
  const result = queue.then(task);
  queue = result.catch(() => {}); // a failure must not block the queue for the next task
  return result;
}

// ---- Planning times ------------------------------------------------------

// The first moment after "afterMs" that the active hours open, plus a small random delay
// so it is not exactly on the dot. The delay never pushes it past the end of the window.
function openingWithJitter(state, afterMs) {
  const opening = nextOpening(afterMs, state.activeFrom, state.timezone);
  const room = (windowMinutes(state.activeFrom, state.activeUntil) - 1) * 60 * 1000;
  return opening + randomBetween(0, Math.min(SETTINGS.startJitterMs, room));
}

// If a time lands outside the active hours, move it to just after they next open.
function shiftIntoWindow(state, candidateMs) {
  if (isWithinActive(candidateMs, state.activeFrom, state.activeUntil, state.timezone)) return candidateMs;
  return openingWithJitter(state, candidateMs);
}

// A session just finished (or the channel was just set up): plan when the next one starts.
function planNextSession(state, now) {
  state.repeatsLeft = 0;
  state.nextRunMs = shiftIntoWindow(state, now + randomBetween(state.minGapMs, state.maxGapMs));
}

// A stim was just said and there are repeats left: plan the next repeat.
function planNextRepeat(state, now) {
  const candidate = now + randomBetween(SETTINGS.repeatGapMinMs, SETTINGS.repeatGapMaxMs);

  if (isWithinActive(candidate, state.activeFrom, state.activeUntil, state.timezone)) {
    state.nextRunMs = candidate;
    return;
  }

  // The next repeat would be outside the active hours, so end the session early and
  // start a new one when the hours next open.
  state.repeatsLeft = 0;
  state.nextRunMs = openingWithJitter(state, candidate);
}

// ---- Reading and writing the sheet ---------------------------------------

// Opens the Stims tab, writing the headings first if the tab is empty.
async function getStimSheet() {
  const sheet = await getSheet(sheetIds.stims, SETTINGS.sheetTab);
  await ensureHeadings(sheet, HEADINGS);
  return sheet;
}

// Finds the row for a channel, or undefined if it has no row.
function findRow(rows, channelId) {
  return rows.find((row) => String(row.get('Channel ID') ?? '').trim() === channelId);
}

// Turns one row of the sheet into a channel entry. Returns null for blank or junk rows.
function readChannelRow(row) {
  const cell = (heading) => String(row.get(heading) ?? '').trim();

  const channelId = cell('Channel ID');
  if (!/^\d+$/.test(channelId)) return null;

  const statusText = cell('Status');
  const statusWord = statusText.toLowerCase();

  const state = {
    channelId,
    channelName: cell('Channel Name'),
    serverName: cell('Server'),
    setBy: cell('Set By'),
    statusText,
    status: statusWord === 'active' ? 'active' : statusWord === 'off' ? 'off' : statusWord.startsWith('paused') ? 'paused' : 'other',
    activeFrom: parseTimeOfDay(cell('Active From')),
    activeUntil: parseTimeOfDay(cell('Active Until')),
    timezone: resolveTimeZone(cell('Timezone')),
    minGapMs: parseDuration(cell('Min Gap')),
    maxGapMs: parseDuration(cell('Max Gap')),
    nextRunMs: Number.isNaN(Date.parse(cell('Next Run'))) ? null : Date.parse(cell('Next Run')),
    repeatsLeft: Number.parseInt(cell('Stims Left'), 10) || 0,
    currentStim: cell('Current Stim'),
    catchUp: false,
    unsaved: false,
    problem: null,
  };

  // Work out whether the settings make sense, so a typo in the sheet cannot break the bot.
  if (state.activeFrom === null) state.problem = '"Active From" is not a time like 10 or 10:30';
  else if (state.activeUntil === null) state.problem = '"Active Until" is not a time like 22 or 22:30';
  else if (!state.timezone) state.problem = '"Timezone" is not a real time zone like Europe/London';
  else if (state.minGapMs === null) state.problem = '"Min Gap" is not a length of time like 12h';
  else if (state.maxGapMs === null) state.problem = '"Max Gap" is not a length of time like 3d';
  else if (state.minGapMs > state.maxGapMs) state.problem = '"Min Gap" is longer than "Max Gap"';

  return state;
}

// Reads the whole Stims tab into memory. Settings come from the sheet; what the bot is
// in the middle of doing (next time, repeats left) stays as the bot remembers it.
async function loadChannels() {
  lastLoadAt = Date.now(); // set first, so a failure waits a while before trying again

  const sheet = await getStimSheet();
  const rows = await sheet.getRows();
  const now = Date.now();

  const loaded = new Map();
  const toSave = [];

  for (const row of rows) {
    const fresh = readChannelRow(row);
    if (!fresh || loaded.has(fresh.channelId)) continue; // junk row, or a repeat of a channel

    const existing = channels.get(fresh.channelId);

    if (existing && existing.status === 'active' && fresh.status === 'active' && !fresh.problem) {
      // Carry on from where the bot was.
      fresh.nextRunMs = existing.nextRunMs;
      fresh.repeatsLeft = existing.repeatsLeft;
      fresh.currentStim = existing.currentStim || fresh.currentStim;
      fresh.catchUp = existing.catchUp;
      fresh.unsaved = existing.unsaved;
    } else if (existing && existing.status !== 'active' && fresh.status === 'active') {
      // Someone switched the channel back to Active in the sheet: start fresh.
      fresh.nextRunMs = null;
      fresh.repeatsLeft = 0;
    } else if (!existing && fresh.status === 'active' && fresh.nextRunMs !== null && fresh.nextRunMs < now - SETTINGS.missedAfterMs) {
      // The bot has just started and this stim was due while it was offline.
      fresh.catchUp = true;
    }

    if (fresh.problem && fresh.status === 'active') {
      const message = `Stim channel ${fresh.channelId} is skipped: ${fresh.problem}.`;
      if (!warned.has(message)) {
        warned.add(message);
        console.warn(message);
      }
    }

    // A brand new channel (or one with no next time) needs a first session planned.
    if (fresh.status === 'active' && !fresh.problem && fresh.nextRunMs === null) {
      planNextSession(fresh, now);
      toSave.push(fresh);
    } else if (fresh.unsaved) {
      toSave.push(fresh);
    }

    loaded.set(fresh.channelId, fresh);
  }

  channels = loaded;
  everLoaded = true;

  for (const state of toSave) await saveRuntime(state);
}

// Makes sure the sheet has been read at least once.
async function ensureLoaded() {
  if (!everLoaded) await loadChannels();
}

// Saves the changing parts of a channel (status, next time, repeats left, current stim).
// A failure to save is logged, not thrown, because the bot must keep going.
async function saveRuntime(state) {
  try {
    const sheet = await getStimSheet();
    const row = findRow(await sheet.getRows(), state.channelId);

    if (!row) {
      channels.delete(state.channelId); // the row was deleted from the sheet by hand
      return;
    }

    const values = stateToValues(state);
    for (const heading of RUNTIME_HEADINGS) row.set(heading, values[heading]);
    await row.save({ raw: true }); // raw: save the text exactly as written

    state.unsaved = false;
  } catch (error) {
    state.unsaved = true; // we will try again the next time the sheet is read
    console.error(`Could not save the stim schedule for #${state.channelName}: ${error.message}`);
  }
}

// All the values of a channel as text, keyed by column heading.
function stateToValues(state) {
  return {
    'Channel ID': state.channelId,
    'Channel Name': state.channelName,
    Server: state.serverName,
    Status: state.statusText,
    'Active From': formatTimeOfDay(state.activeFrom),
    'Active Until': formatTimeOfDay(state.activeUntil),
    Timezone: state.timezone,
    'Min Gap': formatDuration(state.minGapMs),
    'Max Gap': formatDuration(state.maxGapMs),
    'Next Run': state.nextRunMs ? new Date(state.nextRunMs).toISOString() : '',
    'Stims Left': String(state.repeatsLeft),
    'Current Stim': state.currentStim,
    'Set By': state.setBy,
  };
}

// ---- Saying a stim -------------------------------------------------------

// Discord error codes that mean "the bot can no longer post in this channel":
// 10003 Unknown Channel, 50001 Missing Access, 50013 Missing Permissions.
const CHANNEL_GONE_CODES = [10003, 50001, 50013];

class ChannelUnavailableError extends Error {}

// Posts the channel's current stim in small text. Returns the text that was posted.
async function sendStim(state) {
  const text = toSmallText(stimsByName.get(state.currentStim).generate());

  let channel;
  try {
    channel = await discordClient.channels.fetch(state.channelId);
  } catch (error) {
    if (CHANNEL_GONE_CODES.includes(error.code)) throw new ChannelUnavailableError(error.message);
    throw error;
  }

  if (!channel || !channel.isSendable()) throw new ChannelUnavailableError('the channel cannot be posted in');

  try {
    // parse: [] means this message can never ping anyone.
    await channel.send({ content: text, allowedMentions: { parse: [] } });
  } catch (error) {
    if (CHANNEL_GONE_CODES.includes(error.code)) throw new ChannelUnavailableError(error.message);
    throw error;
  }

  return text;
}

// A stim is due for this channel. Say it (if allowed) and plan what happens next.
async function processDue(state, now) {
  // Outside the active hours (for example the bot was offline overnight, or the hours
  // were changed): say nothing, end any session and wait for the hours to open.
  if (!isWithinActive(now, state.activeFrom, state.activeUntil, state.timezone)) {
    state.catchUp = false;
    state.repeatsLeft = 0;
    state.nextRunMs = openingWithJitter(state, now);
    await saveRuntime(state);
    return;
  }

  // No session in progress (or its stim file was deleted): start a new one.
  if (state.repeatsLeft <= 0 || !stimsByName.has(state.currentStim)) {
    const stim = chooseStim(state.currentStim);
    if (!stim) {
      console.warn('There are no stims in the stims folder, so nothing can be said.');
      state.nextRunMs = now + SETTINGS.retryAfterErrorMs;
      return;
    }

    state.currentStim = stim.name;
    state.repeatsLeft = randomInt(SETTINGS.repeatsMin, SETTINGS.repeatsMax);
  }

  // The bot was offline when this was due: say it once, then start a fresh session.
  if (state.catchUp) state.repeatsLeft = 1;

  try {
    await sendStim(state);
  } catch (error) {
    if (error instanceof ChannelUnavailableError) {
      // We cannot post here any more. Pause the channel instead of trying forever.
      console.warn(`Pausing stims in #${state.channelName} (${state.channelId}): ${error.message}`);
      state.status = 'paused';
      state.statusText = 'Paused (the bot cannot post in this channel)';
      state.nextRunMs = null;
      state.repeatsLeft = 0;
    } else {
      console.error(`Could not say a stim in #${state.channelName}: ${error.message}`);
      state.nextRunMs = now + SETTINGS.retryAfterErrorMs;
    }
    await saveRuntime(state);
    return;
  }

  state.catchUp = false;
  state.repeatsLeft -= 1;
  console.log(`[stim] #${state.channelName}: said "${state.currentStim}" (${state.repeatsLeft} repeat(s) left in this session)`);

  if (state.repeatsLeft > 0) planNextRepeat(state, now);
  else planNextSession(state, now);

  await saveRuntime(state);
}

// ---- The repeating check -------------------------------------------------

// Runs every few seconds. Says any stims that are due.
function tick() {
  return runExclusive(async () => {
    // Re-read the sheet now and then, to pick up changes made by hand.
    if (Date.now() - lastLoadAt >= SETTINGS.sheetRefreshMs) {
      try {
        await loadChannels();
      } catch (error) {
        console.error(`Could not read the Stims sheet: ${error.message}`);
      }
    }

    const now = Date.now();

    for (const state of [...channels.values()]) {
      if (state.status !== 'active' || state.problem) continue;
      if (state.nextRunMs === null || state.nextRunMs > now) continue; // not due yet

      try {
        await processDue(state, now);
      } catch (error) {
        console.error(`Stim error in #${state.channelName}: ${error.message}`);
        state.nextRunMs = now + SETTINGS.retryAfterErrorMs;
      }
    }
  });
}

// Starts the scheduler. Call this once, when the bot is ready.
// Returns how many channels are set up (0 if the sheet could not be read yet).
async function startStimScheduler(client) {
  discordClient = client;

  let count = 0;
  try {
    await runExclusive(loadChannels);
    count = channels.size;
  } catch (error) {
    // Not fatal: the check below tries again every few minutes.
    console.warn(`Stims are waiting for the Stims sheet: ${error.message}`);
  }

  clearInterval(timer);
  timer = setInterval(() => {
    tick().catch((error) => console.error('Stim check failed:', error));
  }, SETTINGS.checkEveryMs);

  return count;
}

// Stops the repeating check (used by tests).
function stopStimScheduler() {
  clearInterval(timer);
  timer = null;
}

// ---- Functions for the /stim command -------------------------------------

// Sets up (or overwrites) stims for a channel. "settings" has:
//   channelId, channelName, serverName, activeFrom, activeUntil, timezone,
//   minGapMs, maxGapMs, setBy
// Returns the new channel entry, including when the first stim is due.
function configureChannel(settings) {
  return runExclusive(async () => {
    await ensureLoaded();

    const previous = channels.get(settings.channelId);
    const state = {
      ...settings,
      status: 'active',
      statusText: 'Active',
      repeatsLeft: 0,
      currentStim: previous ? previous.currentStim : '',
      nextRunMs: null,
      catchUp: false,
      unsaved: false,
      problem: null,
    };
    planNextSession(state, Date.now());

    // Update the channel's row if it has one, otherwise add a new row.
    const sheet = await getStimSheet();
    const row = findRow(await sheet.getRows(), state.channelId);
    const values = stateToValues(state);

    if (row) {
      for (const heading of HEADINGS) row.set(heading, values[heading]);
      await row.save({ raw: true });
    } else {
      await appendRow(sheetIds.stims, SETTINGS.sheetTab, values);
    }

    channels.set(state.channelId, state);
    return state;
  });
}

// Stops stims in a channel (the settings stay in the sheet). Returns false if the
// channel was never set up.
function disableChannel(channelId) {
  return runExclusive(async () => {
    await ensureLoaded();

    const state = channels.get(channelId);
    if (!state) return false;

    state.status = 'off';
    state.statusText = 'Off';
    state.nextRunMs = null;
    state.repeatsLeft = 0;
    await saveRuntime(state);
    return true;
  });
}

// The settings of a channel, or null if it was never set up.
function getChannelStatus(channelId) {
  return runExclusive(async () => {
    await ensureLoaded();
    return channels.get(channelId) ?? null;
  });
}

module.exports = {
  startStimScheduler,
  stopStimScheduler,
  configureChannel,
  disableChannel,
  getChannelStatus,
  readSettings,
  toSmallText,
  tick,
  stims,
};
