import { getSvgIcon } from './saasLayout.js';

/**
 * Returns the interactive HTML for the 4 Lead Bots Control Hub
 */
export function renderLeadBotsHubHtml(keyQuery = '') {
  return `
  <section id="leadBotsControlHub" class="space-y-6">
    <!-- Hub Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-[var(--text-primary)] tracking-tight">SureGreet AI — Agency Operator Command Center</h2>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">4 Hired Operators Active</span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-1">
          Autonomous Agency Team Roster: Lead Sourcing Hunter • Harvey Outbound Campaigner • 24/7 Voice Setter • Inbound LAARC Closer.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <a href="/demo-medspa" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition">
          ${getSvgIcon('external', 'w-3.5 h-3.5 text-cyan-400')}
          <span>Open MedSpa Web Demo</span>
        </a>
      </div>
    </div>

    <!-- 4 Operators Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- OPERATOR 1: Lead Sourcing & Diagnostic Auditor -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm font-bold text-xs font-mono">
              OP-1
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-[var(--text-primary)]">The Lead Sourcing Operator</h3>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/20">Lead Hunter</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)]">Autonomous Business Extraction & Jina AI Friction Diagnostics</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
            Sourcing Active
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Engine & Protocol:</span>
            <span class="text-[var(--text-primary)]">DuckDuckGo + Jina AI Reader (r.jina.ai)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Target Metros:</span>
            <span class="text-cyan-400">Miami, Dallas, Phoenix, Austin, Atlanta</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Cost Structure:</span>
            <span class="text-emerald-400">$0 / Month • Zero Scraper Subscriptions</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Daily KPI:</span>
            <span class="text-[var(--text-primary)]">50–100 Qualified Leads / Day</span>
          </div>
        </div>

        <div class="flex gap-2">
          <a href="/scraper/dashboard${keyQuery}" class="flex-1 py-2 rounded-xl bg-cyan-500 hover:opacity-90 text-black font-bold text-xs text-center transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/15">
            ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
            <span>Open Autonomous Lead Hunter</span>
          </a>
        </div>
      </div>

      <!-- OPERATOR 2: Outbound Email Specialist (The Harvey Outreach Engine) -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-sm font-bold text-xs font-mono">
              OP-2
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-[var(--text-primary)]">The Outbound Campaign Operator</h3>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-semibold border border-purple-500/20">Harvey Engine</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)]">Multi-Touch RFC Sequence & Revenue Leak Math</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 pulse-dot"></span>
            Queue Armed
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Copy Frameworks:</span>
            <span class="text-[var(--text-primary)]">PAS, QVC, BAB (Napkin Math), Bump, Breakup</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Anti-AI Gate:</span>
            <span class="text-emerald-400">Strictly &lt; 65 Words • 0 Em-Dashes • 0 Clichés</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Sending Hours:</span>
            <span class="text-purple-300">Mon–Fri 9:00 AM – 4:30 PM EST</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Sequence Timing:</span>
            <span class="text-[var(--text-primary)]">Day 1 → +2 Biz Days → +3 Biz Days → +3 Biz Days</span>
          </div>
        </div>

        <div class="flex gap-2">
          <a href="/outreach/preview${keyQuery}" class="flex-1 py-2 rounded-xl bg-purple-500 hover:opacity-90 text-white font-bold text-xs text-center transition flex items-center justify-center gap-1.5 shadow-md shadow-purple-500/15">
            ${getSvgIcon('mail', 'w-3.5 h-3.5')}
            <span>Open 4-Step Script Studio</span>
          </a>
        </div>
      </div>

      <!-- OPERATOR 3: 24/7 Voice Setter & Speed-to-Lead Specialist -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm font-bold text-xs font-mono">
              OP-3
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-[var(--text-primary)]">The Voice & Phone Setter Operator</h3>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20">Sarah Voice</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)]">Retell AI Inbound Receptionist & 30s Callback Dispatcher</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
            Voice Live
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Voice Engine:</span>
            <span class="text-[var(--text-primary)]">Retell AI (Sarah Voice Model)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Calendar Sync:</span>
            <span class="text-emerald-400">Cal.com Tool Call Active (/retell-tool-call)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Answer Cadence:</span>
            <span class="text-[var(--text-primary)]">&lt; 2 Rings (24/7/365 Coverage)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Callback Speed:</span>
            <span class="text-cyan-400">&lt; 30 Seconds Post Form Fill</span>
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

      <!-- OPERATOR 4: Chief of Inbox Triage & Closer (LAARC Methodology) -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm font-bold text-xs font-mono">
              OP-4
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-[var(--text-primary)]">The Deal Closer & Triage Operator</h3>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20">LAARC Closer</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)]">Sentiment Classification & Objection Rebuttals</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot"></span>
            Triage Ready
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-[var(--bg-card-subtle)] border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Methodology:</span>
            <span class="text-[var(--text-primary)]">LAARC (Listen, Acknowledge, Assess, Respond, Close)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Telegram Bot Alert:</span>
            <span class="text-emerald-400">Instant VIP Notification</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Reply Cadence:</span>
            <span class="text-[var(--text-primary)]">&lt; 5 Minutes from Inbound Reply</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[var(--text-muted)]">Conversion Target:</span>
            <span class="text-amber-400">45%+ Objection to Discovery Booking</span>
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
            <a href="/inbox/dashboard${keyQuery}" class="px-3 py-2 rounded-xl bg-[var(--bg-card-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition text-center">
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
