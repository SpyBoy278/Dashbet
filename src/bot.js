const TelegramBot = require('node-telegram-bot-api');

function initBot(token, miniAppUrl) {
  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const referralCode = match[1] ? match[1].trim() : '';

    const welcomeText = `🎮 *Welcome to Dashbet!*

Ethiopia's #1 Telegram Gaming Platform!

🐔 *Chicken Road* - Navigate the minefield!
🎱 *Fast Keno* - Pick your lucky numbers!

💰 Deposit & withdraw via Telbirr & CBE Birr
🎁 Get 20% cashback on losses
👥 Refer friends & earn 10 ETB bonus

Tap "Launch App" to start playing! 🚀`;

    const startParam = referralCode ? `?ref=${referralCode}` : '';

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Launch App', web_app: { url: `${miniAppUrl}${startParam}` } }],
          [{ text: '📢 Join Channel', url: 'https://t.me/dashbet_channel' }],
          [{ text: '💬 Support', url: 'https://t.me/dashbet_support' }],
          [{ text: '👥 Referral', callback_data: 'referral' }]
        ]
      },
      parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, welcomeText, keyboard);
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === 'referral') {
      const referralLink = `https://t.me/DashbetBot?start=${userId}`;
      const text = `👥 *Your Referral Link*\n\n${referralLink}\n\n📋 Share this link with friends!\n💰 Earn *10 ETB* for every friend who deposits 100+ ETB\n\nTap the link to copy it!`;

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }

    bot.answerCallbackQuery(query.id);
  });

  bot.on('polling_error', (error) => {
    console.error('Bot polling error:', error.message);
  });

  console.log('🤖 Dashbet Telegram Bot started!');
  return bot;
}

module.exports = { initBot };
