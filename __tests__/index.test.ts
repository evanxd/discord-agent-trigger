import { Client, Message } from "discord.js";

const mockFetchDiscordMembers = jest.fn();
const mockFetchDiscordMessages = jest.fn();
const mockAddRequestToStream = jest.fn();
const mockListenForRedisResults = jest.fn().mockResolvedValue(undefined);
const mockIsInvalidMessage = jest.fn();
const mockClientInstance = {
  once: jest.fn(),
  on: jest.fn(),
  login: jest.fn(),
  user: { tag: "test-bot", id: "test-bot-id" },
};
const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});

jest.mock("../src/utils/discord", () => ({
  fetchDiscordMembers: mockFetchDiscordMembers,
  fetchDiscordMessages: mockFetchDiscordMessages,
  isInvalidMessage: mockIsInvalidMessage,
}));
jest.mock("../src/utils/redis", () => ({
  createRedisClient: jest.fn(),
  listenForRedisResults: mockListenForRedisResults,
  addRequestToStream: mockAddRequestToStream,
}));
jest.mock("../src/utils/server", () => ({
  startServer: jest.fn(),
}));
jest.mock("discord.js", () => ({
  Client: jest.fn().mockImplementation(() => {
    return mockClientInstance as unknown as Client;
  }),
  GatewayIntentBits: {
    Guilds: 0,
    GuildMembers: 0,
    GuildMessages: 0,
    MessageContent: 0,
  },
}));

const getMockListener = (mock: jest.Mock, event: string) => {
  const call = mock.mock.calls.find((c) => c[0] === event);
  return call ? call[1] : undefined;
};

describe("main", () => {
  beforeEach(async () => {
    await import("../src/index");
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe("clientReady event", () => {
    it("should setup client ready listener, trigger it, and call the correct functions", async () => {
      const callback = getMockListener(mockClientInstance.once, "clientReady");
      expect(callback).toBeDefined();

      await callback(mockClientInstance);

      expect(mockFetchDiscordMembers).toHaveBeenCalledTimes(1);
      expect(mockFetchDiscordMessages).toHaveBeenCalledTimes(1);
      expect(mockListenForRedisResults).toHaveBeenCalledTimes(1);
    });
  });

  describe("messageCreate event", () => {
    it("should ignore invalid messages", async () => {
      mockIsInvalidMessage.mockReturnValue(true);
      const callback = getMockListener(mockClientInstance.on, "messageCreate");
      expect(callback).toBeDefined();

      const message = {} as Message;

      await callback(message);

      expect(mockAddRequestToStream).not.toHaveBeenCalled();
    });

    it("should process valid messages", async () => {
      mockIsInvalidMessage.mockReturnValue(false);
      mockAddRequestToStream.mockResolvedValue(undefined);
      const callback = getMockListener(mockClientInstance.on, "messageCreate");
      expect(callback).toBeDefined();

      const message = {
        react: jest.fn(),
      } as unknown as Message;

      await callback(message);

      expect(mockAddRequestToStream).toHaveBeenCalledWith(
        undefined,
        "messageCreate",
        message,
      );
      expect(message.react).toHaveBeenCalledWith("🐾");
    });

    it("should handle errors when processing a message", async () => {
      mockIsInvalidMessage.mockReturnValue(false);
      const errorMessage = "Redis is down";
      mockAddRequestToStream.mockRejectedValue(new Error(errorMessage));
      const callback = getMockListener(mockClientInstance.on, "messageCreate");
      expect(callback).toBeDefined();

      const message = {
        react: jest.fn(),
        reply: jest.fn(),
      } as unknown as Message;

      await callback(message);

      expect(message.reply).toHaveBeenCalledWith(
        `Could not process your request: ${errorMessage}`,
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
