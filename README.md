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

## Wispbyte setup

- Docker image: `nodejs_24`
- Startup file: `index.js`
- Environment variable: `DISCORD_TOKEN`
- The server pulls `main` from GitHub on every start and runs `npm install` itself.
