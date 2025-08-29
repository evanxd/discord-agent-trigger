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
   REDIS_HOST="127.0.0.1"
   REDIS_PORT="6379"
   REDIS_USERNAME="default"
   REDIS_PASSWORD="YOUR_REDIS_PASSWORD"
   DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
   DISCORD_BOT_ALLOWED_CHANNEL_NAME="YOUR_ALLOWED_CHANNEL_NAME"
   ```
2. Replace the placeholder values with your actual credentials.

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

The bot listens for messages in a Discord channel. When a message is received, it's added as a task to a Redis stream named `discord:tasks`.

An external agent (not included in this project) is expected to be listening to this stream. The agent processes the task and posts the result to another Redis stream named `discord:results`.

The bot listens to the `discord:results` stream. When a result is received, it's posted back to the Discord channel where the original request was made.

## 🙏 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
