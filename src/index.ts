import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { addTask, generateClient, waitForResults } from "./redis-helper.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_OPTIONS = {
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  }
}

const redisTaskClient = await generateClient(REDIS_OPTIONS);
const redisResultClient = await generateClient(REDIS_OPTIONS);
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
    const channel = await discordClient.channels.fetch(channelId) as TextChannel;
    await channel.send(result);
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
