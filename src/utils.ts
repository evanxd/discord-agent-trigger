import { createClient, RedisClientType, RedisClientOptions } from "redis";
import { Client, Message, TextChannel } from "discord.js";

const STREAM_REQUESTS = "discord:requests";
const STREAM_RESULTS = "discord:results";
const XREAD_BLOCK_MS = 5000;
const XREAD_COUNT = 10;
const ERROR_RETRY_MS = 5000;

interface RequestMessage {
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
 * @param options - Redis client options.
 * @returns A connected Redis client.
 * @throws Will throw an error if the initial connection fails.
 */
export async function createRedisClient(options: RedisClientOptions): Promise<RedisClientType> {
  const client = createClient(options);
  client.on("error", e => { throw e; });
  await client.connect();
  return client as RedisClientType;
}

/**
 * Adds a new task request to the Redis stream.
 *
 * @param client - The Redis client instance.
 * @param message - The discord.js Message that triggered the task.
 * @param instruction - Optional instruction to override the message content.
 * @throws Throws an error if the task cannot be added or if the channel is not a TextChannel.
 */
export async function addRequestToStream(client: RedisClientType, message: Message, instruction?: string): Promise<void> {
  if (!(message.channel instanceof TextChannel)) {
    throw new Error("Tasks can only be initiated from server text channels.");
  }

  const { id: messageId, channel, channelId } = message;
  const requestId = `${Date.now()}-0`;
  const request: RequestMessage = {
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
  taskClient: RedisClientType
) {
  for await (const result of yieldResultsFromStream(resultClient)) {
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

    const [err] = await to(cleanupRequestAndResult(taskClient, requestId, resultId));
    if (err) {
      console.error(`Failed to cleanup Redis streams for request ${requestId} and result ${resultId}`, err);
    }
  }
}

/**
 * Wraps a promise to enable error handling without a try-catch block,
 * inspired by the `await-to-js` library. This allows for a cleaner,
 * functional approach to handling asynchronous operations that might fail.
 *
 * @template T The type of the resolved value of the promise.
 * @param promise The promise to be wrapped.
 * @returns A promise that always resolves to a tuple. If the original
 *          promise resolves, the tuple is `[null, data]`. If it rejects,
 *          the tuple is `[error, undefined]`.
 */
export function to<T>(promise: Promise<T>): Promise<[Error, undefined] | [null, T]> {
  return promise
    .then<[null, T]>((data) => [null, data])
    .catch<[Error, undefined]>((err) => [err, undefined]);
}

/**
 * Checks if a message should be ignored.
 * A message is considered invalid if the author is a bot, the channel is not a text channel,
 * or the channel name is not the one specified in the environment variables.
 *
 * @param message - The Discord message to check.
 * @returns True if the message is invalid, false otherwise.
 */
export function isInvalidMessage(message: Message): boolean {
  return (
    message.author.bot ||
    !(message.channel instanceof TextChannel) ||
    message.channel.name !== process.env.DISCORD_BOT_ALLOWED_CHANNEL_NAME
  );
}

/**
 * Fetches all messages from the allowed channel to ensure they are in the cache.
 * This is useful for making sure that the bot can react to messages that were sent
 * while it was offline.
 *
 * @param client - The Discord client instance.
 */
export async function fetchDiscordMessages(client: Client): Promise<void> {
  const channel = client.channels.cache.find((c) =>
    c instanceof TextChannel &&
    c.name === process.env.DISCORD_BOT_ALLOWED_CHANNEL_NAME
  );
  await (channel as TextChannel).messages.fetch();
}

/**
 * An async generator that yields results from the Redis results stream as they become available.
 * It will block and wait for new messages, and automatically retries on error.
 *
 * @param client - The Redis client instance.
 */
async function* yieldResultsFromStream(
  client: RedisClientType
): AsyncGenerator<ResultMessage> {
  let lastId = "0";

  while (true) {
    const [err, streams] = await to(
      client.xRead([{ key: STREAM_RESULTS, id: lastId }], {
        BLOCK: XREAD_BLOCK_MS,
        COUNT: XREAD_COUNT,
      })
    );

    if (err) {
      console.error("Error reading from Redis stream, retrying in 5 seconds:", err);
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
  resultId: string
): Promise<void> {
  await Promise.all([
    client.xDel(STREAM_REQUESTS, requestId),
    client.xDel(STREAM_RESULTS, resultId),
  ]);
}
