# WraithStationBot

JesterStation, a Discord bot for Wraithstation. Mostly party tricks.

## How it is laid out

| Path | What it is |
|---|---|
| `index.js` | Starts the bot. Wispbyte runs this file. |
| `commands/` | One file per slash command. The file name is the command name (`ping.js` is `/ping`). |
| `triggers/` | One file per chat trigger (the bot reacting to words in normal messages). |
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

The "silly [name]" trigger reads its staff list from a Google Sheet and saves its cooldown times there.

The spreadsheet needs a tab called `Staff` with two headings in row 1: `Name` and `Last Said`.
Add or remove names in the `Name` column. The bot picks up changes within 5 minutes.
The bot fills in `Last Said` itself. Do not type in that column.
Each name has its own 30 minute cooldown (change `COOLDOWN_MINUTES` in `triggers/sillystaff.js`).

### Feature suggestions

`/feature` saves what someone types as a new row in the `Suggestions` tab of the suggestions spreadsheet:
`Date`, `Suggested By` (Discord username), `Suggestion` and `Server`. If the tab is empty, the bot writes
those headings itself. Suggestions are saved as plain text, so they can never run as spreadsheet formulas.

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
