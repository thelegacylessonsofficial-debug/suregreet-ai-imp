import { Router } from 'express';
import { processIncomingReply, classifyReply, generateLAARCResponse } from '../services/inboxTriageService.js';
import { getProspects } from '../services/outreachService.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';

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
  const authKey = req.query.key || '';
  const prospects = await getProspects({ limit: 15 });
  const prospectOptions = prospects
    .map((p) => `<option value="${p.email}">${p.doctor_name || 'Doctor'} (${p.clinic_name || 'Clinic'}) - ${p.email}</option>`)
    .join('\n');

  const bodyContent = `
    <!-- Pillar Overview Banner -->
    <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
      <div>
        <div class="text-xs font-mono text-amber-400 uppercase tracking-wider font-semibold">Speed Wins Deals</div>
        <h2 class="text-xl font-bold text-[var(--text-primary)] mt-1">Autonomous 4-Bucket Reply Triage Engine</h2>
        <p class="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
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
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono flex items-center gap-2">
          <span>Test Incoming Reply Simulation</span>
        </h3>

        <div class="space-y-1">
          <label class="text-xs font-mono text-[var(--text-muted)]">Select Test Prospect</label>
          <select id="simEmail" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-amber-500">
            ${prospectOptions}
          </select>
        </div>

        <div class="space-y-1">
          <label class="text-xs font-mono text-[var(--text-muted)]">Incoming Reply Text</label>
          <textarea id="simText" rows="4" placeholder="e.g., Yeah sure, send the walkthrough over or how much is this per month?" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-amber-500"></textarea>
        </div>

        <!-- 1-Click Quick Presets -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-mono text-[var(--text-muted)]">Quick Test Presets:</div>
          <div class="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <button type="button" onclick="loadPreset('positive')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-emerald-400 border border-[var(--border-subtle)] transition">Demo Request</button>
            <button type="button" onclick="loadPreset('price')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-amber-400 border border-[var(--border-subtle)] transition">Price Question</button>
            <button type="button" onclick="loadPreset('staff')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-cyan-400 border border-[var(--border-subtle)] transition">Have Staff</button>
            <button type="button" onclick="loadPreset('unsub')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-rose-400 border border-[var(--border-subtle)] transition">Unsubscribe</button>
          </div>
        </div>

        <button id="btnSimulate" onclick="runSimulation()" class="w-full py-3 rounded-xl bg-amber-500 hover:opacity-90 text-black font-bold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/15">
          ${getSvgIcon('bolt', 'w-4 h-4')}
          <span>Process Reply Through Triage</span>
        </button>
      </div>

      <!-- Output Card -->
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
          <span>Execution Result & LAARC Output</span>
        </h3>

        <div id="resultBox" class="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] min-h-[220px] text-xs font-mono text-[var(--text-muted)] flex items-center justify-center text-center">
          Select a preset or enter text and click "Process Reply Through Triage" to see the sentiment classification and actions taken.
        </div>
      </div>
    </div>
  `;

  const extraScripts = `
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
          const res = await fetch(getAuthUrl('/inbox/test-triage'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ email, text })
          });
          const data = await res.json();

          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Process Reply Through Triage</span>';

          if (data.status === 'success') {
            const badgeColor = data.classification.bucket === 'POSITIVE_DEMO_REQUEST'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : data.classification.bucket === 'NOT_INTERESTED'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

            box.className = 'p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-left space-y-3';
            box.innerHTML = \`
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <span class="text-[var(--text-muted)] font-mono">Bucket:</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border \${badgeColor}">\${data.classification.bucket} (\${data.classification.subType})</span>
              </div>
              <div>
                <div class="text-[11px] text-[var(--text-muted)] font-mono uppercase">Automated Actions Executed:</div>
                <ul class="list-disc list-inside text-[var(--text-secondary)] mt-1 space-y-0.5">
                  \${data.actionsTaken.map(a => \`<li>\${a}</li>\`).join('')}
                </ul>
              </div>
              <div class="border-t border-[var(--border-subtle)] pt-2">
                <div class="text-[11px] text-[var(--accent-emerald)] font-mono uppercase font-bold">Suggested LAARC Reply (/harvey-sales):</div>
                <pre class="mt-1 p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">\${data.suggestedReply}</pre>
              </div>
            \`;
            showToast('Triage Complete', data.classification.bucket, 'success');
          } else {
            box.innerHTML = '<span class="text-rose-400">Error: ' + (data.message || 'Simulation failed') + '</span>';
            showToast('Triage Failed', data.message || 'Error', 'error');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Process Reply Through Triage</span>';
          box.innerHTML = '<span class="text-rose-400">Error: ' + err.message + '</span>';
          showToast('Network Error', err.message, 'error');
        }
      }
    </script>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderSaasShell({
      title: 'SureGreet AI — Inbox Triage & Booking Closer',
      activeNav: 'inbox',
      pageHeading: 'Inbox LAARC Closer & Sentiment Triage',
      badgeText: 'Pillar 5 • Speed-to-Lead',
      bodyContent,
      extraScripts,
      authKeyParam: authKey,
    })
  );
});
