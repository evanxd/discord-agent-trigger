import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { addTask, generateClient, waitForResults } from "./redis-helper.js";

const redisTaskClient = await generateClient();
const redisResultClient = await generateClient();
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

discordClient.on("clientReady", () => {
  waitForResults(redisResultClient, async (message) => {
    const { result, channelId } = message;
    if (result && channelId) {
      const channel = await discordClient.channels.fetch(channelId) as TextChannel;
      await channel.send(result);
    }
  });
});

discordClient.on("messageCreate", async (message) => {
  if (message.author.bot ||
      !(message.channel instanceof TextChannel) ||
      message.channel.name !== process.env.DISCORD_BOT_ALLOWED_CHANNEL_NAME
  ) return;
  await addTask(redisTaskClient, message);
});

await discordClient.login(process.env.DISCORD_BOT_TOKEN);
