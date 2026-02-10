const TelegramBot = require('node-telegram-bot-api');
const { telegramBotToken } = require('../config');
const { handleMessage } = require('../agent/mainAgent');

async function safeSendMessage(bot, chatId, text) {
  try {
    await bot.sendMessage(chatId, text);
  } catch (err) {
    process.stderr.write(`[telegram] sendMessage failed: ${err.message}\n`);
  }
}

function startTelegramBot() {
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is empty.');
  }

  const bot = new TelegramBot(telegramBotToken, { polling: true });

  bot.on('polling_error', (err) => {
    process.stderr.write(`[telegram] polling_error: ${err.message}\n`);
  });

  bot.on('error', (err) => {
    process.stderr.write(`[telegram] error: ${err.message}\n`);
  });

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
      await safeSendMessage(bot, chatId, reply);
    } catch (err) {
      await safeSendMessage(bot, chatId, `Error: ${err.message}`);
    }
  });

  return bot;
}

module.exports = {
  startTelegramBot
};
