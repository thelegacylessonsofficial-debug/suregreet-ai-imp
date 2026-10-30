import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { calcomRouter } from './routes/calcomWebhook.js';
import { retellRouter } from './routes/retellWebhook.js';
import { leadCallbackRouter } from './routes/leadCallbackWebhook.js';
import { initReminderCron, runDailyReminders } from './cron/reminderCron.js';

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
    service: 'Nexflo / SureGreet AI Automation Hub',
    time: new Date().toISOString(),
    endpoints: [
      'POST /webhook/calcom-booking-webhook',
      'POST /webhook/retell-post-call-webhook',
      'POST /webhook/suregreet-lead-callback',
      'POST /test/run-reminders',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Webhook Routes (exact 1:1 match with your n8n URLs)
app.use(['/webhook/calcom-booking-webhook', '/calcom-booking-webhook'], calcomRouter);
app.use(['/webhook/retell-post-call-webhook', '/retell-post-call-webhook'], retellRouter);
app.use(['/webhook/suregreet-lead-callback', '/suregreet-lead-callback'], leadCallbackRouter);

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
  console.log(`🚀 Nexflo Automation Server running on port ${PORT}`);
  console.log(`📡 Ready to receive webhooks from Cal.com, Retell AI, & Website`);
  console.log(`======================================================\n`);

  initReminderCron();
});
