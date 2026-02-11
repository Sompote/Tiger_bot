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

async function safeSendTyping(bot, chatId) {
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch (err) {
    process.stderr.write(`[telegram] sendChatAction failed: ${err.message}\n`);
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

    let typingTimer = null;
    try {
      await safeSendTyping(bot, chatId);
      typingTimer = setInterval(() => {
        safeSendTyping(bot, chatId);
      }, 4500);

      const reply = await handleMessage({
        platform: 'telegram',
        userId,
        text
      });
      if (typingTimer) clearInterval(typingTimer);
      await safeSendMessage(bot, chatId, reply);
    } catch (err) {
      if (typingTimer) clearInterval(typingTimer);
      await safeSendMessage(bot, chatId, `Error: ${err.message}`);
    }
  });

  return bot;
}

module.exports = {
  startTelegramBot
};
