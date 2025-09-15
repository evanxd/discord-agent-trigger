import { Client, GatewayIntentBits, Message } from "discord.js";
import dotenv from "dotenv";

import {
  addRequestToStream,
  createRedisClient,
  listenForRedisResults,
} from "./redis.js"
import {
  fetchDiscordMessages,
  isInvalidMessage,
  to,
} from "./utils.js";
import { startServer } from "./server.js";

dotenv.config();

async function main() {
  const redisRequestClient = await createRedisClient();
  const redisResultClient = await createRedisClient();
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ]
  });

  discordClient.once("clientReady", async (client) => {
    await fetchDiscordMessages(client);
    const [err] = await to(listenForRedisResults(client, redisResultClient, redisRequestClient));

    if (err) {
      console.error("Error in result listening loop:", err);
    }
  });

  discordClient.on("messageCreate", async (message) => {
    if (isInvalidMessage(message)) {
      return;
    }

    const [err] = await to(
      addRequestToStream(redisRequestClient, "messageCreate", message).then(() => message.react("🤖"))
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
      addRequestToStream(redisRequestClient, "messageDelete", message, "Delete this expense log")
    );

    if (err) {
      console.error("Failed to add deletion task:", err);
      await message.channel.send(`Could not process the deletion request: ${err.message}`);
    }
  });

  await discordClient.login(process.env.DISCORD_BOT_TOKEN);
}

startServer(Number(process.env.PORT));
main().catch((e) => { console.error("Unhandled error:", e); });
