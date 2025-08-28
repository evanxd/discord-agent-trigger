import { RedisClientType } from "redis";

export async function waitForTaskResults(
  client: RedisClientType,
  callback: Function,
) {
  let lastMessageId = "0";
  while (true) {
    try {
      const streams = await client.xRead(
        [ { key: "discord:results", id: lastMessageId } ],
        { BLOCK: 5000, COUNT: 10 },
      );
      if (streams) {
        for (const message of streams[0].messages) {
          await callback(message.message);
          lastMessageId = message.id;
          await cleanupTaskData(client, message.message.taskId, lastMessageId);
        }
      }
    } catch (err) {
      console.error("Error reading from Redis stream:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function cleanupTaskData(
  client: RedisClientType,
  taskId: string,
  resultId: string
) {
  await Promise.all([
    client.xDel(
      "discord:tasks",
      taskId,
    ),
    client.xDel(
      "discord:results",
      resultId,
    ),
  ]);
}
