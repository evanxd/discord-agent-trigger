import { TextChannel, Message } from "discord.js";
import { RedisClientType } from "redis";

jest.mock("redis", () => ({
  createClient: jest.fn(),
}));

import {
  addRequestToStream,
  createRedisClient,
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
});
