import { createClient, RedisClientType } from "redis";
import { Client, Message, TextChannel } from "discord.js";

import { to } from "./asnyc.js";

const ERROR_RETRY_MS = 5000;
const REDIS_OPTIONS = {
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
};
const STREAM_RESULTS = process.env.STREAM_RESULTS || "discord:results";
const STREAM_REQUESTS = process.env.STREAM_REQUESTS || "discord:requests";
const XREAD_BLOCK_MS = 5000;
const XREAD_COUNT = 10;

interface RequestMessage {
  id: string;
  message: {
    requestId: string;
    event: string;
    instruction: string;
    sender: string;
    /** A JSON string array of usernames. */
    groupMembers: string;
    ledgerId: string;
    channelId: string;
    messageId: string;
  };
}

interface ResultMessage {
  id: string;
  message: {
    result: string;
    channelId: string;
    messageId: string;
    requestId: string;
  };
}

/**
 * Creates and connects a Redis client.
 *
 * @returns A connected Redis client.
 * @throws Will throw an error if the initial connection fails.
 */
export async function createRedisClient(): Promise<RedisClientType> {
  const client = createClient(REDIS_OPTIONS);
  client.on("error", (e) => {
    throw e;
  });
  await client.connect();
  return client as RedisClientType;
}

/**
 * Adds a new task request to the Redis stream.
 *
 * @param client - The Redis client instance.
 * @param event - The name of the event that triggered this request.
 * @param message - The discord.js Message that triggered the task.
 * @param instruction - Optional instruction to override the message content.
 * @throws Throws an error if the task cannot be added or if the channel is not a TextChannel.
 */
export async function addRequestToStream(
  client: RedisClientType,
  event: string,
  message: Message,
  instruction?: string,
): Promise<void> {
  if (!(message.channel instanceof TextChannel)) {
    throw new Error("Tasks can only be initiated from server text channels.");
  }

  const { id: messageId, channel, channelId } = message;
  const requestId = `${Date.now()}-0`;
  const request: RequestMessage = {
    id: requestId,
    message: {
      requestId,
      event,
      instruction: instruction || message.content,
      sender: message.author.username,
      groupMembers: JSON.stringify(channel.members.map((m) => m.user.username)),
      ledgerId: `discord:${channelId}`,
      channelId,
      messageId,
    },
  };

  await client.xAdd(STREAM_REQUESTS, request.id, request.message);
}

/**
 * A long-running process that listens for task results from the Redis results stream,
 * sends them to the appropriate Discord channel, and cleans up the processed tasks.
 *
 * @param discordClient - The Discord client instance.
 * @param resultClient - The Redis client for reading results.
 * @param taskClient - The Redis client for cleaning up tasks.
 */
export async function listenForRedisResults(
  discordClient: Client,
  resultClient: RedisClientType,
  taskClient: RedisClientType,
) {
  for await (const result of yieldResultsFromStream(resultClient)) {
    const { id: resultId, message: redisMessage } = result;
    const {
      result: resultText,
      channelId,
      messageId,
      requestId,
    } = redisMessage;
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

    const [err] = await to(
      cleanupRequestAndResult(taskClient, requestId, resultId),
    );
    if (err) {
      console.error(
        `Failed to cleanup Redis streams for request ${requestId} and result ${resultId}`,
        err,
      );
    }
  }
}

/**
 * An async generator that yields results from the Redis results stream as they become available.
 * It will block and wait for new messages, and automatically retries on error.
 *
 * @param client - The Redis client instance.
 */
async function* yieldResultsFromStream(
  client: RedisClientType,
): AsyncGenerator<ResultMessage> {
  let lastId = "0";

  while (true) {
    const [err, streams] = await to(
      client.xRead([{ key: STREAM_RESULTS, id: lastId }], {
        BLOCK: XREAD_BLOCK_MS,
        COUNT: XREAD_COUNT,
      }),
    );

    if (err) {
      console.error(
        "Error reading from Redis stream, retrying in 5 seconds:",
        err,
      );
      await new Promise((resolve) => setTimeout(resolve, ERROR_RETRY_MS));
      continue;
    }

    if (streams) {
      for (const message of streams[0].messages) {
        yield message as ResultMessage;
        lastId = message.id;
      }
    }
  }
}

/**
 * Deletes a task request and its result from the Redis streams.
 *
 * @param client - The Redis client instance.
 * @param requestId - The ID of the request message to delete.
 * @param resultId - The ID of the result message to delete.
 */
async function cleanupRequestAndResult(
  client: RedisClientType,
  requestId: string,
  resultId: string,
): Promise<void> {
  await Promise.all([
    client.xDel(STREAM_REQUESTS, requestId),
    client.xDel(STREAM_RESULTS, resultId),
  ]);
}
