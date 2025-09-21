import { Client, Message, PartialMessage, TextChannel } from "discord.js";

/**
 * Fetches all members from all guilds to ensure they are in the cache.
 *
 * @param client - The Discord client instance.
 */
export async function fetchDiscordMembers(client: Client): Promise<void> {
  await Promise.all(client.guilds.cache.map((guild) => guild.members.fetch()));
}

/**
 * Fetches all messages from the allowed channel to ensure they are in the cache.
 * This is useful for making sure that the bot can react to messages that were sent
 * while it was offline.
 *
 * @param client - The Discord client instance.
 */
export async function fetchDiscordMessages(client: Client): Promise<void> {
  await Promise.all(
    client.channels.cache.map((channel) => {
      if (
        channel instanceof TextChannel &&
        !isPublic(channel) &&
        canView(channel)
      ) {
        return channel.messages.fetch();
      }
    }),
  );
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
  return channel
    .permissionsFor(channel.guild.roles.everyone)
    .has("ViewChannel");
}
