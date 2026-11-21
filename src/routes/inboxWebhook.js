import { Router } from 'express';
import { processIncomingReply, classifyReply, generateLAARCResponse } from '../services/inboxTriageService.js';
import { getProspects } from '../services/outreachService.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';
import { sendEmail } from '../services/mailer.js';
import { config } from '../config.js';

export const inboxRouter = Router();

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// In-memory buffer of recent triage activities for live inspection
const recentTriageEvents = [];

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

    recentTriageEvents.unshift({
      timestamp: new Date().toISOString(),
      fromEmail,
      subject,
      bodyPreview: bodyText.slice(0, 120),
      classification: result.classification,
      actionsTaken: result.actionsTaken,
      suggestedReply: result.suggestedReply,
    });
    if (recentTriageEvents.length > 30) recentTriageEvents.pop();

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

    recentTriageEvents.unshift({
      timestamp: new Date().toISOString(),
      fromEmail: email,
      subject: 'Re: quick question',
      bodyPreview: text.slice(0, 120),
      classification: result.classification,
      actionsTaken: result.actionsTaken,
      suggestedReply: result.suggestedReply,
    });
    if (recentTriageEvents.length > 30) recentTriageEvents.pop();

    return res.json({ status: 'success', ...result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * 1-Click Send Reply Endpoint (Live via Resend or Safe Demo to Archit)
 */
inboxRouter.post('/send-reply', async (req, res) => {
  const { to, subject, text, isTest } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ status: 'error', message: 'Fields "to" and "text" are required.' });
  }

  const recipient = isTest ? (config.ownerEmail || 'architd062@gmail.com') : to;
  const subj = isTest ? `[TEST LAARC REPLY] ${subject || 'Re: quick question'}` : (subject || 'Re: quick question');

  try {
    const result = await sendEmail({
      to: recipient,
      subject: subj,
      text,
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 540px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <div style="font-size: 11px; font-weight: bold; color: #f59e0b; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
          ⚡ SureGreet AI • LAARC Objection Closer Reply
        </div>
        <div style="white-space: pre-line; color: #0f172a; margin-bottom: 12px;">
          ${escapeHtml(text)}
        </div>
        <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          ${isTest ? `Sent in TEST DEMO mode to Archit (${recipient})` : `Dispatched directly to prospect (${recipient})`}
        </div>
      </div>`,
    });

    return res.json({ status: result.success ? 'success' : 'error', recipient, ...result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Visual Inbox Triage & Closer Dashboard
 */
inboxRouter.get('/dashboard', async (req, res) => {
  const authKey = req.query.key || '';
  const prospects = await getProspects({ limit: 500 });
  const repliedProspects = prospects.filter((p) => p.status === 'replied' || p.status === 'unsubscribed');

  const prospectOptions = prospects
    .map((p) => {
      const tag = p.status === 'replied' ? ' [REPLIED]' : p.status === 'active' ? ' [ACTIVE]' : '';
      return `<option value="${escapeHtml(p.email)}">${escapeHtml(p.doctor_name || 'Doctor')} (${escapeHtml(p.clinic_name || 'Clinic')})${tag} - ${escapeHtml(p.email)}</option>`;
    })
    .join('\n');

  const bodyContent = `
    <!-- Pillar Overview Banner -->
    <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
      <div>
        <div class="text-xs font-mono text-amber-400 uppercase tracking-wider font-semibold">Speed Wins Deals • /harvey-sales</div>
        <h2 class="text-xl font-bold text-[var(--text-primary)] mt-1">Autonomous 4-Bucket Reply Triage Engine</h2>
        <p class="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
          Classifies incoming doctor emails into <strong>POSITIVE_DEMO_REQUEST</strong>, <strong>OBJECTION_OR_QUESTION</strong>, <strong>NOT_INTERESTED</strong>, and <strong>OUT_OF_OFFICE</strong>. Freezes sequences in Supabase and delivers 1-click LAARC responses directly to Telegram.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
          LIVE ENGINE
        </span>
        <button onclick="toggleWebhookHelp()" class="px-3 py-1 rounded-full text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition">
          Webhook Specs
        </button>
      </div>
    </div>

    <!-- Webhook Integration Card (Collapsible) -->
    <div id="webhookSpecCard" class="hidden p-5 rounded-2xl bg-[var(--bg-card)] border border-amber-500/30 space-y-3 font-mono text-xs">
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <span class="font-bold text-amber-400 uppercase tracking-wider">Inbound Reply Webhook Specification</span>
        <button onclick="toggleWebhookHelp()" class="text-[var(--text-muted)] hover:text-white">✕</button>
      </div>
      <p class="text-[var(--text-secondary)] text-[11px] leading-relaxed">
        Point your inbound email provider (SendGrid Inbound Parse, Cloudflare Email Routing, Mailgun, or n8n) to:
      </p>
      <div class="p-2.5 rounded-xl bg-black/60 border border-[var(--border-subtle)] text-emerald-400 select-all font-mono text-xs flex justify-between items-center">
        <span>POST https://suregreet-automation.onrender.com/webhook/inbox-reply</span>
        <button onclick="copyToClipboard('https://suregreet-automation.onrender.com/webhook/inbox-reply', 'Webhook URL copied!')" class="text-[10px] text-[var(--text-muted)] hover:text-white uppercase font-bold">Copy</button>
      </div>
      <div class="text-[11px] text-[var(--text-muted)]">
        Required JSON fields: <code>from</code> (sender email) and <code>text</code> (reply body). Optional: <code>subject</code>, <code>inReplyTo</code>.
      </div>
    </div>

    <!-- Interactive Simulator -->
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Input Card -->
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono flex items-center justify-between">
          <span>Test Incoming Reply Simulation</span>
          <span class="text-[10px] font-normal text-[var(--text-muted)] font-mono">${prospects.length} CRM Leads Loaded</span>
        </h3>

        <div class="space-y-1">
          <label class="text-xs font-mono text-[var(--text-muted)]">Select Target Prospect</label>
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
            <button type="button" onclick="loadPreset('robot')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-purple-400 border border-[var(--border-subtle)] transition">Sounds Robotic?</button>
            <button type="button" onclick="loadPreset('unsub')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-rose-400 border border-[var(--border-subtle)] transition">Unsubscribe</button>
          </div>
        </div>

        <button id="btnSimulate" onclick="runSimulation()" class="w-full py-3 rounded-xl bg-amber-500 hover:opacity-90 text-black font-bold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/15 cursor-pointer">
          ${getSvgIcon('bolt', 'w-4 h-4')}
          <span>Process Reply Through Triage</span>
        </button>
      </div>

      <!-- Output Card -->
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-3">
            <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
              <span>Execution Result & LAARC Output</span>
            </h3>
            <span id="triageTimingBadge" class="text-[10px] font-mono text-[var(--text-muted)]"></span>
          </div>

          <div id="resultBox" class="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] min-h-[220px] text-xs font-mono text-[var(--text-muted)] flex items-center justify-center text-center">
            Select a preset or enter text and click "Process Reply Through Triage" to see the sentiment classification and actions taken.
          </div>
        </div>

        <!-- 1-Click Action Hub (Hidden Until Triage Result Generated) -->
        <div id="laarcActionHub" class="hidden pt-3 border-t border-[var(--border-subtle)] space-y-2">
          <div class="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
            <span>Direct Outbound Dispatch:</span>
            <span class="text-emerald-400 font-semibold">Resend API Armed</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="dispatchLaarcReply(true)" id="btnTestReply" class="py-2 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer">
              ${getSvgIcon('send', 'w-3.5 h-3.5 text-amber-400')}
              <span>Send Demo to Archit</span>
            </button>
            <button onclick="dispatchLaarcReply(false)" id="btnLiveReply" class="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer">
              ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
              <span>Send Live to Doctor</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Prospects in Reply State Table -->
    <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono flex items-center gap-2">
            <span>Prospects in Inbound Reply / Triage State</span>
            <span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">${repliedProspects.length} Leads</span>
          </h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">Leads whose automated sequence was frozen because they replied or unsubscribed.</p>
        </div>
        <a href="/outreach/prospects${authKey ? `?key=${encodeURIComponent(authKey)}` : ''}" class="text-xs text-[var(--accent-emerald)] hover:underline flex items-center gap-1 font-mono">
          <span>View full CRM (${prospects.length})</span>
          ${getSvgIcon('external', 'w-3 h-3')}
        </a>
      </div>

      ${
        repliedProspects.length === 0
          ? `<div class="p-8 text-center text-[var(--text-muted)] text-xs font-mono">
               No prospects currently in 'replied' or 'unsubscribed' state. Active sequence is running.
             </div>`
          : `<div class="overflow-x-auto">
               <table class="w-full text-left text-xs font-mono">
                 <thead class="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                   <tr>
                     <th class="pb-2.5">Doctor / Clinic</th>
                     <th class="pb-2.5">Email</th>
                     <th class="pb-2.5">Status</th>
                     <th class="pb-2.5">Last Triage Activity & Notes</th>
                     <th class="pb-2.5 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody class="divide-y divide-[var(--border-subtle)]/60">
                   ${repliedProspects
                     .map((p) => {
                       const isUnsub = p.status === 'unsubscribed';
                       const badge = isUnsub
                         ? '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">UNSUBSCRIBED</span>'
                         : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">REPLIED</span>';

                       return `
                       <tr class="hover:bg-[var(--bg-hover)] transition">
                         <td class="py-3 text-[var(--text-primary)] font-semibold">
                           <div>${escapeHtml(p.doctor_name || 'Doctor')}</div>
                           <div class="text-[11px] text-[var(--text-muted)]">${escapeHtml(p.clinic_name || '')}</div>
                         </td>
                         <td class="py-3 text-[var(--text-secondary)]">${escapeHtml(p.email)}</td>
                         <td class="py-3">${badge}</td>
                         <td class="py-3 text-[var(--text-muted)] max-w-xs truncate" title="${escapeHtml(p.notes || '')}">
                           ${escapeHtml(p.notes || 'Awaiting response')}
                         </td>
                         <td class="py-3 text-right">
                           <button onclick="loadProspectIntoSim('${escapeHtml(p.email)}')" class="px-2.5 py-1 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-amber-400 border border-amber-500/30 text-[11px] font-bold transition">
                             Triage Re:
                           </button>
                         </td>
                       </tr>
                     `;
                     })
                     .join('')}
                 </tbody>
               </table>
             </div>`
      }
    </div>
  `;

  const extraScripts = `
    <script>
      let currentTriagedEmail = '';
      let currentSuggestedReply = '';

      const presets = {
        positive: "Yeah sure, send over that test line. Would love to hear how it handles our after-hours calls.",
        price: "How much does this cost per month? Just email me the pricing.",
        staff: "We already have front desk receptionists who answer our phones during the day.",
        robot: "Does this sound like an obvious robot? Patients hate robotic answering machines.",
        unsub: "Please remove me from your email list, not interested."
      };

      function toggleWebhookHelp() {
        const card = document.getElementById('webhookSpecCard');
        if (card) card.classList.toggle('hidden');
      }

      function loadPreset(key) {
        document.getElementById('simText').value = presets[key] || '';
      }

      function loadProspectIntoSim(email) {
        const sel = document.getElementById('simEmail');
        if (sel) {
          sel.value = email;
          showToast('Prospect Loaded', 'Pre-selected ' + email + ' for inbox triage.', 'info');
        }
      }

      async function runSimulation() {
        const email = document.getElementById('simEmail').value;
        const text = document.getElementById('simText').value.trim();
        if (!text) return alert('Please enter or select reply text to simulate.');

        currentTriagedEmail = email;
        const btn = document.getElementById('btnSimulate');
        const box = document.getElementById('resultBox');
        const actionHub = document.getElementById('laarcActionHub');
        const timingBadge = document.getElementById('triageTimingBadge');

        btn.disabled = true;
        btn.innerText = 'Analyzing & Executing...';
        actionHub.classList.add('hidden');

        const startTime = Date.now();

        try {
          const res = await fetch(getAuthUrl('/inbox/test-triage'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ email, text })
          });
          const data = await res.json();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Process Reply Through Triage</span>';
          if (timingBadge) timingBadge.innerText = 'Latency: ' + elapsed + 's';

          if (data.status === 'success') {
            currentSuggestedReply = data.suggestedReply || '';

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
                <ul class="list-disc list-inside text-[var(--text-secondary)] mt-1 space-y-0.5 font-mono text-[11px]">
                  \${data.actionsTaken.map(a => \`<li>\${a}</li>\`).join('')}
                </ul>
              </div>
              <div class="border-t border-[var(--border-subtle)] pt-2 space-y-1.5">
                <div class="flex items-center justify-between">
                  <div class="text-[11px] text-[var(--accent-emerald)] font-mono uppercase font-bold">Suggested LAARC Reply (/harvey-sales):</div>
                  <button onclick="copyToClipboard(document.getElementById('editableLaarcDraft').value, 'LAARC reply copied!')" class="text-[10px] text-cyan-400 hover:underline font-mono">
                    Copy Text
                  </button>
                </div>
                <textarea id="editableLaarcDraft" rows="5" class="w-full p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-amber-500">\${data.suggestedReply || ''}</textarea>
              </div>
            \`;

            actionHub.classList.remove('hidden');
            showToast('Triage Complete', data.classification.bucket + ' • Sequence Updated', 'success');
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

      async function dispatchLaarcReply(isTest) {
        const text = document.getElementById('editableLaarcDraft') ? document.getElementById('editableLaarcDraft').value.trim() : currentSuggestedReply;
        const to = currentTriagedEmail || document.getElementById('simEmail').value;

        if (!text) return alert('No reply text to dispatch.');
        if (!isTest && !confirm('Are you sure you want to send this reply LIVE to ' + to + '?')) return;

        const btn = isTest ? document.getElementById('btnTestReply') : document.getElementById('btnLiveReply');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Dispatching...</span>';

        try {
          const res = await fetch(getAuthUrl('/inbox/send-reply'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              to,
              subject: 'Re: quick question',
              text,
              isTest
            })
          });

          const data = await res.json();
          btn.disabled = false;
          btn.innerHTML = origText;

          if (data.status === 'success' || data.success) {
            showToast('Reply Dispatched!', (isTest ? 'Demo sent to ' : 'Live sent to ') + data.recipient, 'success');
          } else {
            showToast('Dispatch Note', data.message || 'Email processed.', 'warning');
          }
        } catch (e) {
          btn.disabled = false;
          btn.innerHTML = origText;
          showToast('Dispatch Failed', e.message, 'error');
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
      badgeText: `Pillar 5 • ${repliedProspects.length} Active Convos`,
      bodyContent,
      extraScripts,
      authKeyParam: authKey,
    })
  );
});
