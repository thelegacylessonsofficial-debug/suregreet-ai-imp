import { getSvgIcon } from './saasLayout.js';

/**
 * Returns the interactive HTML for the 4 Lead Bots Control Hub
 */
export function renderLeadBotsHubHtml() {
  return `
  <section id="leadBotsControlHub" class="space-y-6">
    <!-- Hub Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-[var(--text-primary)] tracking-tight">SureGreet AI — Lead Bots Control Hub</h2>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">4 Live Bots</span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-1">Autonomous 24/7 AI Voice, 30s Speed-to-Lead Callback, Calendar-First Booking, and Inbox LAARC Closer engines.</p>
      </div>

      <div class="flex items-center gap-2">
        <a href="/demo-medspa" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition">
          ${getSvgIcon('external', 'w-3.5 h-3.5 text-cyan-400')}
          <span>Open MedSpa Web Demo</span>
        </a>
      </div>
    </div>

    <!-- 4 Bots Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- BOT 1: 24/7 Voice Receptionist (Sarah) -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm">
              ${getSvgIcon('phone', 'w-5 h-5')}
            </div>
            <div>
              <h3 class="font-bold text-sm text-[var(--text-primary)]">24/7 Inbound Voice Receptionist (Sarah)</h3>
              <p class="text-xs text-[var(--text-secondary)]">Retell AI Webhook & Cal.com Live Scheduler</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
            Live
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Agent Engine:</span>
            <span class="text-[var(--text-primary)]">Retell AI (Sarah Voice)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Webhook Route:</span>
            <span class="text-cyan-400">/webhook/retell-post-call-webhook</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Cal.com Tool Call:</span>
            <span class="text-emerald-400">Active (/retell-tool-call)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Target Response:</span>
            <span class="text-[var(--text-primary)]">&lt; 2 Rings (24/7/365)</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex gap-2">
            <a href="/demo-medspa" target="_blank" class="flex-1 py-2 rounded-xl bg-emerald-500 hover:opacity-90 text-black font-bold text-xs text-center transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/15">
              ${getSvgIcon('play', 'w-3.5 h-3.5')}
              <span>Launch Live Web Voice Simulator</span>
            </a>
            <button onclick="testRetellToolCall()" class="px-3.5 py-2 rounded-xl bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition">
              Verify Tool Call
            </button>
          </div>
          <div id="retellToolOutput" class="hidden p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar"></div>
        </div>
      </div>

      <!-- BOT 2: Instant 30-Second Lead Callback Bot -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm">
              ${getSvgIcon('bolt', 'w-5 h-5')}
            </div>
            <div>
              <h3 class="font-bold text-sm text-[var(--text-primary)]">Instant 30s Speed-to-Lead Callback Bot</h3>
              <p class="text-xs text-[var(--text-secondary)]">Triggers outbound AI call upon website form intake</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot"></span>
            Armed
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Intake Route:</span>
            <span class="text-cyan-400">POST /webhook/suregreet-lead-callback</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Honeypot Shield:</span>
            <span class="text-emerald-400">Active (Spambot Rejection)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">HubSpot & Slack Sync:</span>
            <span class="text-[var(--text-primary)]">Instant Push</span>
          </div>
        </div>

        <!-- Interactive 30s Callback Test Form -->
        <div class="space-y-2.5">
          <div class="grid grid-cols-2 gap-2">
            <input type="text" id="testCallbackName" placeholder="Lead Name" value="Dr. Carlos Riveros" class="bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs rounded-xl px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">
            <input type="text" id="testCallbackPhone" placeholder="+1 (US Phone E.164)" value="+13053567402" class="bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs rounded-xl px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-cyan-500">
          </div>
          <div class="flex gap-2">
            <select id="testCallbackIndustry" class="w-1/2 bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs rounded-xl px-3 py-2 text-[var(--text-primary)]">
              <option value="Aesthetic Medical Spa">Aesthetic MedSpa</option>
              <option value="Emergency HVAC Contractor">Emergency HVAC</option>
            </select>
            <button onclick="dispatchTestLeadCallback()" class="flex-1 py-2 rounded-xl bg-cyan-500 hover:opacity-90 text-black font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/15">
              ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
              <span>Dispatch 30s Callback</span>
            </button>
          </div>
          <div id="callbackOutput" class="hidden p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar"></div>
        </div>
      </div>

      <!-- BOT 3: Calendar-First Smart Booking Widget -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-sm">
              ${getSvgIcon('pipeline', 'w-5 h-5')}
            </div>
            <div>
              <h3 class="font-bold text-sm text-[var(--text-primary)]">Calendar-First Smart Booking Widget</h3>
              <p class="text-xs text-[var(--text-secondary)]">Zero-friction slot lock with 24h & 1h reminder engines</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 pulse-dot"></span>
            Cron Active
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">API Endpoint:</span>
            <span class="text-indigo-400">POST /api/booking/calendar-first</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Cal.com Webhook:</span>
            <span class="text-emerald-400">POST /webhook/calcom-booking-webhook</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Auto-Freeze Outreach:</span>
            <span class="text-emerald-400">Instant on Booking Lock</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <button onclick="testBookingCron('24h')" class="py-2 px-3 rounded-xl bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition text-center">
              Test 24h Reminder Cron
            </button>
            <button onclick="testBookingCron('1h')" class="py-2 px-3 rounded-xl bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition text-center">
              Test 1h Urgent Reminder
            </button>
          </div>
          <div id="bookingCronOutput" class="hidden p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar"></div>
        </div>
      </div>

      <!-- BOT 4: Autonomous Inbox Triage & LAARC Closer -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm">
              ${getSvgIcon('inbox', 'w-5 h-5')}
            </div>
            <div>
              <h3 class="font-bold text-sm text-[var(--text-primary)]">Autonomous Inbox Triage & LAARC Closer</h3>
              <p class="text-xs text-[var(--text-secondary)]">Objection classification & tailored Cal.com closer drafting</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot"></span>
            Triage Ready
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Inbound Reply Webhook:</span>
            <span class="text-amber-400">POST /webhook/inbox-reply</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Methodology:</span>
            <span class="text-[var(--text-primary)]">LAARC (Listen, Acknowledge, Assess, Respond, Close)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Telegram Bot Alert:</span>
            <span class="text-emerald-400">Instant VIP Notification</span>
          </div>
        </div>

        <!-- Interactive Objection Tester -->
        <div class="space-y-2.5">
          <div class="flex gap-1.5 overflow-x-auto text-[11px] pb-1">
            <button onclick="setObjectionPreset('pricing')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap">"How much does it cost?"</button>
            <button onclick="setObjectionPreset('agency')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap">"We have an agency"</button>
            <button onclick="setObjectionPreset('interested')" class="px-2.5 py-1 rounded-lg bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap">"Send me a demo"</button>
          </div>
          <textarea id="triageReplyText" rows="2" placeholder="Paste incoming prospect email or objection..." class="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] text-xs rounded-xl p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-amber-500">We already have someone handling our front desk, but what are your rates?</textarea>
          <div class="flex gap-2">
            <button onclick="runTriageSimulation()" class="flex-1 py-2 rounded-xl bg-amber-500 hover:opacity-90 text-black font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/15">
              ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
              <span>Classify Sentiment & Draft LAARC Reply</span>
            </button>
            <a href="/inbox/dashboard" class="px-3 py-2 rounded-xl bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition text-center">
              Full Inbox
            </a>
          </div>
          <div id="triageOutput" class="hidden p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar"></div>
        </div>
      </div>

    </div>
  </section>

  <script>
    // Lead Bots Interactive Scripts
    async function testRetellToolCall() {
      const out = document.getElementById('retellToolOutput');
      out.classList.remove('hidden');
      out.innerText = 'Testing Retell tool call (/webhook/retell-tool-call)...';
      try {
        const res = await fetch('/webhook/retell-tool-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'check_available_slots',
            args: { date: new Date().toISOString().split('T')[0] }
          })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
        showToast('Tool Call Verified', 'Retell tool-call webhook responded successfully.', 'success');
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
        showToast('Tool Call Failed', e.message, 'error');
      }
    }

    async function dispatchTestLeadCallback() {
      const out = document.getElementById('callbackOutput');
      const name = document.getElementById('testCallbackName').value.trim();
      const phone = document.getElementById('testCallbackPhone').value.trim();
      const industry = document.getElementById('testCallbackIndustry').value;

      if (!phone.startsWith('+')) {
        alert('Please enter a valid E.164 phone number starting with "+" (e.g. +13053567402)');
        return;
      }

      out.classList.remove('hidden');
      out.innerText = 'Dispatching Retell outbound AI callback to ' + phone + '...';

      try {
        const res = await fetch('/webhook/suregreet-lead-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: name,
            phone_e164: phone,
            industry: industry,
            company_website_fax: '', // honeypot left blank
            bottleneck_notes: 'Interactive test from SureGreet AI Lead Bots Control Hub'
          })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
        if (res.ok) {
          showToast('Callback Dispatched', 'Outbound AI voice call triggered for ' + name, 'success');
        } else {
          showToast('Dispatch Error', data.message || 'Call failed', 'error');
        }
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
        showToast('Dispatch Failed', e.message, 'error');
      }
    }

    async function testBookingCron(type) {
      const out = document.getElementById('bookingCronOutput');
      out.classList.remove('hidden');
      const endpoint = type === '24h' ? '/test/run-reminders' : '/test/run-hourly-reminders';
      out.innerText = 'Running ' + type + ' booking reminder diagnostic...';
      try {
        const res = await fetch(getAuthUrl(endpoint), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
        showToast('Reminder Diagnostic Ran', type + ' reminder cycle checked.', 'success');
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
        showToast('Diagnostic Error', e.message, 'error');
      }
    }

    function setObjectionPreset(type) {
      const txt = document.getElementById('triageReplyText');
      if (type === 'pricing') {
        txt.value = "Sounds interesting, but how much does your AI receptionist cost per month?";
      } else if (type === 'agency') {
        txt.value = "We already have an agency running our marketing and a receptionist at our Miami clinic.";
      } else if (type === 'interested') {
        txt.value = "Hey Archit, can you send over a 30 second audio demo of how it works for a MedSpa?";
      }
    }

    async function runTriageSimulation() {
      const out = document.getElementById('triageOutput');
      const text = document.getElementById('triageReplyText').value.trim();
      if (!text) return;

      out.classList.remove('hidden');
      out.innerText = 'Analyzing reply sentiment and drafting LAARC response...';

      try {
        const res = await fetch(getAuthUrl('/inbox/test-triage'), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            email: 'coralgables@medaestheticsmiami.com',
            text: text
          })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
        showToast('Triage Complete', 'LAARC objection response drafted.', 'success');
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
        showToast('Triage Error', e.message, 'error');
      }
    }
  </script>
  `;
}
