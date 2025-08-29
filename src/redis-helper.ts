import { createClient, RedisClientType } from "redis";
import { Message } from "discord.js";

async function generateClient(options): Promise<RedisClientType> {
  const client: RedisClientType = createClient(options);
  client.on("error", (err) => console.error("Redis Client Error", err));
  await client.connect();
  return client;
}

async function addTask(client: RedisClientType, message: Message) {
  try {
    const taskId = `${Date.now()}-0`;
    const { channelId } = message;
    await client.xAdd("discord:tasks", taskId, {
      taskId,
      task: message.content,
      sender: message.author.globalName,
      ledgerId: `discord:${channelId}`,
      channelId,
    });
  } catch (error) {
    console.error("Error sending task to Redis stream:", error);
    message.reply("Sorry, there was an error processing your request.");
  }
}

async function waitForResults(
  client: RedisClientType,
  callback: Function,
) {
  let lastMessageId = "0";
  while (true) {
    try {
      const streams = await client.xRead(
        [ { key: "discord:results", id: lastMessageId } ],
        { BLOCK: 5000, COUNT: 10 },
      );
      if (streams) {
        for (const message of streams[0].messages) {
          await callback(message.message);
          lastMessageId = message.id;
          await cleanupTaskData(client, message.message.taskId, lastMessageId);
        }
      }
    } catch (err) {
      console.error("Error reading from Redis stream:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function cleanupTaskData(
  client: RedisClientType,
  taskId: string,
  resultId: string
) {
  await Promise.all([
    client.xDel("discord:tasks", taskId),
    client.xDel("discord:results", resultId),
  ]);
}

export { addTask, generateClient, waitForResults }
