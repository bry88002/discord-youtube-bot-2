import { activityLimitManager } from 'bot-classes';
import { registerCommands } from 'bot-functions';
import { Client } from 'discord.js';

const ready = (client: Client) => {
	console.log(`Bot logged in as ${client.user?.username}!`);

	client.user?.setActivity({
		name: 'music | type "/"!',
		type: 'PLAYING'
	});

	activityLimitManager.start(client).catch(console.error);
	registerCommands().catch(console.error);
};

export { ready };
