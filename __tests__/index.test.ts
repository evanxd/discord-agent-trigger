import { Client } from "discord.js";

const mockOnce = jest.fn();
const mockFetchDiscordMembers = jest.fn();
const mockFetchDiscordMessages = jest.fn();
const mockListenForRedisResults = jest.fn().mockResolvedValue(undefined);
const mockClientInstance = {
  once: mockOnce,
  on: jest.fn(),
  login: jest.fn(),
  user: { tag: "test-bot" },
} as unknown as Client;

jest.mock("../src/utils/discord", () => ({
  fetchDiscordMembers: mockFetchDiscordMembers,
  fetchDiscordMessages: mockFetchDiscordMessages,
}));
jest.mock("../src/utils/redis", () => ({
  createRedisClient: jest.fn(),
  listenForRedisResults: mockListenForRedisResults,
}));
jest.mock("../src/utils/server", () => ({
  startServer: jest.fn(),
}));
jest.mock("discord.js", () => ({
  Client: jest.fn().mockImplementation(() => {
    return mockClientInstance;
  }),
  GatewayIntentBits: {
    Guilds: 0,
    GuildMembers: 0,
    GuildMessages: 0,
    MessageContent: 0,
  },
}));

const getListener = (mock: jest.Mock, event: string) => {
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
      const readyCallback = getListener(mockOnce, "clientReady");
      expect(readyCallback).toBeDefined();

      await readyCallback(mockClientInstance);

      expect(mockFetchDiscordMembers).toHaveBeenCalledTimes(1);
      expect(mockFetchDiscordMessages).toHaveBeenCalledTimes(1);
      expect(mockListenForRedisResults).toHaveBeenCalledTimes(1);
    });
  });
});
