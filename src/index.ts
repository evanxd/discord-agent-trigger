import { Client as DiscordClient, GatewayIntentBits, TextChannel } from "discord.js";
import { RedisClientType, createClient } from "redis";
import dotenv from "dotenv";
import { waitForTaskResults } from "./task-result-listener.js";

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
  waitForTaskResults(redisResultClient, async (message) => {
    const { result, channelId } = message;
    if (result && channelId) {
      const channel = await discordClient.channels.fetch(channelId) as TextChannel;
      await channel.send(result);
    }
  });
});

discordClient.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  try {
    const taskId = `${Date.now()}-0`;
    await redisTaskClient.xAdd("discord:tasks", taskId, {
      taskId,
      task: message.content,
      sender: message.author.globalName,
      channelId: message.channelId,
    });
  } catch (error) {
    console.error("Error sending task to Redis stream:", error);
    message.reply("Sorry, there was an error processing your request.");
  }
});

await discordClient.login(process.env.DISCORD_TOKEN);
