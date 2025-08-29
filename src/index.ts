import { createClient, RedisClientType } from "redis";
import { Client as DiscordClient, GatewayIntentBits, TextChannel } from "discord.js";
import dotenv from "dotenv";
import { addTask, waitForResults } from "./redis-helper.js";

dotenv.config();

const REDIS_OPTIONS = {
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  }
}

const redisTaskClient: RedisClientType = createClient(REDIS_OPTIONS);
const redisResultClient: RedisClientType = createClient(REDIS_OPTIONS);
const discordClient = new DiscordClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

redisTaskClient.on("error", (err) => console.error("Redis Task Client Error", err));
redisResultClient.on("error", (err) => console.error("Redis Result Client Error", err));
await redisTaskClient.connect();
await redisResultClient.connect();

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
