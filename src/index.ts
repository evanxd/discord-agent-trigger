import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { RedisClientType } from "redis";
import {
  addTask,
  cleanupProcessedTask,
  generateClient,
  getResults,
} from "./redis-helper.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_OPTIONS = {
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
};

async function main() {
  const redisTaskClient = await generateClient(REDIS_OPTIONS);
  const redisResultClient = await generateClient(REDIS_OPTIONS);

  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  discordClient.once("clientReady", client => {
    listenForResults(client, redisResultClient, redisTaskClient);
  });

  discordClient.on("messageCreate", async (message) => {
    if (
      message.author.bot ||
      !(message.channel instanceof TextChannel) ||
      message.channel.name !== process.env.DISCORD_BOT_ALLOWED_CHANNEL_NAME
    ) {
      return;
    }

    try {
      await addTask(redisTaskClient, message);
      await message.react("🤖");
    } catch (error) {
      console.error("Failed to add task:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      await message.reply(`Could not process your request: ${errorMessage}`);
    }
  });

  await discordClient.login(process.env.DISCORD_BOT_TOKEN);
}

async function listenForResults(
  discordClient: Client,
  resultClient: RedisClientType,
  taskClient: RedisClientType
) {
  for await (const result of getResults(resultClient)) {
    try {
      const { message, id: resultId } = result;
      const { result: resultText, channelId, requestId } = message;

      if (!resultText || !channelId || !requestId) {
        continue;
      }

      const channel = await discordClient.channels.fetch(channelId);
      if (channel instanceof TextChannel) {
        await channel.send(resultText);
      } else {
        console.warn(`Channel ${channelId} is not a text channel.`);
      }

      await cleanupProcessedTask(taskClient, requestId, resultId);
    } catch (error) {
      console.error("Error processing result:", error);
    }
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
});
