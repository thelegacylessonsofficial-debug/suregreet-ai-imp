import { Router } from 'express';
import { sendTelegram, generateCoFounderReply } from '../services/telegram.js';

export const telegramRouter = Router();

telegramRouter.post('/', async (req, res) => {
  const data = req.body || {};

  try {
    if (data.message && data.message.text) {
      const incomingText = data.message.text;
      const chatId = String(data.message.chat?.id);

      console.log(`[Telegram Webhook] Message from ${chatId}: "${incomingText}"`);

      // Generate response
      const reply = generateCoFounderReply(incomingText);

      // Send asynchronously without blocking response
      sendTelegram(reply, chatId).catch((err) => {
        console.error('[Telegram Webhook] Error replying to chat:', err.message);
      });
    }
  } catch (err) {
    console.error('[Telegram Webhook] Error processing incoming update:', err.message);
  }

  // Telegram expects 200 OK immediately
  return res.status(200).json({ ok: true });
});
