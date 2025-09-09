import { createClient, RedisClientType, RedisClientOptions } from "redis";
import { Message, TextChannel } from "discord.js";

const STREAM_REQUESTS = "discord:requests";
const STREAM_RESULTS = "discord:results";
const XREAD_BLOCK_MS = 5000;
const XREAD_COUNT = 10;
const ERROR_RETRY_MS = 5000;

interface TaskRequestMessage {
  id: string;
  message: {
    requestId: string;
    instruction: string;
    sender: string;
    /** A JSON string array of usernames. */
    groupMembers: string;
    ledgerId: string;
    channelId: string;
    messageId: string;
  };
}

interface TaskResultMessage {
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
 * @param options - Redis client options.
 * @returns A connected Redis client.
 * @throws Will throw an error if the initial connection fails.
 */
export async function generateClient(options: RedisClientOptions): Promise<RedisClientType> {
  const client = createClient(options);
  client.on("error", e => { throw e; });
  await client.connect();
  return client as RedisClientType;
}

/**
 * Adds a new task to the tasks stream.
 * @param client - The Redis client instance.
 * @param message - The discord.js Message that triggered the task.
 * @param instruction - Optional instruction to override the message content.
 * @throws Throws an error if the task cannot be added or if the channel is not a TextChannel.
 */
export async function addTask(client: RedisClientType, message: Message, instruction?: string): Promise<void> {
  if (!(message.channel instanceof TextChannel)) {
    throw new Error("Tasks can only be initiated from server text channels.");
  }

  const { id: messageId, channel, channelId } = message;
  const requestId = `${Date.now()}-0`;
  const request: TaskRequestMessage = {
    id: requestId,
    message: {
      requestId,
      instruction: instruction || message.content,
      sender: message.author.username,
      groupMembers: JSON.stringify(channel.members.map((m) => m.user.username)),
      ledgerId: `discord:${channelId}`,
      channelId: channelId,
      messageId
    }
  };

  await client.xAdd(STREAM_REQUESTS, request.id, request.message);
}

/**
 * An async generator that yields results from the results stream as they become available.
 * It will block and wait for new messages, and automatically retries on error.
 * @param client - The Redis client instance.
 */
export async function* getResults(client: RedisClientType): AsyncGenerator<TaskResultMessage> {
  let lastId = "0";

  while (true) {
    try {
      const streams = await client.xRead(
        [{ key: STREAM_RESULTS, id: lastId }],
        { BLOCK: XREAD_BLOCK_MS, COUNT: XREAD_COUNT }
      );

      if (streams) {
        for (const message of streams[0].messages) {
          yield message as TaskResultMessage;
          lastId = message.id;
        }
      }
    } catch (e) {
      console.error("Error reading from Redis stream. Retrying...", e);
      await new Promise((resolve) => setTimeout(resolve, ERROR_RETRY_MS));
    }
  }
}

/**
 * Deletes a task from the tasks stream and its corresponding result from the results stream.
 * @param client - The Redis client instance.
 * @param requestId - The ID of the request message to delete.
 * @param resultId - The ID of the result message to delete.
 */
export async function cleanupProcessedTask(
  client: RedisClientType,
  requestId: string,
  resultId: string
): Promise<void> {
  await Promise.all([
    client.xDel(STREAM_REQUESTS, requestId),
    client.xDel(STREAM_RESULTS, resultId),
  ]);
}
