import { TextChannel, Message, Client, Channel } from "discord.js";
import { RedisClientType } from "redis";

jest.mock("redis", () => ({
  createClient: jest.fn(),
}));

import {
  addRequestToStream,
  createRedisClient,
  listenForRedisResults,
} from "../../src/utils/redis.js";

const mockCreateClient = jest.requireMock("redis").createClient;

describe("Redis Utils", () => {
  let mockClient: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      xAdd: jest.fn().mockResolvedValue(""),
      xDel: jest.fn().mockResolvedValue(1),
      xRead: jest.fn(),
    } as unknown as jest.Mocked<RedisClientType>;
    mockCreateClient.mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createRedisClient", () => {
    it("should create and connect a redis client", async () => {
      const client = await createRedisClient();
      expect(mockCreateClient).toHaveBeenCalled();
      expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(client.connect).toHaveBeenCalled();
    });

    it("should throw an error if connection fails", async () => {
      const error = new Error("Connection failed");
      mockClient.connect.mockRejectedValue(error);
      await expect(createRedisClient()).rejects.toThrow(error);
    });
  });

  describe("addRequestToStream", () => {
    it("should add a request to the stream", async () => {
      const mockChannel = {
        members: {
          filter: jest.fn().mockReturnValue({
            map: jest.fn().mockReturnValue(["user2"]),
          }),
        },
      };
      Object.setPrototypeOf(mockChannel, TextChannel.prototype);

      const mockMessage = {
        id: "message-id",
        channel: mockChannel as unknown as TextChannel,
        channelId: "channel-id",
        author: { username: "test-user" },
        content: "test message",
        client: { user: { id: "discord-client-id" } },
      } as Message;

      await addRequestToStream(
        mockClient as RedisClientType,
        "test-event",
        mockMessage,
      );

      expect(mockClient.xAdd).toHaveBeenCalledWith(
        "discord:requests",
        expect.any(String),
        expect.objectContaining({
          event: "test-event",
          instruction: "test message",
          sender: "test-user",
          channelId: "channel-id",
          messageId: "message-id",
          groupMembers: JSON.stringify(["user2"]),
          ledgerId: "discord:channel-id",
          requestId: expect.any(String),
        }),
      );
    });

    it("should throw an error for non-text channels", async () => {
      const mockMessage = {
        channel: { isTextBased: () => false },
      } as Message;

      await expect(
        addRequestToStream(
          mockClient as RedisClientType,
          "test-event",
          mockMessage,
        ),
      ).rejects.toThrow(
        "Tasks can only be initiated from server text channels",
      );
    });
  });

  describe("listenForRedisResults", () => {
    let mockDiscordClient: jest.Mocked<Client>;
    let mockResultClient: jest.Mocked<RedisClientType>;
    let mockTaskClient: jest.Mocked<RedisClientType>;
    let mockChannel: jest.Mocked<TextChannel>;

    type RedisStreamMessage = {
      id: string;
      message: {
        result: string;
        channelId: string;
        messageId: string;
        requestId: string;
      };
    };

    beforeEach(() => {
      mockResultClient = {
        xRead: jest.fn(),
      } as unknown as jest.Mocked<RedisClientType>;

      mockTaskClient = {
        xDel: jest.fn().mockResolvedValue(1),
      } as unknown as jest.Mocked<RedisClientType>;

      mockChannel = {
        send: jest.fn().mockResolvedValue({}),
      } as unknown as jest.Mocked<TextChannel>;
      Object.setPrototypeOf(mockChannel, TextChannel.prototype);

      mockDiscordClient = {
        channels: {
          fetch: jest.fn().mockResolvedValue(mockChannel),
        },
      } as unknown as jest.Mocked<Client>;

      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    it("should process a result, send a message, and clean up streams", async () => {
      const resultMessage = {
        id: "result-id-1",
        message: {
          result: "test result text",
          channelId: "channel-1",
          messageId: "message-1",
          requestId: "request-1",
        },
      };

      mockResultClient.xRead.mockResolvedValueOnce([
        { name: "discord:results", messages: [resultMessage] },
      ]);
      mockResultClient.xRead.mockImplementation(() => new Promise(() => {}));

      let resolver: () => void;
      const promise = new Promise<void>((resolve) => {
        resolver = resolve;
      });

      mockTaskClient.xDel.mockImplementation(async () => {
        if (mockTaskClient.xDel.mock.calls.length >= 2) {
          resolver();
        }
        return 1;
      });

      listenForRedisResults(
        mockDiscordClient,
        mockResultClient,
        mockTaskClient,
      );

      await promise;

      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(
        "channel-1",
      );
      expect(mockChannel.send).toHaveBeenCalledWith({
        content: "test result text",
        reply: {
          messageReference: "message-1",
          failIfNotExists: false,
        },
      });
      expect(mockTaskClient.xDel).toHaveBeenCalledWith(
        "discord:requests",
        "request-1",
      );
      expect(mockTaskClient.xDel).toHaveBeenCalledWith(
        "discord:results",
        "result-id-1",
      );
    });

    it("should skip results with missing fields", async () => {
      const invalidResultMessage = {
        id: "result-id-1",
        message: {
          result: "test result text",
          channelId: "channel-1",
          messageId: "message-1",
          // requestId is missing
        },
      };

      mockResultClient.xRead.mockResolvedValueOnce([
        {
          name: "discord:results",
          messages: [invalidResultMessage as unknown as RedisStreamMessage],
        },
      ]);

      let resolver: () => void;
      const promise = new Promise<void>((resolve) => {
        resolver = resolve;
      });
      mockResultClient.xRead.mockImplementation(async () => {
        resolver();
        return new Promise(() => {}); // Hang
      });

      listenForRedisResults(
        mockDiscordClient,
        mockResultClient,
        mockTaskClient,
      );

      await promise;

      expect(mockDiscordClient.channels.fetch).not.toHaveBeenCalled();
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(mockTaskClient.xDel).not.toHaveBeenCalled();
    });

    it("should skip results if channel is not a text channel", async () => {
      const resultMessage = {
        id: "result-id-1",
        message: {
          result: "test result text",
          channelId: "channel-1",
          messageId: "message-1",
          requestId: "request-1",
        },
      };

      (mockDiscordClient.channels.fetch as jest.Mock).mockResolvedValue({
        type: "not-text",
      } as unknown as Channel);

      mockResultClient.xRead.mockResolvedValueOnce([
        { name: "discord:results", messages: [resultMessage] },
      ]);
      let resolver: () => void;
      const promise = new Promise<void>((resolve) => {
        resolver = resolve;
      });
      mockResultClient.xRead.mockImplementation(async () => {
        resolver();
        return new Promise(() => {});
      });

      listenForRedisResults(
        mockDiscordClient,
        mockResultClient,
        mockTaskClient,
      );

      await promise;

      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(
        "channel-1",
      );
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(mockTaskClient.xDel).not.toHaveBeenCalled();
    });

    it("should not send a message but still clean up if result text is empty", async () => {
      const resultMessage = {
        id: "result-id-1",
        message: {
          result: "",
          channelId: "channel-1",
          messageId: "message-1",
          requestId: "request-1",
        },
      };

      mockResultClient.xRead.mockResolvedValueOnce([
        { name: "discord:results", messages: [resultMessage] },
      ]);
      mockResultClient.xRead.mockImplementation(() => new Promise(() => {}));

      let resolver: () => void;
      const promise = new Promise<void>((resolve) => {
        resolver = resolve;
      });

      mockTaskClient.xDel.mockImplementation(async () => {
        if (mockTaskClient.xDel.mock.calls.length >= 2) {
          resolver();
        }
        return 1;
      });

      listenForRedisResults(
        mockDiscordClient,
        mockResultClient,
        mockTaskClient,
      );

      await promise;

      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(
        "channel-1",
      );
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(mockTaskClient.xDel).toHaveBeenCalledWith(
        "discord:requests",
        "request-1",
      );
      expect(mockTaskClient.xDel).toHaveBeenCalledWith(
        "discord:results",
        "result-id-1",
      );
    });

    it("should log an error if cleanup fails", async () => {
      const resultMessage = {
        id: "result-id-1",
        message: {
          result: "test result text",
          channelId: "channel-1",
          messageId: "message-1",
          requestId: "request-1",
        },
      };
      const cleanupError = new Error("Cleanup failed");

      mockResultClient.xRead.mockResolvedValueOnce([
        { name: "discord:results", messages: [resultMessage] },
      ]);
      mockResultClient.xRead.mockImplementation(() => new Promise(() => {}));
      mockTaskClient.xDel.mockRejectedValue(cleanupError);

      let resolver: () => void;
      const promise = new Promise<void>((resolve) => {
        resolver = resolve;
      });

      (console.error as jest.Mock).mockImplementation(() => {
        resolver();
      });

      listenForRedisResults(
        mockDiscordClient,
        mockResultClient,
        mockTaskClient,
      );

      await promise;

      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(
        "channel-1",
      );
      expect(mockChannel.send).toHaveBeenCalled();
      expect(mockTaskClient.xDel).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to cleanup Redis streams for request request-1 and result result-id-1",
        cleanupError,
      );
    });
  });
});
