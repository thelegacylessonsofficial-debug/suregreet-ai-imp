import { Router } from 'express';
import { processIncomingReply, classifyReply, generateLAARCResponse } from '../services/inboxTriageService.js';
import { getProspects } from '../services/outreachService.js';

export const inboxRouter = Router();

/**
 * Webhook endpoint for incoming email replies (from n8n, SendGrid Inbound Parse, Mailgun, or Gmail)
 */
inboxRouter.post(['/', '/reply'], async (req, res) => {
  const body = req.body || {};
  console.log('[Inbox Webhook] Received payload:', body);

  const fromEmail = body.from || body.fromEmail || body.email || body.sender || '';
  const subject = body.subject || '';
  const bodyText = body.text || body.body || body.message || body.strippedText || body.plain || '';
  const inReplyTo = body.inReplyTo || body['in-reply-to'] || '';

  if (!fromEmail || !bodyText) {
    return res.status(400).json({
      status: 'error',
      message: 'Both "from" email and "text" message body are required.',
    });
  }

  try {
    const result = await processIncomingReply({
      fromEmail,
      subject,
      bodyText,
      inReplyTo,
    });

    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (err) {
    console.error('[Inbox Webhook] Error processing reply:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Fast testing endpoint for simulating inbox sentiment classification
 */
inboxRouter.post('/test-triage', async (req, res) => {
  const { email, text } = req.body || {};
  if (!email || !text) {
    return res.status(400).json({ status: 'error', message: 'Fields "email" and "text" are required.' });
  }

  try {
    const result = await processIncomingReply({
      fromEmail: email,
      subject: 'Re: quick question',
      bodyText: text,
    });
    return res.json({ status: 'success', ...result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Visual Inbox Triage & Closer Dashboard
 */
inboxRouter.get('/dashboard', async (req, res) => {
  const prospects = await getProspects({ limit: 10 });
  const prospectOptions = prospects.map((p) => `<option value="${p.email}">${p.doctor_name || 'Doctor'} (${p.clinic_name || 'Clinic'}) - ${p.email}</option>`).join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SureGreet AI • Inbox Triage & Booking Closer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen antialiased font-sans">
  <!-- Nav Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <div class="w-9 h-9 rounded-xl bg-emerald-500 text-black font-extrabold flex items-center justify-center text-lg">⚡</div>
      <div>
        <h1 class="text-base font-bold text-white flex items-center gap-2">SureGreet AI <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Pillar 5: Inbox Triage</span></h1>
        <p class="text-[11px] text-gray-400">Autonomous Sentiment Classification & LAARC Objection Closer</p>
      </div>
    </div>
    <div class="flex items-center gap-2 text-xs font-mono">
      <a href="/outreach/prospects" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">📊 Pipeline CRM</a>
      <a href="/scraper/dashboard" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">⚡ Scraper Studio</a>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 py-8 space-y-8">
    <!-- Pillar Overview Banner -->
    <div class="p-6 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <div class="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold">Speed Wins Deals</div>
        <h2 class="text-xl font-bold text-white mt-1">Autonomous 4-Bucket Reply Triage Engine</h2>
        <p class="text-xs text-gray-400 mt-1 max-w-2xl">
          Classifies incoming doctor emails into <strong>POSITIVE_DEMO_REQUEST</strong>, <strong>OBJECTION_OR_QUESTION</strong>, <strong>NOT_INTERESTED</strong>, and <strong>OUT_OF_OFFICE</strong>. Freezes sequences in Supabase and delivers 1-click LAARC responses directly to Telegram.
        </p>
      </div>
      <span class="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
        LIVE & ACTIVE
      </span>
    </div>

    <!-- Interactive Simulator -->
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Input Card -->
      <div class="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <span>📨 Test Incoming Reply Simulation</span>
        </h3>

        <div class="space-y-1">
          <label class="text-xs font-mono text-gray-400">Select Test Prospect</label>
          <select id="simEmail" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500">
            ${prospectOptions}
          </select>
        </div>

        <div class="space-y-1">
          <label class="text-xs font-mono text-gray-400">Incoming Reply Text</label>
          <textarea id="simText" rows="4" placeholder="e.g., Yeah sure, send the walkthrough over or how much is this per month?" class="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"></textarea>
        </div>

        <!-- 1-Click Quick Presets -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-mono text-gray-500">Quick Test Presets:</div>
          <div class="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <button type="button" onclick="loadPreset('positive')" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-emerald-950/60 hover:text-emerald-400 transition-colors">🔥 Demo Request</button>
            <button type="button" onclick="loadPreset('price')" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-emerald-950/60 hover:text-emerald-400 transition-colors">💰 Price Question</button>
            <button type="button" onclick="loadPreset('staff')" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-emerald-950/60 hover:text-emerald-400 transition-colors">👥 Have Staff</button>
            <button type="button" onclick="loadPreset('unsub')" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-red-950/60 hover:text-red-400 transition-colors">🚫 Unsubscribe</button>
          </div>
        </div>

        <button id="btnSimulate" onclick="runSimulation()" class="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer">
          <span>⚡ Process Reply Through Triage</span>
        </button>
      </div>

      <!-- Output Card -->
      <div class="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider font-mono">
          <span>🎯 Execution Result & LAARC Output</span>
        </h3>

        <div id="resultBox" class="p-4 rounded-xl bg-gray-950 border border-gray-800 min-h-[220px] text-xs font-mono text-gray-400 flex items-center justify-center text-center">
          Select a preset or enter text and click "Process Reply Through Triage" to see the sentiment classification and actions taken.
        </div>
      </div>
    </div>
  </main>

  <script>
    const presets = {
      positive: "Yeah sure, send over that test line. Would love to hear how it handles our after-hours calls.",
      price: "How much does this cost per month? Just email me the pricing.",
      staff: "We already have front desk receptionists who answer our phones during the day.",
      unsub: "Please remove me from your email list, not interested."
    };

    function loadPreset(key) {
      document.getElementById('simText').value = presets[key] || '';
    }

    async function runSimulation() {
      const email = document.getElementById('simEmail').value;
      const text = document.getElementById('simText').value.trim();
      if (!text) return alert('Please enter or select reply text to simulate.');

      const btn = document.getElementById('btnSimulate');
      const box = document.getElementById('resultBox');

      btn.disabled = true;
      btn.innerText = 'Analyzing & Executing...';

      try {
        const res = await fetch('/inbox/test-triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, text })
        });
        const data = await res.json();

        btn.disabled = false;
        btn.innerText = '⚡ Process Reply Through Triage';

        if (data.status === 'success') {
          const badgeColor = data.classification.bucket === 'POSITIVE_DEMO_REQUEST'
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
            : data.classification.bucket === 'NOT_INTERESTED'
            ? 'bg-red-500/20 text-red-400 border-red-500/40'
            : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

          box.className = 'p-4 rounded-xl bg-gray-950 border border-gray-800 text-xs text-left space-y-3';
          box.innerHTML = \`
            <div class="flex items-center justify-between border-b border-gray-800 pb-2">
              <span class="text-gray-400 font-mono">Bucket:</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border \${badgeColor}">\${data.classification.bucket} (\${data.classification.subType})</span>
            </div>
            <div>
              <div class="text-[11px] text-gray-500 font-mono uppercase">Automated Actions Executed:</div>
              <ul class="list-disc list-inside text-gray-300 mt-1 space-y-0.5">
                \${data.actionsTaken.map(a => \`<li>\${a}</li>\`).join('')}
              </ul>
            </div>
            <div class="border-t border-gray-800 pt-2">
              <div class="text-[11px] text-emerald-400 font-mono uppercase font-bold">Suggested LAARC Reply (/harvey-sales):</div>
              <pre class="mt-1 p-2.5 rounded bg-gray-900 border border-gray-800 font-mono text-[11px] text-gray-200 whitespace-pre-wrap leading-relaxed">\${data.suggestedReply}</pre>
            </div>
          \`;
        } else {
          box.innerHTML = '<span class="text-red-400">Error: ' + (data.message || 'Simulation failed') + '</span>';
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerText = '⚡ Process Reply Through Triage';
        box.innerHTML = '<span class="text-red-400">Error: ' + err.message + '</span>';
      }
    }
  </script>
</body>
</html>`);
});
