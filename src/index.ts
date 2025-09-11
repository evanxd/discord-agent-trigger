import { Client, GatewayIntentBits, Message, TextChannel } from "discord.js";
import { RedisClientType } from "redis";
import {
  addTask,
  cleanupProcessedTask,
  generateClient,
  getResults,
  to,
} from "./utils.js";
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
    ]
  });

  discordClient.once("clientReady", async (client) => {
    const [err] = await to(listenForResults(client, redisResultClient, redisTaskClient));
    if (err) {
      console.error("Error processing result:", err);
    }
  });

  discordClient.on("messageCreate", async (message) => {
    if (isInvalidMessage(message)) {
      return;
    }

    const [err] = await to(
      addTask(redisTaskClient, message).then(() => message.react("🤖"))
    );

    if (err) {
      console.error("Failed to add task:", err);
      await message.reply(`Could not process your request: ${err.message}`);
    }
  });

  discordClient.on("messageDelete", async (message) => {
    if (!(message instanceof Message) || isInvalidMessage(message)) {
      return;
    }

    const [err] = await to(
      addTask(redisTaskClient, message, "Delete this expense log")
    );

    if (err) {
      console.error("Failed to add deletion task:", err);
      await message.channel.send(`Could not process the deletion request: ${err.message}`);
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
    const { id: resultId, message: redisMessage } = result;
    const { result: resultText, channelId, messageId, requestId } = redisMessage;
    if (!channelId || !messageId || !requestId) {
      continue;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (!(channel instanceof TextChannel)) {
      return;
    }

    if (resultText) {
      await channel.send({
        content: resultText,
        reply: {
          messageReference: messageId,
          failIfNotExists: false,
        },
      });
    }

    await cleanupProcessedTask(taskClient, requestId, resultId);
  }
}

function isInvalidMessage(message: Message): boolean {
  return (
    message.author.bot ||
    !(message.channel instanceof TextChannel) ||
    message.channel.name !== process.env.DISCORD_BOT_ALLOWED_CHANNEL_NAME
  );
}

main().catch((e) => { console.error("Unhandled error:", e); });
