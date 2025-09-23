import {
  Client,
  Collection,
  Guild,
  Message,
  PartialMessage,
  TextChannel,
  VoiceChannel,
  GuildChannel,
  CategoryChannel,
  NewsChannel,
  StageChannel,
  ForumChannel,
  MediaChannel,
} from "discord.js";

import {
  fetchDiscordMembers,
  fetchDiscordMessages,
  isInvalidMessage,
} from "../src/utils/discord.js";

const createMockTextChannel = (
  isPublic: boolean,
  canView: boolean,
): TextChannel => {
  const channel = Object.create(TextChannel.prototype);
  const guild = {
    members: { me: { id: "bot-id" } },
    roles: { everyone: { id: "everyone-id" } },
  };

  const permissionsFor = (userOrRole: { id: string }) => ({
    has: (permission: string) => {
      if (permission !== "ViewChannel") return false;
      if (userOrRole.id === "everyone-id") return isPublic; // For isPublic check
      if (userOrRole.id === "bot-id") return canView; // For canView check
      return false;
    },
  });

  Object.assign(channel, {
    guild,
    permissionsFor: jest.fn(permissionsFor),
    messages: {
      fetch: jest.fn().mockResolvedValue(new Collection<string, Message>()),
    },
  });

  return channel;
};

const createMockMessage = (
  channel: TextChannel | VoiceChannel,
  isBot: boolean,
): Message => {
  const message = Object.create(Message.prototype);
  Object.defineProperty(message, "author", {
    value: { bot: isBot },
    writable: true,
  });
  Object.defineProperty(message, "channel", { value: channel, writable: true });
  Object.defineProperty(message, "partial", { value: false, writable: true });
  return message;
};

const createMockPartialMessage = (): PartialMessage => {
  const partialMessage = {
    id: "123",
    channelId: "456",
    guildId: "789",
    partial: true,
  };
  Object.setPrototypeOf(partialMessage, {});
  return partialMessage as PartialMessage;
};

describe("Discord Utils", () => {
  let client: Client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = {
      guilds: {
        cache: new Collection<string, Guild>(),
      },
      channels: {
        cache: new Collection<
          string,
          | GuildChannel
          | VoiceChannel
          | StageChannel
          | CategoryChannel
          | NewsChannel
          | ForumChannel
          | MediaChannel
        >(),
      },
    } as unknown as Client;
  });

  describe("fetchDiscordMembers", () => {
    it("should fetch members for each guild in the cache", async () => {
      const guild1 = { members: { fetch: jest.fn() } } as unknown as Guild;
      const guild2 = { members: { fetch: jest.fn() } } as unknown as Guild;
      client.guilds.cache.set("guild1", guild1);
      client.guilds.cache.set("guild2", guild2);

      await fetchDiscordMembers(client);

      expect(guild1.members.fetch).toHaveBeenCalledTimes(1);
      expect(guild2.members.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchDiscordMessages", () => {
    it("should fetch messages from a non-public, viewable text channel", async () => {
      const channel = createMockTextChannel(false, true);
      client.channels.cache.set("channel1", channel);
      await fetchDiscordMessages(client);
      expect(channel.messages.fetch).toHaveBeenCalledTimes(1);
    });

    it("should not fetch messages from a public channel", async () => {
      const channel = createMockTextChannel(true, true);
      client.channels.cache.set("channel1", channel);
      await fetchDiscordMessages(client);
      expect(channel.messages.fetch).not.toHaveBeenCalled();
    });

    it("should not fetch messages from a non-viewable channel", async () => {
      const channel = createMockTextChannel(false, false);
      client.channels.cache.set("channel1", channel);
      await fetchDiscordMessages(client);
      expect(channel.messages.fetch).not.toHaveBeenCalled();
    });

    it("should not fetch messages from a non-text channel", async () => {
      const channel = Object.create(VoiceChannel.prototype);
      const fetch = jest.fn();
      Object.assign(channel, { messages: { fetch } });
      client.channels.cache.set("channel1", channel);
      await fetchDiscordMessages(client);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("isInvalidMessage", () => {
    it("should return false for a valid message", () => {
      const channel = createMockTextChannel(false, true);
      const message = createMockMessage(channel, false);
      expect(isInvalidMessage(message)).toBe(false);
    });

    it("should return true for a partial message", () => {
      const partialMessage = createMockPartialMessage();
      expect(isInvalidMessage(partialMessage)).toBe(true);
    });

    it("should return true if the author is a bot", () => {
      const channel = createMockTextChannel(false, true);
      const message = createMockMessage(channel, true);
      expect(isInvalidMessage(message)).toBe(true);
    });

    it("should return true if the channel is public", () => {
      const channel = createMockTextChannel(true, true);
      const message = createMockMessage(channel, false);
      expect(isInvalidMessage(message)).toBe(true);
    });

    it("should return true if the message is not in a TextChannel", () => {
      const channel = Object.create(VoiceChannel.prototype);
      const message = createMockMessage(channel, false);
      expect(isInvalidMessage(message)).toBe(true);
    });
  });
});
