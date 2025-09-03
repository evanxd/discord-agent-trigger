import { createClient, RedisClientType, RedisClientOptions } from "redis";
import { Message, Guild, TextChannel } from "discord.js";

async function generateClient(options: RedisClientOptions): Promise<RedisClientType> {
  const client = createClient(options);
  client.on("error", e => { throw e; });
  await client.connect();
  return client as RedisClientType;
}

async function addTask(client: RedisClientType, message: Message) {
  try {
    const taskId = `${Date.now()}-0`;
    const { guild, channel, channelId } = message;

    await client.xAdd("discord:tasks", taskId, {
      taskId,
      task: message.content,
      sender: message.author.username,
      groupMembers: (channel as TextChannel).members.map(m => m.user.username).toString(),
      ledgerId: `discord:${channelId}`,
      channelId: channelId,
    });
  } catch (e) {
    message.reply(getErrorMessage(e));
  }
}

async function waitForResults(
  client: RedisClientType,
  callback: (task: { [key: string]: string; }) => void,
) {
  let lastId = "0";
  while (true) {
    try {
      const streams = await client.xRead(
        [ { key: "discord:results", id: lastId } ],
        { BLOCK: 5000, COUNT: 10 },
      );
      if (streams) {
        for (const message of streams[0].messages) {
          await callback(message.message);
          lastId = message.id;
          await cleanupTaskAndResult(client, message.message.taskId, lastId);
        }
      }
    } catch (e) {
      console.error("Error reading from Redis stream:", e);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function cleanupTaskAndResult(
  client: RedisClientType,
  taskId: string,
  resultId: string
) {
  await Promise.all([
    client.xDel("discord:tasks", taskId),
    client.xDel("discord:results", resultId),
  ]);
}

function getErrorMessage(error: unknown) {
  let message = "An unknown error occurred.";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  }
  return message;
}

export { addTask, generateClient, waitForResults }
