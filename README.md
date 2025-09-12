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
   ```
2. Replace the placeholder values with your actual credentials. The `PORT` variable is for the health check server and defaults to 3000 if not provided.

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

- **Message Creation**: When a user sends a message in the designated channel, the bot adds it to the `discord:requests` Redis stream.
- **Message Deletion**: If a message is deleted, a corresponding deletion task is sent to the same stream.
- **Agent Processing**: The [evanxd/expense-log-agent][1] external agent consumes tasks from the `discord:requests` stream, processes them, and publishes the results to the `discord:results` stream.
- **Result Display**: The bot monitors the `discord:results` stream and posts any incoming results back to the Discord channel.
- **Health Check**: A lightweight Express server runs a `/health` endpoint to allow for simple health checks in deployment environments.

## 🙌 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

[1]: https://github.com/evanxd/expense-log-agent
