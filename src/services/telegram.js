import axios from 'axios';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9139255800:AAEEZYySb6jGEwObsvYroCgc1qjLDR0ufiI';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7076170210';

export async function sendTelegram(text, chatId = TELEGRAM_CHAT_ID) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    });
    return res.data;
  } catch (err) {
    console.error('[Telegram] Send error:', err.response?.data || err.message);
    return null;
  }
}

export function generateCoFounderReply(userText) {
  const textLower = (userText || '').trim().toLowerCase();

  if (textLower.includes('/start') || textLower.includes('hello') || textLower.includes('hi')) {
    return (
      "🔥 *SureGreet AI Co-Founder Online!*\n\n" +
      "Hey Archit! I'm active and listening 24/7.\n\n" +
      "Quick commands:\n" +
      "👉 `/tasks` — See today's non-negotiable priorities\n" +
      "👉 `/status` — View 10-client pipeline & revenue\n" +
      "👉 `/roadmap` — Review our 30-day zero-budget plan\n" +
      "👉 `/audit` — Get the MedSpa outreach script\n\n" +
      "Or message me anything you're working on!"
    );
  } else if (textLower.includes('/tasks') || textLower.includes('task')) {
    return (
      "🎯 *TODAY'S TOP 3 PRIORITIES (SureGreet AI)*\n\n" +
      "1. 📚 *2:30–5:30 PM*: 12th Board study block (Non-negotiable).\n" +
      "2. 🇺🇸 *6:30–11:00 PM*: Pull 5 MedSpas on Meta Ads Library.\n" +
      "3. 🤝 Post our Free Pilot Offer in 2 Skool communities.\n\n" +
      "Have you finished any of these yet? Let me know!"
    );
  } else if (textLower.includes('/status') || textLower.includes('status')) {
    return (
      "📊 *SUREGREET AI PIPELINE STATUS*\n\n" +
      "• Active Retainers: 0/10\n" +
      "• Target MRR: $5,000–$10,000 (₹5L–₹8.5L)\n" +
      "• Core Offer: AI Receptionist + Speed-to-Lead\n" +
      "• Next Milestone: First 2 Free Video Testimonials\n\n" +
      "Keep the momentum rolling, Founder!"
    );
  } else if (textLower.includes('/roadmap') || textLower.includes('roadmap')) {
    return (
      "🗺️ *30-DAY ZERO-BUDGET ROADMAP*\n\n" +
      "• *Week 1*: Cloud Bot & Website live for $0.\n" +
      "• *Week 2*: 2 Free Skool Pilots secured.\n" +
      "• *Week 3*: Deliver systems & extract 2 video reviews.\n" +
      "• *Week 4*: Close Client #1 at $1,000/mo retainer!"
    );
  } else if (textLower.includes('/audit') || textLower.includes('script')) {
    return (
      "📲 *MEDSPA 75-SECOND AUDIT SCRIPT*\n\n" +
      '"Hey [Doctor Name], I submitted an inquiry on your Morpheus8 ad last night at 7:45 PM.\n\n' +
      "Your front desk was closed, but 78% of high-intent patients book with whoever texts back in 5 minutes.\n\n" +
      "I built a 60-second video showing how SureGreet AI greets ad leads in under 30 seconds and collects deposits on autopilot: [Link]\n\n" +
      'Open to taking a peek? — Archit"'
    );
  } else {
    return (
      `⚡ *SureGreet AI Co-Founder Received:* "${userText}"\n\n` +
      "Message logged in agency memory! Keep pushing on today's priorities. " +
      "Type `/tasks` for your daily to-do list."
    );
  }
}

export async function setTelegramWebhook(renderUrl) {
  const webhookUrl = `${renderUrl.replace(/\/+$/, '')}/webhook/telegram`;
  const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
  try {
    const res = await axios.get(apiUrl);
    console.log('[Telegram] Webhook set response:', res.data);
    return res.data;
  } catch (err) {
    console.error('[Telegram] Error setting webhook:', err.response?.data || err.message);
    return null;
  }
}
