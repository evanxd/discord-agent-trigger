import { Client, GatewayIntentBits, Message } from "discord.js";
import dotenv from "dotenv";

import {
  addTask,
  generateClient,
  isInvalidMessage,
  listenForResults,
  to,
} from "./utils.js";
import { startServer } from "./server.js";

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
  const redisRequestClient = await generateClient(REDIS_OPTIONS);
  const redisResultClient = await generateClient(REDIS_OPTIONS);
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ]
  });

  discordClient.once("clientReady", async (client) => {
    const [err] = await to(listenForResults(client, redisResultClient, redisRequestClient));

    if (err) {
      console.error("Error in result listening loop:", err);
    }
  });

  discordClient.on("messageCreate", async (message) => {
    if (isInvalidMessage(message)) {
      return;
    }

    const [err] = await to(
      addTask(redisRequestClient, message).then(() => message.react("🤖"))
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
      addTask(redisRequestClient, message, "Delete this expense log")
    );

    if (err) {
      console.error("Failed to add deletion task:", err);
      await message.channel.send(`Could not process the deletion request: ${err.message}`);
    }
  });

  await discordClient.login(process.env.DISCORD_BOT_TOKEN);
}

startServer(Number(process.env.PORT) || undefined);
main().catch((e) => { console.error("Unhandled error:", e); });
