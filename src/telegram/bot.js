const TelegramBot = require('node-telegram-bot-api');
const { telegramBotToken } = require('../config');
const { handleMessage } = require('../agent/mainAgent');

function startTelegramBot() {
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is empty.');
  }

  const bot = new TelegramBot(telegramBotToken, { polling: true });

  bot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    const userId = String(msg.from?.id || msg.chat.id);
    const text = String(msg.text || '').trim();

    if (!text) return;

    try {
      const reply = await handleMessage({
        platform: 'telegram',
        userId,
        text
      });
      await bot.sendMessage(chatId, reply);
    } catch (err) {
      await bot.sendMessage(chatId, `Error: ${err.message}`);
    }
  });

  return bot;
}

module.exports = {
  startTelegramBot
};
