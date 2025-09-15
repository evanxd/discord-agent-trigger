# Discord Agent Trigger

This project is a Discord bot that triggers an external agent to do tasks users request. It uses Redis to queue tasks and retrieve results.

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/discord-agent-trigger.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## ⚙️ Configuration

1. Create a `.env` file in the root of the project with the following content:
   ```
   DISCORD_BOT_ALLOWED_CHANNEL_NAME="YOUR_ALLOWED_CHANNEL_NAME"
   DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
   REDIS_HOST="127.0.0.1"
   REDIS_PASSWORD="YOUR_REDIS_PASSWORD"
   REDIS_PORT="6379"
   REDIS_USERNAME="default"
   PORT="3000"
   STREAM_REQUESTS="discord:requests"
   STREAM_RESULTS="discord:results"
   ```
2. Replace the placeholder values with your actual credentials. The `PORT` variable is for the health check server and defaults to 3000 if not provided. The `STREAM_REQUESTS` and `STREAM_RESULTS` variables are for the Redis streams and default to `discord:requests` and `discord:results` respectively.

## ▶️ Usage

1. Build the project:
   ```bash
   npm run build
   ```
2. Start the bot:
   ```bash
   npm run start
   ```

## 🧠 How it Works

This bot facilitates communication between Discord and an external agent using Redis streams for task queuing.

- **Message Creation**: When a user sends a message in the designated channel, the bot reacts with a '🤖' emoji and adds a task to the `discord:requests` Redis stream.
- **Message Deletion**: If a message is deleted, a corresponding `messageDelete` message is sent to the same stream.
- **Agent Processing**: An external agent (like [evanxd/expense-log-agent][1]) consumes tasks from the `discord:requests` stream. After processing, the agent publishes the results to the `discord:results` stream.
- **Result Handling**: The bot monitors the `discord:results` stream. When a result is received, it posts the result as a reply to the original message in the Discord channel.
- **Stream Cleanup**: After a result is successfully processed and posted to Discord, the corresponding request and result messages are deleted from their respective Redis streams to prevent reprocessing and save memory.
- **Health Check**: A lightweight Express server runs a `/health` endpoint to allow for simple health checks in deployment environments.

## 🙌 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

[1]: https://github.com/evanxd/expense-log-agent
