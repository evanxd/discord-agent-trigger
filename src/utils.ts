import { Client, Message, PartialMessage, TextChannel } from "discord.js";

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
 * Fetches all messages from the allowed channel to ensure they are in the cache.
 * This is useful for making sure that the bot can react to messages that were sent
 * while it was offline.
 *
 * @param client - The Discord client instance.
 */
export async function fetchDiscordMessages(client: Client): Promise<void> {
  client.channels.cache.forEach(channel => {
    if (
      channel instanceof TextChannel &&
      !isPublic(channel) &&
      canView(channel)
    ) {
      channel.messages.fetch();
    }
  });
}

/**
 * Checks if a message should be ignored.
 * A message is considered invalid if the author is a bot, the channel is not a text channel,
 * or the channel name is not the one specified in the environment variables.
 *
 * @param message - The Discord message to check.
 * @returns True if the message is invalid, false otherwise.
 */
export function isInvalidMessage(message: Message | PartialMessage): boolean {
  return (
    !(message instanceof Message) ||
    !(message.channel instanceof TextChannel) ||
    message.author.bot ||
    isPublic(message.channel)
  );
}

/**
 * Checks if the bot has permission to view a channel.
 *
 * @param channel - The channel to check.
 * @returns True if the bot can view the channel, false otherwise.
 */
function canView(channel: TextChannel): boolean {
  return channel.permissionsFor(channel.guild.members.me!).has("ViewChannel");
}

/**
 * Checks if a channel is public (viewable by @everyone).
 *
 * @param channel - The channel to check.
 * @returns True if the channel is public, false otherwise.
 */
function isPublic(channel: TextChannel): boolean {
  return channel.permissionsFor(channel.guild.roles.everyone).has("ViewChannel");
}
