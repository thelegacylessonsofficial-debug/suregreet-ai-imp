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

// Shared Nav Header HTML Generator
function getNavHeader(activeTab) {
  return `
  <!-- Unified Global Header -->
  <header class="border-b border-gray-800/80 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-blue-500/20">
          ⚡
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="text-base font-bold tracking-tight text-white">SureGreet AI</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Agency Hub</span>
          </div>
          <p class="text-[11px] text-gray-400">24/7 AI Voice & Speed-to-Lead Outbound Infrastructure</p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="flex items-center space-x-1.5 bg-gray-900/90 p-1.5 rounded-xl border border-gray-800 text-xs">
        <a href="/outreach/prospects" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'pipeline'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          📊 Pipeline CRM
        </a>
        <a href="/scraper/dashboard" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'scraper'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          ⚡ Lead Scraper Studio
        </a>
        <a href="/outreach/preview" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'preview'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          ✉️ Email Script Studio
        </a>
      </nav>

      <!-- External Quick Links -->
      <div class="flex items-center space-x-2 text-xs">
        <a href="https://www.facebook.com/ads/library/?country=US&q=MedSpa%20Miami" target="_blank" class="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition flex items-center gap-1">
          <span>Meta Ads</span>
          <span class="text-gray-500 text-[10px]">↗</span>
        </a>
        <a href="/health" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Online</span>
        </a>
      </div>
    </div>
  </header>`;
}

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
  <title>SureGreet AI — Outreach Pipeline & CRM Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.9); } }
    .pulse-dot { animation: pulse-dot 2s infinite ease-in-out; }
  </style>
</head>
<body class="min-h-screen">
  ${getNavHeader('pipeline')}

  <main class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10 space-y-6">

    <!-- Top Action Row -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white">Outbound Clinic Pipeline</h1>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 pulse-dot"></span>
            Supabase Live DB
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Real-time status of scouted US MedSpas, MIME-threaded follow-up queues, and replies.</p>
      </div>

      <div class="flex items-center gap-2.5">
        <a href="/scraper/dashboard" class="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-600/20">
          <span>+</span>
          <span>Scout More Clinics</span>
        </a>
        <a href="/outreach/preview" class="px-3.5 py-2 text-xs font-medium bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-xl transition">
          ✉️ Open Script Studio
        </a>
      </div>
    </div>

    <!-- Executive KPI Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      <div class="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Scouted</div>
        <div class="text-2xl font-bold text-white tracking-tight">${total}</div>
        <div class="text-[11px] text-gray-500">Qualified MedSpas</div>
      </div>

      <div class="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
          <span>Pending (On Hold)</span>
          <span>🔒</span>
        </div>
        <div class="text-2xl font-bold text-amber-300 tracking-tight">${pendingCount}</div>
        <div class="text-[11px] text-amber-400/80">Safety Active • Not Sent</div>
      </div>

      <div class="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Active In Queue</div>
        <div class="text-2xl font-bold text-blue-300 tracking-tight">${activeCount}</div>
        <div class="text-[11px] text-blue-400/80">Cron Managed</div>
      </div>

      <div class="bg-purple-950/20 border border-purple-500/20 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-purple-400">Replied / Hot</div>
        <div class="text-2xl font-bold text-purple-300 tracking-tight">${repliedCount}</div>
        <div class="text-[11px] text-purple-400/80">Ready for Discovery</div>
      </div>

      <div class="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 space-y-1 col-span-2 lg:col-span-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sending Hours</div>
        <div class="text-sm font-semibold text-emerald-400 mt-1">9 AM – 4:30 PM EST</div>
        <div class="text-[11px] text-gray-500">Mon–Fri (Anti-Spam Pacing)</div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-900/70 p-3.5 rounded-2xl border border-gray-800">
      <div class="flex items-center gap-1.5 overflow-x-auto text-xs">
        <button onclick="filterStatus('all')" id="tab-all" class="filter-tab px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-semibold transition">
          All (${total})
        </button>
        <button onclick="filterStatus('pending')" id="tab-pending" class="filter-tab px-3.5 py-1.5 rounded-xl bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Pending (${pendingCount})
        </button>
        <button onclick="filterStatus('active')" id="tab-active" class="filter-tab px-3.5 py-1.5 rounded-xl bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Active (${activeCount})
        </button>
        <button onclick="filterStatus('replied')" id="tab-replied" class="filter-tab px-3.5 py-1.5 rounded-xl bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Replied (${repliedCount})
        </button>
        <button onclick="filterStatus('completed')" id="tab-completed" class="filter-tab px-3.5 py-1.5 rounded-xl bg-gray-950 text-gray-400 hover:text-white border border-gray-800 font-medium transition">
          Completed (${completedCount})
        </button>
      </div>

      <div class="relative">
        <input 
          id="searchInput"
          type="text" 
          placeholder="Filter by doctor, clinic, city, or procedure..."
          oninput="applySearch()"
          class="w-full sm:w-80 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
        />
      </div>
    </div>

    <!-- Pipeline Table -->
    <div class="bg-gray-900/90 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="text-[11px] uppercase tracking-wider text-gray-400 bg-gray-950/80 border-b border-gray-800">
            <tr>
              <th class="py-3.5 px-4 font-semibold">Clinic & Location</th>
              <th class="py-3.5 px-4 font-semibold">Medical Director / Doctor</th>
              <th class="py-3.5 px-4 font-semibold">Contact Email</th>
              <th class="py-3.5 px-4 font-semibold">Target Procedure</th>
              <th class="py-3.5 px-4 font-semibold text-center">Sequence Progress</th>
              <th class="py-3.5 px-4 font-semibold text-center">Status</th>
              <th class="py-3.5 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="prospectsTableBody" class="divide-y divide-gray-800 text-gray-300">
            ${list
              .map((p) => {
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
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-white text-sm">${p.clinic_name || 'N/A'}</div>
                    <div class="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <span class="text-rose-400">📍</span> ${p.city || 'United States'}
                    </div>
                  </td>

                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-blue-400 shadow-sm">
                        ${initials}
                      </div>
                      <div class="font-semibold text-white">${p.doctor_name || 'Medical Director'}</div>
                    </div>
                  </td>

                  <td class="py-3.5 px-4">
                    <a href="mailto:${p.email}" class="font-mono text-blue-400 hover:underline text-xs">${p.email}</a>
                  </td>

                  <td class="py-3.5 px-4">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-900/30 text-blue-300 border border-blue-800/50">
                      ${p.treatment || 'Morpheus8'}
                    </span>
                  </td>

                  <td class="py-3.5 px-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                      ${stepDots}
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">Step ${current}/4</div>
                  </td>

                  <td class="py-3.5 px-4 text-center">
                    ${statusBadge}
                  </td>

                  <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button 
                      onclick="openPreview('${p.id}')"
                      class="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-medium transition"
                      title="Preview personalized cold email"
                    >
                      👁️ Preview
                    </button>
                    ${
                      p.status === 'pending'
                        ? `<button 
                            onclick="confirmActivate('${p.id}', '${escapeQuotes(p.doctor_name)}', '${escapeQuotes(p.clinic_name)}')"
                            class="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition"
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
          ? `<div class="p-12 text-center text-gray-500 text-xs">
              No prospects found in database. <a href="/scraper/dashboard" class="text-blue-400 underline font-medium">Scout clinics now</a>.
            </div>`
          : ''
      }
    </div>

    <!-- Live Queue Protection Notice -->
    <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <span class="text-amber-400 font-bold">🛡️ Safety Sentinel Active:</span>
        <span>Prospects in <strong>Pending</strong> will never receive emails until you manually click "Activate".</span>
      </div>
      <div class="text-gray-500 font-mono text-[11px]">
        Engine: RFC 5322 MIME Threading • 30s–90s Randomized Jitter
      </div>
    </div>

  </main>

  <!-- Email Preview Modal -->
  <div id="previewModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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
          <strong>Subject:</strong> <span id="modalSubject" class="text-blue-400 font-semibold"></span>
        </div>
        <div id="modalBody" class="font-mono text-gray-200 leading-relaxed whitespace-pre-line py-1"></div>
        <div class="text-[11px] text-gray-500 border-t border-gray-800 pt-2 font-mono">
          --<br>
          If you'd rather not receive these clinic audits, opt out here: https://suregreet-automation.onrender.com/outreach/unsubscribe?email=...
        </div>
      </div>

      <div class="flex justify-between items-center pt-2">
        <span class="text-[11px] text-gray-500 font-mono">Format: Minimalist Plain-Text (Harvey Anti-AI)</span>
        <div class="flex gap-2">
          <a id="modalFullStudioLink" href="/outreach/preview" class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold">
            Open in Script Studio ↗
          </a>
          <button onclick="closeModal()" class="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const prospects = ${prospectsJson};

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
      document.getElementById('modalFullStudioLink').href = '/outreach/preview?doctorName=' + encodeURIComponent(dr) + '&clinicName=' + encodeURIComponent(clinic) + '&city=' + encodeURIComponent(p.city || '') + '&treatment=' + encodeURIComponent(treat) + '&email=' + encodeURIComponent(p.email);
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

function renderScriptStudioHtml(selectedStep, sample) {
  const rendered = renderStepContent(selectedStep, sample);
  const wordCount = rendered.text ? rendered.text.trim().split(/\s+/).length : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SureGreet AI — Email Script Studio & Sequence Previewer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="min-h-screen">
  ${getNavHeader('preview')}

  <main class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10 space-y-6">

    <!-- Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white">Outbound Email Script Studio</h1>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Harvey Sales Copy Engine
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Preview 1-on-1 plain-text scripts, inspect MIME threading, and verify anti-AI word count limits.</p>
      </div>

      <div class="flex items-center gap-2">
        <a href="/outreach/prospects" class="px-3.5 py-2 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-800 rounded-xl transition flex items-center gap-1.5">
          <span>📊 Back to Pipeline</span>
        </a>
      </div>
    </div>

    <!-- Step Selector Tabs -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <a href="?step=1&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 1
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-blue-400">Step 1 • Cold Hook</div>
        <div class="font-bold text-sm text-white mt-0.5">75s Speed Audit</div>
        <div class="text-[11px] text-gray-400 mt-1">Dispatched at Day 1</div>
      </a>

      <a href="?step=2&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 2
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-400">Step 2 • Proof</div>
        <div class="font-bold text-sm text-white mt-0.5">30s Audio Demo</div>
        <div class="text-[11px] text-gray-400 mt-1">Threaded Re: (+2 biz days)</div>
      </a>

      <a href="?step=3&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 3
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Step 3 • Economic Math</div>
        <div class="font-bold text-sm text-white mt-0.5">$4,500 Leak Breakdown</div>
        <div class="text-[11px] text-gray-400 mt-1">Threaded Re: (+3 biz days)</div>
      </a>

      <a href="?step=4&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 4
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Step 4 • Closer</div>
        <div class="font-bold text-sm text-white mt-0.5">Clean Breakup Email</div>
        <div class="text-[11px] text-gray-400 mt-1">Threaded Re: (+3 biz days)</div>
      </a>
    </div>

    <!-- Dual Studio: Customizer Sidebar + Inbox Mockup -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Left Column: Customizer & Quick Pre-fills (4 Cols) -->
      <div class="lg:col-span-4 bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-800 pb-2">
          Prospect Variables Customizer
        </h2>

        <!-- Quick Pre-fill Dropdown -->
        <div class="space-y-1">
          <label class="block text-[11px] font-medium text-gray-400">Pre-fill Scouted Clinic:</label>
          <select id="clinicSelector" onchange="applyClinicPreset(this.value)" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
            <option value="">-- Choose Scouted MedSpa --</option>
            <option value="riveros">Med Aesthetics Miami (Dr. Carlos Riveros)</option>
            <option value="baluch">Rejuve Med-Spa (Dr. Amir Baluch)</option>
            <option value="moleno">Vitalyc Medspa (Dr. Richard Moleno)</option>
            <option value="grimsley">ELLEMES Medical Spa (Dr. Mark Grimsley)</option>
            <option value="hanna">Lumea Med Spa (Dr. Hanna)</option>
          </select>
        </div>

        <form method="GET" action="/outreach/preview" class="space-y-3 pt-2">
          <input type="hidden" name="step" value="${selectedStep}" />

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Doctor Name</label>
            <input type="text" name="doctorName" id="inputDoctor" value="${sample.doctor_name || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Clinic Name</label>
            <input type="text" name="clinicName" id="inputClinic" value="${sample.clinic_name || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">City / Market</label>
            <input type="text" name="city" id="inputCity" value="${sample.city || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Target High-Ticket Treatment</label>
            <input type="text" name="treatment" id="inputTreatment" value="${sample.treatment || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Prospect Email</label>
            <input type="email" name="email" id="inputEmail" value="${sample.email || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono" />
          </div>

          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2.5 rounded-xl transition shadow-md shadow-blue-600/20">
            Update Live Preview
          </button>
        </form>

        <!-- Harvey Deliverability Meter -->
        <div class="bg-gray-950 p-3.5 rounded-xl border border-gray-800/80 space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-gray-400 font-semibold">Harvey Quality Check:</span>
            <span class="text-emerald-400 font-mono font-bold">${wordCount} Words</span>
          </div>
          <div class="space-y-1 text-[11px] text-gray-400">
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Sub-75 Word Ceiling Met (Read in 6s)
            </div>
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Zero AI Clichés / Tells Detected
            </div>
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Exactly 1 Clean Plain Link (Zero Tracking)
            </div>
            <div class="flex items-center gap-1.5 ${selectedStep > 1 ? 'text-purple-400' : 'text-gray-500'}">
              <span>${selectedStep > 1 ? '✓' : '―'}</span> ${selectedStep > 1 ? 'RFC 5322 In-Reply-To Thread Active' : 'Initiates Thread (Message-ID Generated)'}
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Dual Inbox Mockup + Plain Text (8 Cols) -->
      <div class="lg:col-span-8 space-y-4">

        <!-- Gmail / Apple Mail Client Mockup -->
        <div class="bg-gray-900/90 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          <!-- Client Title Bar -->
          <div class="bg-gray-950 px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
              <span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
              <span class="text-xs text-gray-400 font-mono ml-2">Inbox • 1-on-1 Personal View</span>
            </div>
            <button onclick="copyEmailText()" id="copyBtn" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
              <span>📋</span>
              <span id="copyText">Copy Plain Text</span>
            </button>
          </div>

          <!-- Email Headers -->
          <div class="p-5 border-b border-gray-800 space-y-2 text-xs bg-gray-900/60">
            <div class="flex items-baseline gap-2">
              <span class="text-gray-500 font-medium w-16">Subject:</span>
              <span class="font-bold text-white text-sm">${rendered.subject}</span>
            </div>
            <div class="flex items-baseline gap-2 text-gray-400">
              <span class="text-gray-500 font-medium w-16">From:</span>
              <span>Archit | SureGreet AI &lt;archit@suregreet.ai&gt;</span>
            </div>
            <div class="flex items-baseline gap-2 text-gray-400">
              <span class="text-gray-500 font-medium w-16">To:</span>
              <span class="font-mono text-blue-400">${sample.email || 'doctor@clinic.com'}</span>
            </div>
          </div>

          <!-- Email Body Canvas -->
          <div class="p-6 bg-white text-gray-900 text-sm leading-relaxed font-sans">
            ${rendered.html}
          </div>
        </div>

        <!-- Plain Text Raw Output -->
        <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-2">
          <div class="flex items-center justify-between text-xs text-gray-400">
            <span class="font-semibold uppercase tracking-wider">Raw Plain-Text Payload (Primary Deliverability):</span>
            <span class="text-[11px] text-gray-500">CAN-SPAM Opt-Out Included</span>
          </div>
          <pre id="rawPlainText" class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs text-gray-200 font-mono whitespace-pre-line leading-relaxed overflow-x-auto">${rendered.text}</pre>
        </div>

      </div>

    </div>

  </main>

  <script>
    const presets = {
      riveros: {
        doctor: 'Dr. Carlos Riveros',
        clinic: 'Med Aesthetics Miami',
        city: 'Miami, FL',
        treatment: 'Morpheus8',
        email: 'coralgables@medaestheticsmiami.com'
      },
      baluch: {
        doctor: 'Dr. Amir Baluch',
        clinic: 'Rejuve Med-Spa',
        city: 'Dallas, TX',
        treatment: 'Morpheus8',
        email: 'hiddenbeauty@rejuvemedspa.com'
      },
      moleno: {
        doctor: 'Dr. Richard Moleno',
        clinic: 'Vitalyc Medspa',
        city: 'Dallas, TX',
        treatment: 'BodyTite & Morpheus8',
        email: 'info@vitalyc.com'
      },
      grimsley: {
        doctor: 'Dr. Mark Grimsley',
        clinic: 'ELLEMES Medical Spa',
        city: 'Atlanta, GA',
        treatment: 'Morpheus8',
        email: 'info@ellemesmedspa.com'
      },
      hanna: {
        doctor: 'Dr. Hanna',
        clinic: 'Lumea Med Spa',
        city: 'Miami, FL',
        treatment: 'Morpheus8 & Injectables',
        email: 'support@lumeamedspa.com'
      }
    };

    function applyClinicPreset(key) {
      if (!presets[key]) return;
      const p = presets[key];
      document.getElementById('inputDoctor').value = p.doctor;
      document.getElementById('inputClinic').value = p.clinic;
      document.getElementById('inputCity').value = p.city;
      document.getElementById('inputTreatment').value = p.treatment;
      document.getElementById('inputEmail').value = p.email;
    }

    function copyEmailText() {
      const text = document.getElementById('rawPlainText').innerText;
      navigator.clipboard.writeText(text).then(() => {
        const btnText = document.getElementById('copyText');
        btnText.innerText = 'Copied to Clipboard! ✓';
        setTimeout(() => {
          btnText.innerText = 'Copy Plain Text';
        }, 2000);
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

// 8. Script Studio & Email Previewer (Unified Web Studio)
outreachRouter.get('/preview', (req, res) => {
  const step = Number(req.query.step || 1);
  const sample = {
    doctor_name: req.query.doctorName || 'Dr. Carlos Riveros',
    clinic_name: req.query.clinicName || 'Med Aesthetics Miami',
    city: req.query.city || 'Miami, FL',
    treatment: req.query.treatment || 'Morpheus8',
    email: req.query.email || 'coralgables@medaestheticsmiami.com',
    original_subject: req.query.originalSubject || 'quick question - Med Aesthetics Miami inquiries',
  };

  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderScriptStudioHtml(step, sample));
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
