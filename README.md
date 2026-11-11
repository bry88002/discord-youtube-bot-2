# Discord Activity Limit Bot

This branch focuses on daily member activity limits. The legacy music slash commands are disabled; the music implementation remains in the source tree but is not registered with Discord.

## Active command

`/limits` enrolls members and manages their daily game/voice activity limits.

### Legacy music commands (disabled)

The legacy commands below are retained in the source tree only; they are not registered with Discord and are unavailable.

| Command   | What it does                                                                                          | Screenshot                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| /play     | Play something straight away with a URL or search query.                                              |                                                                                                                 |
| /pause    | Pause the current playing audio.                                                                      |                                                                                                                 |
| /resume   | Unpause the bot.                                                                                      |                                                                                                                 |
| /volume   | Set the audio playback volume of the bot. Affects all listeners.                                      |                                                                                                                 |
| /enqueue  | Add a video to the queue.                                                                             |                                                                                                                 |
| /playlist | Bulk import a playlist into the queue using a URL.                                                    | ![image](https://user-images.githubusercontent.com/28375223/149211596-8a1ad057-c463-45c2-ad37-6ba3a984a5b9.png) |
| /controls | A message with interactive buttons to play, pause, skip and stop. It also has live video information. | ![image](https://user-images.githubusercontent.com/28375223/149210616-a6bc07c2-a5f0-4eae-86c8-e7e53f419879.png) |
| /queue    | Get a list of items in the queue.                                                                     | ![image](https://user-images.githubusercontent.com/28375223/149210674-91b6b489-8aab-4997-82c7-c6e41c70ab4c.png) |
| /shuffle  | Shuffle the queue.                                                                                    |                                                                                                                 |
| /move     | Move an item in the queue from its current position to a new one.                                     |                                                                                                                 |
| /clean    | Clean the queue by removing duplicates. The bot will tell you how many duplicates were removed.       |                                                                                                                 |
| /start    | Start playing the queue whilst the bot is inactive.                                                   |                                                                                                                 |
| /stop     | Stop the playing of audio and disconnect the bot.                                                     |                                                                                                                 |
| /skip     | Skip the current item in the queue. Disconnects if the queue is empty.                                |                                                                                                                 |
| /search   | Search and pick a video to add to the queue using an interactive dropdown.                            | ![image](https://user-images.githubusercontent.com/28375223/149211506-5871f652-9116-49f0-8c97-7d63209ffb0c.png) |
| /remove   | With a queue number, remove a specific item from the queue.                                           |                                                                                                                 |
| /loop     | Loop the queue.                                                                                       |                                                                                                                 |

Discord may take up to an hour to remove the previously registered music commands after the bot updates its slash-command list.

## Technologies

This bot uses Node.js, TypeScript, Discord.js v13, Redis Stack, and Docker Compose.

- Node.js v16/v17
- Discord.js v13
- TypeScript
- Redis (using the new v4 npm library)

The bot currently uses Discord's slash-command interface for `/limits`.

Advantages of v13:

- Typing "/" in a server text channel shows available commands and their options.
- Commands can be autocompleted and give you a description of each argument as you go.
- Discord type checks your arguments and enforces required arguments so its much harder to make a mistake typing a command.
- No conflict with other bots that are also using slash commands. This bot will ALWAYS use a forward slash to initiate a command.

## Setup for production

1. Install Docker, Docker Compose and Git for your own OS. Linux is highly recommended as a platform to host this bot on. Windows (Server) will work, but you will be missing out on a lot of performance.
2. Navigate into a directory you want to place the project directory in using `cd`.
3. Clone the activity-limit branch:

   ```bash
   git clone --branch bry88002-arm64-deployment --single-branch https://github.com/bry88002/discord-youtube-bot-2.git
   cd discord-youtube-bot-2
   ```
4. Copy `.env-example` to `.env` and fill in the values. The provided Compose configuration expects this file; if you supply environment variables another way, update the bot service's `env_file` setting too.
5. Fill in the requirements for the environment variables.

   1. `DISCORD_TOKEN` & `CLIENT_ID` - Which you can create/find https://discord.com/developers. This bot also requires the `applications.commands` permission otherwise you will not be able to use slash commands.
   2. `DEV_GUILD_ID` - For developers only. You do not need to fill this in if you are not a developer.
   3. `GOOGLE_API_TOKEN` is not required for the currently enabled `/limits` command.

6. Run `sudo docker compose up --build -d` to build and start the bot.

_Note: Commands will not immediately appear in Discord, and can take up to 1 hour to register to Discord's servers. Just keep checking, and they should appear soon (assuming everything is set up properly!)_

### Daily activity limits

#### Setup

1. In the Discord Developer Portal, open the bot application's **Bot** settings and enable **Presence Intent** and **Server Members Intent** under privileged gateway intents.
2. Create and edit the environment file:

   ```bash
   cp .env-example .env
   nano .env
   ```

   Set `DISCORD_TOKEN`, `CLIENT_ID` (the application's ID), `REDIS_HOST=redis`, and `NODE_ENV=production`. Set `GOOGLE_API_TOKEN` as well if you use YouTube API features. Compose passes `.env` to the bot container; `.dockerignore` keeps this secret file out of the built image. Do not commit or share `.env`.

   The Compose Redis service must use Redis Stack Server, which includes RedisJSON.
3. Pull the bot code and rebuild/restart it:

   ```bash
   sudo docker compose up -d --build
   sudo docker compose logs --tail=50 bot
   ```

4. If `/limits` does not appear yet, wait for global slash-command registration to finish. Global commands can take up to an hour to show in Discord.

The Compose file mounts the host's `/etc/localtime` into the bot container. Keep the host timezone configured correctly; daily totals reset at midnight in that timezone.

#### Run the commands

Only server administrators can manage limits. Use Discord's slash-command picker and select a subcommand:

```text
/limits enroll member:@member limit_minutes:120
/limits set member:@member limit_minutes:90
/limits unenroll member:@member
```

`enroll` starts tracking a server member and requires a daily limit from 1 to 1440 minutes. The member receives a DM explaining the tracking. `set` changes the limit for an enrolled member. `unenroll` stops tracking and permanently removes that member's saved activity totals and limit for this server. Bot accounts cannot be enrolled.

#### What is counted

The daily limit combines time connected to any voice channel with time Discord reports the member as playing a game. The two activities are counted as a union: if they overlap, that time counts once. Other presence states and activities, such as Online/Idle status or Spotify listening, do not count. The bot DMs the member when about 15 minutes remain and again when the limit is reached; it does not automatically disconnect them or stop their game. Members must allow DMs from the bot for notices and alerts to arrive.

### ARM64 / DietPi

The Docker setup supports 64-bit ARM Linux (such as an ARM64 DietPi installation). The bot image installs the build tools needed to compile `@discordjs/opus` on ARM64, and the Redis service uses Redis Stack Server for RedisJSON support.

On the device, confirm `uname -m` reports `aarch64`, then follow the production setup above. Build and start the services with `docker compose up --build -d` (or `docker-compose` on older installations).

## How to update the bot

1. Pull the latest code from the deployment branch with `git pull --ff-only origin bry88002-arm64-deployment`. This will not override your `.env` file.
2. Rebuild the Docker containers with `sudo docker compose up -d --build`.
3. Done!

## Docker cheat sheet

Run these commands from the directory containing `docker-compose.yml`. On DietPi, prepend `sudo` if your account is not in the `docker` group.

| Task | Command |
| --- | --- |
| Build and start services | `sudo docker compose up -d --build` |
| Show service status | `sudo docker compose ps` |
| Follow bot logs | `sudo docker compose logs -f --tail=100 bot` |
| Show recent Redis logs | `sudo docker compose logs --tail=100 redis` |
| Restart the bot | `sudo docker compose restart bot` |
| Stop services without removing containers | `sudo docker compose stop` |
| Start stopped services | `sudo docker compose start` |
| Check Redis responds | `sudo docker compose exec redis redis-cli PING` |
| Validate Compose configuration | `sudo docker compose config` |

`docker compose down` removes the containers. This Compose setup does not mount Redis data to a persistent volume, so removing or recreating the Redis container deletes saved activity limits and totals. Avoid `down` or recreating Redis unless you are okay with losing that data.

## Licensed under the GNU GPL v3

Discord YouTube Bot, an open source Discord YouTube Bot.
Copyright (C) 2021 Jack Wright

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
