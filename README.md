# WraithStationBot

JesterStation, a Discord bot for Wraithstation. Mostly party tricks.

## How it is laid out

| Path | What it is |
|---|---|
| `index.js` | Starts the bot. Wispbyte runs this file. |
| `commands/` | One file per slash command. The file name is the command name (`ping.js` is `/ping`). |
| `triggers/` | One file per chat trigger (the bot reacting to words in normal messages). |
| `stims/` | One file per random stim (a phrase the bot says on its own). See "Random stims" below. |
| `staffTrigger.js` | The shared code behind the "silly [name]" and "good job [name]" triggers. |
| `stimScheduler.js` | Decides when each channel stims, and says them. |
| `teaAlarm.js` | Saves, schedules and sends the tea alarms. |
| `images/tea/` | Pictures for the tea alarm. The bot picks one at random. |
| `timeUtils.js`, `random.js`, `taskQueue.js` | Small helpers for times, time zones, random numbers and running one task at a time. |
| `loadFiles.js` | Reads the two folders above and checks the files are written correctly. |
| `check.js` | Safety check, run with `npm run check`. Needs no token. |
| `config.js` | Non-secret settings, such as the Google Sheet IDs. Safe to put on GitHub. |
| `sheets.js` | Signs in to Google Sheets. Triggers and commands use it to read and write the spreadsheet. |
| `.env` | Holds `DISCORD_TOKEN`. Set in the Wispbyte Environment tab. Never committed. |

## Adding a slash command

1. Copy `commands/ping.js` and rename it to the new command name.
2. Change the name, description and what `execute()` does.
3. Run `npm run check` on your PC.
4. Commit and push to `main`.
5. Restart the server on Wispbyte. The bot registers the new command on startup.

## Adding a chat trigger

1. Copy `triggers/whattime.js` and rename it.
2. Change the `pattern` (the words to react to) and what `execute()` does.
3. Run `npm run check`, push, and restart the server.

## Google Sheets

The "silly [name]" and "good job [name]" triggers read their staff list from a Google Sheet and save their
cooldown times there. The shared code is in `staffTrigger.js`.

The spreadsheet needs a tab called `Staff` with these headings in row 1:

| Heading | Used for |
|---|---|
| `Name` | The staff names. Add or remove names here. The bot picks up changes within 5 minutes. |
| `Last Silly` | The bot saves when it last said "Silly [name]" here (the silly trigger's cooldown). |
| `Last Good Job` | The bot saves when it last said "Good job [name]" here (the good job trigger's cooldown). |

The bot fills in the two `Last ...` columns itself. Do not type in them. Each trigger has its own column, so they
never affect each other's cooldown, and each name has its own cooldown within each trigger. Both cooldowns are
20 minutes (change `COOLDOWN_MINUTES` in `triggers/sillystaff.js` and `triggers/goodjob.js`).

To add another "[phrase] [name]" trigger, copy `triggers/goodjob.js`, change the phrase and reply, and add a new
`Last ...` column to the sheet for it.

### Feature suggestions

`/feature` saves what someone types as a new row in the `Suggestions` tab of the suggestions spreadsheet:
`Date`, `Suggested By` (Discord username), `Suggestion` and `Server`. If the tab is empty, the bot writes
those headings itself. Suggestions are saved as plain text, so they can never run as spreadsheet formulas.

The tab can be formatted as a Google Sheets table (Format > Convert to table). The bot adds each new row
inside the table so it grows. Extra columns you add (such as "Wraith Approved?" and "Implemented?") are left
empty by the bot. Keep the four column headings above spelled exactly as they are.

### Random stims

The bot randomly says short phrases ("stims") in small text, but only in channels set up with `/stim`.

- **The stims** are the files in `stims/`. Each exports `generate()`, which returns the text. To add one, copy a
  file in that folder. Nobody can add stims through Discord.
- **A session** picks one stim at random and says it 1 to 5 times, a short wait apart. Those numbers (the number of
  repeats and the wait between them) are in `config.js` under `stims`. If the next repeat would fall outside the active hours, the session ends early.
  A channel's repeats are never spaced further apart than its own `/stim` max wait (for example, a channel with
  `max:10m` repeats every 10 minutes or less, even if `config.js` allows up to 30 minutes).
- **`/stim set from:10 until:22 min:12h max:3d`** (optional `timezone:`, default `Europe/London`) starts stims in the
  current channel. `min` and `max` are the wait between sessions (use `m`, `h` or `d`). Running it again in the same
  channel overwrites the old settings. `/stim off` stops it and `/stim status` shows the settings.
  Only people with the Manage Channels permission can use `/stim`.
- **The `Stims` tab** of the stims spreadsheet stores each channel's settings and schedule, so a restart carries on
  where it left off. The bot writes the headings itself. You can edit the hours and gaps there by hand (changes are
  picked up within 5 minutes), and set `Status` to `Active` to turn a paused channel back on.

### Tea alarm

`/tea set time:15:30` (or `time:20m`) pings one person (set in `config.js`) in that channel at that time, with a
"Tea Alarm!" embed and a random picture from `images/tea/`.

- Clock times are read in UK time (`teaAlarm.timezone` in `config.js`). Waits use `m`, `h` or `d`.
- Only people with a role listed in `teaAlarm.allowedRoleIds` can use it (and the people in `alwaysAllowedUserIds`).
  To allow another role, add its ID to that list.
- Only one alarm can be set per hour, shared by everyone (`teaAlarm.cooldown`). Cancelling a waiting alarm resets
  the limit, so a wrong time can be fixed straight away.
- Times in the messages use Discord's own timestamp, so each person sees them in their own time zone.
- Alarms can be set up to 7 days ahead (`maxAhead`). If the bot was offline when one was due, it still sends it if
  it is at most 15 minutes late (`lateGrace`), otherwise the alarm is marked `Missed`.
- `/tea cancel` cancels the waiting alarms in the channel and `/tea status` lists them.
- Alarms are saved in the `TeaAlarm` tab (the bot writes the headings itself), so a restart loses nothing.
- Pictures need the **Attach Files** permission. Without it, the alarm is sent without a picture.

### Love for Wraith

When someone says "ily wraith", "I love you wraith", "I love WraithStation" and similar (`triggers/lovewraith.js`),
the bot reacts to that message with ❤️ and 🤖. An @mention of Wraith works too (Wraith's user ID is in that file).
To change the reactions or the ways of saying it, edit the settings at the top of that file.
It needs the **Add Reactions** permission.

### Thanking the bot

When someone says "thanks bot", "thank you jester", "ty jesterstation" and similar (`triggers/thanksbot.js`), the bot
replies "You're welcome @user", mentioning the person who said thanks. An @mention of the bot works too (the bot's user
ID is in that file). To change the answer or the names it responds to, edit the settings at the top of that file.

### Sponsor shout-out

`/sponsor` posts an embed saying "JesterStation Was brought to you by: SteveStreamsUK !!" with Steve's icon
(`images/steve/steve_icon.png`). To change the wording, picture or colour, edit the three settings at the top of
`commands/sponsor.js`. Like the tea pictures, the image needs the **Attach Files** permission. Without it, the
shout-out is still posted, just without the picture.

### Sharing

Every spreadsheet must be shared (as Editor) with the service account's email address.
Sheet IDs are not secret, so they are listed in `config.js` (`sheetIds`). To add a new spreadsheet for a
future feature, share it with the service account and add a line to `config.js`.

Environment variables to set in the Wispbyte Environment tab (these ARE secret):

| Variable | What it is |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The `client_email` value from the Google JSON key file |
| `GOOGLE_PRIVATE_KEY` | The `private_key` value from the Google JSON key file |

## Wispbyte setup

- Docker image: `nodejs_24`
- Startup file: `index.js`
- Environment variable: `DISCORD_TOKEN`
- The server pulls `main` from GitHub on every start and runs `npm install` itself.
