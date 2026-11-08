import { Router } from 'express';
import {
  getProspects,
  getProspectById,
  addProspect,
  sendOutreachStep,
  activateProspect,
  markProspectReplied,
  unsubscribeProspect,
  getDueProspects,
  renderStepContent,
} from '../services/outreachService.js';
import { runOutreachQueueWorker, isWithinSendingWindow } from '../cron/outreachCron.js';

export const outreachRouter = Router();

function renderProspectsHtml(list) {
  const total = list.length;
  const pendingCount = list.filter((p) => p.status === 'pending').length;
  const activeCount = list.filter((p) => p.status === 'active').length;
  const repliedCount = list.filter((p) => p.status === 'replied').length;
  const completedCount = list.filter((p) => p.status === 'completed').length;

  const prospectsJson = JSON.stringify(list).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SureGreet AI — Outreach Pipeline & Clinic Lead Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }
    .pulse-dot { animation: pulse-dot 2s infinite ease-in-out; }
    body { background-color: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-6 lg:p-10">
  <div class="max-w-7xl mx-auto space-y-6">

    <!-- Top Navigation Bar -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
      <div class="flex items-center space-x-3">
        <div class="w-11 h-11 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl shadow-lg shadow-blue-500/5">
          ⚡
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-lg sm:text-xl font-bold tracking-tight text-white">SureGreet AI • Outbound Pipeline</h1>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 pulse-dot"></span>
              Live Supabase DB
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">High-Ticket US Aesthetic Clinics • Speed-to-Lead Audits • MIME Threaded Engine</p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <a href="/scraper/dashboard" class="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-sm">
          <span>+</span>
          <span>Scout More Clinics</span>
        </a>
        <a href="/outreach/prospects?format=json" target="_blank" class="px-3 py-2 text-xs font-medium bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-lg transition">
          Raw API JSON ↗
        </a>
      </div>
    </div>

    <!-- Executive KPI Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      <div class="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Scouted</div>
        <div class="text-2xl font-bold text-white tracking-tight">${total}</div>
        <div class="text-[11px] text-gray-500">Qualified MedSpas</div>
      </div>

      <div class="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
          <span>Pending (On Hold)</span>
          <span>🔒</span>
        </div>
        <div class="text-2xl font-bold text-amber-300 tracking-tight">${pendingCount}</div>
        <div class="text-[11px] text-amber-400/80">Safety Active • Not Sent</div>
      </div>

      <div class="bg-blue-950/20 border border-blue-500/20 rounded-xl p-4 space-y-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Active In Queue</div>
        <div class="text-2xl font-bold text-blue-300 tracking-tight">${activeCount}</div>
        <div class="text-[11px] text-blue-400/80">Cron Managed</div>
      </div>

      <div class="bg-purple-950/20 border border-purple-500/20 rounded-xl p-4 space-y-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-purple-400">Replied / Hot</div>
        <div class="text-2xl font-bold text-purple-300 tracking-tight">${repliedCount}</div>
        <div class="text-[11px] text-purple-400/80">Ready for Discovery</div>
      </div>

      <div class="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-1 col-span-2 lg:col-span-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sending Hours</div>
        <div class="text-sm font-semibold text-emerald-400 mt-1">9 AM – 4:30 PM EST</div>
        <div class="text-[11px] text-gray-500">Weekdays (Anti-Spam)</div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
      <div class="flex items-center gap-1.5 overflow-x-auto text-xs">
        <button onclick="filterStatus('all')" id="tab-all" class="filter-tab px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold transition">
          All (${total})
        </button>
        <button onclick="filterStatus('pending')" id="tab-pending" class="filter-tab px-3 py-1.5 rounded-lg bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Pending (${pendingCount})
        </button>
        <button onclick="filterStatus('active')" id="tab-active" class="filter-tab px-3 py-1.5 rounded-lg bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Active (${activeCount})
        </button>
        <button onclick="filterStatus('replied')" id="tab-replied" class="filter-tab px-3 py-1.5 rounded-lg bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Replied (${repliedCount})
        </button>
        <button onclick="filterStatus('completed')" id="tab-completed" class="filter-tab px-3 py-1.5 rounded-lg bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Completed (${completedCount})
        </button>
      </div>

      <div class="relative">
        <input 
          id="searchInput"
          type="text" 
          placeholder="Filter by doctor, clinic, city, or procedure..."
          oninput="applySearch()"
          class="w-full sm:w-80 bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>

    <!-- Pipeline Table -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="text-[11px] uppercase tracking-wider text-gray-400 bg-gray-950/80 border-b border-gray-800">
            <tr>
              <th class="py-3 px-4 font-semibold">Clinic & Location</th>
              <th class="py-3 px-4 font-semibold">Medical Director / Doctor</th>
              <th class="py-3 px-4 font-semibold">Contact Email</th>
              <th class="py-3 px-4 font-semibold">Target Procedure</th>
              <th class="py-3 px-4 font-semibold text-center">Sequence Progress</th>
              <th class="py-3 px-4 font-semibold text-center">Status</th>
              <th class="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="prospectsTableBody" class="divide-y divide-gray-800 text-gray-300">
            ${list
              .map((p, idx) => {
                const initials = (p.doctor_name || p.clinic_name || 'Dr')
                  .replace(/Dr\.?\s*/i, '')
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                let statusBadge = '';
                if (p.status === 'pending') {
                  statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    <span>🔒</span> Pending (On Hold)
                  </span>`;
                } else if (p.status === 'active') {
                  statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span> Active (In Queue)
                  </span>`;
                } else if (p.status === 'replied') {
                  statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    <span>🎯</span> Replied
                  </span>`;
                } else if (p.status === 'completed') {
                  statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                    Completed (4/4)
                  </span>`;
                } else {
                  statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-400">
                    ${p.status}
                  </span>`;
                }

                // Step progress pills (1, 2, 3, 4)
                const current = p.current_step || 0;
                const stepDots = [1, 2, 3, 4]
                  .map((s) => {
                    if (s <= current) {
                      return `<span class="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shadow-sm" title="Step ${s} Sent">✓</span>`;
                    } else if (s === current + 1 && p.status === 'active') {
                      return `<span class="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400 text-blue-300 font-semibold flex items-center justify-center text-[10px]" title="Step ${s} Next Due">${s}</span>`;
                    } else {
                      return `<span class="w-5 h-5 rounded-full bg-gray-800 text-gray-500 font-medium flex items-center justify-center text-[10px]" title="Step ${s}">${s}</span>`;
                    }
                  })
                  .join('<span class="text-gray-700 text-[10px]">―</span>');

                return `
                <tr class="hover:bg-gray-800/40 transition prospect-row" data-status="${p.status}" data-search="${(p.clinic_name + ' ' + p.doctor_name + ' ' + p.city + ' ' + p.treatment + ' ' + p.email).toLowerCase()}">
                  <td class="py-3 px-4">
                    <div class="font-bold text-white text-sm">${p.clinic_name || 'N/A'}</div>
                    <div class="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <span class="text-red-400">📍</span> ${p.city || 'United States'}
                    </div>
                  </td>

                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <div class="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-blue-400">
                        ${initials}
                      </div>
                      <div class="font-medium text-white">${p.doctor_name || 'Medical Director'}</div>
                    </div>
                  </td>

                  <td class="py-3 px-4">
                    <a href="mailto:${p.email}" class="font-mono text-blue-400 hover:underline text-xs">${p.email}</a>
                  </td>

                  <td class="py-3 px-4">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-900/30 text-blue-300 border border-blue-800/40">
                      ${p.treatment || 'Morpheus8'}
                    </span>
                  </td>

                  <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                      ${stepDots}
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">Step ${current}/4</div>
                  </td>

                  <td class="py-3 px-4 text-center">
                    ${statusBadge}
                  </td>

                  <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button 
                      onclick="openPreview('${p.id}')"
                      class="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-medium transition"
                      title="Preview personalized cold email"
                    >
                      👁️ Preview
                    </button>
                    ${
                      p.status === 'pending'
                        ? `<button 
                            onclick="confirmActivate('${p.id}', '${escapeQuotes(p.doctor_name)}', '${escapeQuotes(p.clinic_name)}')"
                            class="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition"
                          >
                            ⚡ Activate
                          </button>`
                        : ''
                    }
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      ${
        list.length === 0
          ? `<div class="p-10 text-center text-gray-500 text-xs">
              No prospects found in database. <a href="/scraper/dashboard" class="text-blue-400 underline">Scout clinics now</a>.
            </div>`
          : ''
      }
    </div>

    <!-- Live Queue Protection Notice -->
    <div class="bg-gray-900/40 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <span class="text-amber-400 font-semibold">🛡️ Safety Sentinel Active:</span>
        <span>Prospects in <strong>Pending</strong> will never receive emails until you manually click "Activate".</span>
      </div>
      <div class="text-gray-500 font-mono text-[11px]">
        Engine: RFC 5322 MIME Threading • 30s–90s Randomized Jitter
      </div>
    </div>

  </div>

  <!-- Email Preview Modal -->
  <div id="previewModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
    <div class="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-start justify-between border-b border-gray-800 pb-3">
        <div>
          <h3 id="modalTitle" class="text-sm font-bold text-white">Preview Step 1 Email Audit</h3>
          <p id="modalRecipient" class="text-xs text-gray-400 font-mono mt-0.5">To: doctor@clinic.com</p>
        </div>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
      </div>

      <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-3 text-xs">
        <div class="text-gray-400 font-mono border-b border-gray-800 pb-2">
          <strong>Subject:</strong> <span id="modalSubject" class="text-blue-400"></span>
        </div>
        <div id="modalBody" class="font-mono text-gray-200 leading-relaxed whitespace-pre-line py-1"></div>
        <div class="text-[11px] text-gray-500 border-t border-gray-800 pt-2 font-mono">
          --<br>
          If you'd rather not receive these clinic audits, opt out here: https://suregreet-automation.onrender.com/outreach/unsubscribe?email=...
        </div>
      </div>

      <div class="flex justify-between items-center pt-2">
        <span class="text-[11px] text-gray-500 font-mono">Format: Minimalist Plain-Text (Anti-Spam)</span>
        <button onclick="closeModal()" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold">
          Close Preview
        </button>
      </div>
    </div>
  </div>

  <script>
    const prospects = ${prospectsJson};

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function openPreview(id) {
      const p = prospects.find(item => item.id === id);
      if (!p) return;

      const clinic = p.clinic_name || 'your clinic';
      const dr = p.doctor_name || 'Doctor';
      const treat = p.treatment || 'Morpheus8';
      const city = p.city ? ' in ' + p.city : '';

      document.getElementById('modalTitle').innerText = 'Step 1: 75-Second Speed-to-Lead Audit';
      document.getElementById('modalRecipient').innerText = 'To: ' + p.email + ' (' + clinic + ')';
      document.getElementById('modalSubject').innerText = 'quick question - ' + clinic + ' inquiries';

      const bodyText = 'Hey ' + dr + ',\n\n' +
        'I submitted a test inquiry on your ' + treat + ' page' + city + ' yesterday evening after hours.\n\n' +
        'Your front desk was closed for the night, but industry data shows 78% of high-intent aesthetic patients book with whichever clinic calls or texts them back in under 5 minutes.\n\n' +
        'I recorded a 75-second video showing how SureGreet AI calls back after-hours ad leads in under 30 seconds, answers pricing questions, and collects booking deposits directly into your calendar:\n\n' +
        'https://suregreet.ai\n\n' +
        'Open to me sending over the full speed-to-lead audit for ' + clinic + '?\n\n' +
        'Best,\nArchit\nFounder, SureGreet AI\nhttps://suregreet.ai';

      document.getElementById('modalBody').innerText = bodyText;
      document.getElementById('previewModal').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('previewModal').classList.add('hidden');
    }

    async function confirmActivate(id, drName, clinicName) {
      const ok = confirm('Activate cold outreach for ' + drName + ' at ' + clinicName + '?\\n\\nThis will dispatch Step 1 and schedule follow-ups inside US business hours.');
      if (!ok) return;

      try {
        const res = await fetch('/outreach/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: id })
        });
        const data = await res.json();
        if (data.status === 'success') {
          alert('✅ Activated! Step 1 dispatched to ' + drName + '.');
          window.location.reload();
        } else {
          alert('Error: ' + (data.error || 'Failed to activate'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    }

    function filterStatus(status) {
      document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('bg-blue-600', 'text-white');
        tab.classList.add('bg-gray-950', 'text-gray-400');
      });
      const activeTab = document.getElementById('tab-' + status);
      if (activeTab) {
        activeTab.classList.remove('bg-gray-950', 'text-gray-400');
        activeTab.classList.add('bg-blue-600', 'text-white');
      }

      const rows = document.querySelectorAll('.prospect-row');
      rows.forEach(row => {
        if (status === 'all' || row.getAttribute('data-status') === status) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }

    function applySearch() {
      const query = document.getElementById('searchInput').value.toLowerCase().trim();
      const rows = document.querySelectorAll('.prospect-row');
      rows.forEach(row => {
        const text = row.getAttribute('data-search') || '';
        if (!query || text.includes(query)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// 1. List all prospects from Supabase (Dual mode: HTML in browser, JSON if requested)
outreachRouter.get(['/prospects', '/dashboard', '/pipeline'], async (req, res) => {
  try {
    const status = req.query.status;
    const limit = req.query.limit || 100;
    const list = await getProspects({ status, limit });

    // If API client explicitly requests JSON or ?format=json
    const wantsJson =
      req.query.format === 'json' ||
      (req.headers.accept &&
        req.headers.accept.includes('application/json') &&
        !req.headers.accept.includes('text/html'));

    if (wantsJson) {
      return res.json({
        status: 'success',
        count: list.length,
        active: list.filter((p) => p.status === 'active').length,
        pending: list.filter((p) => p.status === 'pending').length,
        replied: list.filter((p) => p.status === 'replied').length,
        unsubscribed: list.filter((p) => p.status === 'unsubscribed').length,
        completed: list.filter((p) => p.status === 'completed').length,
        prospects: list,
      });
    }

    // Default for human browser: render executive visual dashboard
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderProspectsHtml(list));
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Add a new prospect to Supabase
outreachRouter.post('/add', async (req, res) => {
  const body = req.body || {};
  if (!body.email) {
    return res.status(400).json({ status: 'error', message: 'Field "email" is required' });
  }

  const result = await addProspect({
    doctorName: body.doctorName,
    clinicName: body.clinicName,
    email: body.email,
    city: body.city,
    treatment: body.treatment,
    notes: body.notes,
  });

  res.json({ status: result.success ? 'success' : 'ignored', ...result });
});

// 3. Activate prospect (dispatches Step 1 immediately and schedules Step 2)
outreachRouter.post('/activate', async (req, res) => {
  const { prospectId, email } = req.body || {};
  const target = prospectId || email;

  if (!target) {
    return res.status(400).json({ status: 'error', message: 'prospectId or email is required' });
  }

  const result = await activateProspect(target);
  if (result.success) {
    res.json({ status: 'success', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 4. Manually dispatch a specific outreach email step (1, 2, 3, or 4)
outreachRouter.post('/send', async (req, res) => {
  const { prospectId, stepNumber } = req.body || {};

  if (!prospectId || !stepNumber) {
    return res.status(400).json({ status: 'error', message: 'prospectId and stepNumber (1-4) are required' });
  }

  const result = await sendOutreachStep({
    prospectId,
    stepNumber: Number(stepNumber),
  });

  if (result.success) {
    res.json({ status: 'success', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 5. Mark prospect as replied (stops sequence immediately + Telegram alert)
outreachRouter.post('/mark-replied', async (req, res) => {
  const { prospectId, email } = req.body || {};
  const target = prospectId || email;

  if (!target) {
    return res.status(400).json({ status: 'error', message: 'prospectId or email is required' });
  }

  const result = await markProspectReplied(target);
  if (result.success) {
    res.json({ status: 'success', message: 'Prospect marked as replied. Sequence stopped.', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 6. View due prospects
outreachRouter.get('/due', async (req, res) => {
  try {
    const list = await getDueProspects(20);
    res.json({
      status: 'success',
      inSendingWindow: isWithinSendingWindow(),
      count: list.length,
      prospects: list,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7. Trigger the automated queue worker manually
outreachRouter.all('/run-queue', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await runOutreachQueueWorker({ force });
    res.json({ status: 'success', result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 8. Preview email step in browser before sending
outreachRouter.get('/preview', (req, res) => {
  const step = Number(req.query.step || 1);
  const sample = {
    doctor_name: req.query.doctorName || 'Dr. Robert Miller',
    clinic_name: req.query.clinicName || 'Aura MedSpa & Aesthetics',
    city: req.query.city || 'Dallas, TX',
    treatment: req.query.treatment || 'Morpheus8 & Injectables',
    email: req.query.email || 'lead@example.com',
    original_subject: req.query.originalSubject || 'quick question - Aura MedSpa & Aesthetics inquiries',
  };

  try {
    const rendered = renderStepContent(step, sample);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="background:#0f172a;color:#f8fafc;padding:14px 24px;font-family:sans-serif;font-size:13px;border-bottom:2px solid #38bdf8;">
        <strong>Subject:</strong> ${rendered.subject} &nbsp;|&nbsp; <strong>Step:</strong> ${step}/4 &nbsp;|&nbsp; <strong>Minimalist Mode</strong>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        ${rendered.html}
      </div>
      <div style="background:#f1f5f9;border-top:1px solid #cbd5e1;padding:16px 24px;font-family:monospace;font-size:12px;color:#334155;">
        <strong>Plain Text Representation (Primary):</strong>
        <pre style="white-space: pre-wrap; margin-top: 8px;">${rendered.text}</pre>
      </div>
    `);
  } catch (err) {
    res.status(400).send(`Error: ${err.message}`);
  }
});

// 9. CAN-SPAM 1-Click Unsubscribe link
outreachRouter.get('/unsubscribe', async (req, res) => {
  const email = req.query.email;
  if (email) {
    await unsubscribeProspect(email);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Unsubscribed — SureGreet AI</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:80vh;background:#f8fafc;color:#1e293b;margin:0;">
      <div style="text-align:center;background:#ffffff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);max-width:480px;">
        <h2 style="color:#0f172a;margin-top:0;">You have been unsubscribed</h2>
        <p style="color:#64748b;line-height:1.6;">${email ? `<strong>${email}</strong> has been removed from all SureGreet AI outreach sequences.` : 'Your email has been safely removed.'}</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">SureGreet AI • 24/7 AI Voice & Lead Capture</p>
      </div>
    </body>
    </html>
  `);
});
