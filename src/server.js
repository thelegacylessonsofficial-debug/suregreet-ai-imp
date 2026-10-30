import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { calcomRouter } from './routes/calcomWebhook.js';
import { retellRouter } from './routes/retellWebhook.js';
import { leadCallbackRouter } from './routes/leadCallbackWebhook.js';
import { telegramRouter } from './routes/telegramWebhook.js';
import { initReminderCron, runDailyReminders } from './cron/reminderCron.js';
import { initAccountabilityCron } from './cron/accountabilityCron.js';
import { setTelegramWebhook } from './services/telegram.js';

const app = express();

// Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    agency: 'SureGreet AI',
    bot: '@SureGreetaiArchit_bot',
    time: new Date().toISOString(),
    endpoints: [
      'POST /webhook/calcom-booking-webhook',
      'POST /webhook/retell-post-call-webhook',
      'POST /webhook/suregreet-lead-callback',
      'POST /webhook/telegram',
      'GET /set-webhook',
      'POST /test/run-reminders',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Telegram Setup Endpoint
app.get('/set-webhook', async (req, res) => {
  const renderUrl = req.query.render_url || 'https://suregreet-automation.onrender.com';
  const result = await setTelegramWebhook(renderUrl);
  res.json({ success: Boolean(result?.ok), telegram_response: result });
});

// Webhook Routes
app.use(['/webhook/calcom-booking-webhook', '/calcom-booking-webhook'], calcomRouter);
app.use(['/webhook/retell-post-call-webhook', '/retell-post-call-webhook'], retellRouter);
app.use(['/webhook/suregreet-lead-callback', '/suregreet-lead-callback'], leadCallbackRouter);
app.use(['/webhook/telegram', '/telegram'], telegramRouter);

// Manual trigger for testing 24h reminders immediately
app.all('/test/run-reminders', async (req, res) => {
  try {
    const result = await runDailyReminders();
    res.json({ status: 'success', result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Start Cron Jobs & Server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SureGreet AI Automation Hub running on port ${PORT}`);
  console.log(`📡 Ready for Cal.com, Retell AI, HubSpot, & Telegram Bot`);
  console.log(`======================================================\n`);

  initReminderCron();
  initAccountabilityCron();
});
