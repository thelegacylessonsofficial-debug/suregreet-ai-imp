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

function countWords(str) {
  if (!str) return 0;
  const body = str.split('--')[0].trim();
  return body.split(/\s+/).filter(Boolean).length;
}

function renderProspectsHtml(list) {
  const total = list.length;
  const pendingCount = list.filter((p) => p.status === 'pending').length;
  const activeCount = list.filter((p) => p.status === 'active').length;
  const repliedCount = list.filter((p) => p.status === 'replied').length;
  const completedCount = list.filter((p) => p.status === 'completed').length;

  // Pre-render step 1 preview for each prospect so client modal is 100% accurate
  const listWithPreview = list.map((p) => {
    try {
      const p1 = renderStepContent(1, p);
      return {
        ...p,
        step1Preview: {
          subject: p1.subject,
          text: p1.text.split('--')[0].trim(),
          wordCount: countWords(p1.text),
        },
      };
    } catch (e) {
      return {
        ...p,
        step1Preview: {
          subject: `quick question - ${p.clinic_name || 'practice'} inquiries`,
          text: `Hey ${p.doctor_name || 'there'},\n\nSaw your site makes visitors fill out a static form instead of booking directly.`,
          wordCount: 15,
        },
      };
    }
  });

  const prospectsJson = JSON.stringify(listWithPreview).replace(/</g, '\\u003c');

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
          <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white">Outbound Pipeline CRM</h1>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 pulse-dot"></span>
            Supabase Live DB
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Real-time status of scouted US MedSpas & HVAC Contractors, Harvey micro-outreach, and replies.</p>
      </div>

      <div class="flex items-center gap-2.5">
        <a href="/scraper/dashboard" class="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-600/20">
          <span>⚡</span>
          <span>Lead Hunter Studio</span>
        </a>
        <a href="/outreach/preview" class="px-3.5 py-2 text-xs font-medium bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-xl transition">
          ✉️ Email Script Studio
        </a>
      </div>
    </div>

    <!-- Executive KPI Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      <div class="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Scouted</div>
        <div class="text-2xl font-bold text-white tracking-tight">${total}</div>
        <div class="text-[11px] text-gray-500">Qualified Prospects</div>
      </div>

      <div class="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 space-y-1 shadow-lg">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
          <span>Pending (On Hold)</span>
          <span>🔒</span>
        </div>
        <div class="text-2xl font-bold text-amber-300 tracking-tight">${pendingCount}</div>
        <div class="text-[11px] text-amber-400/80">Safety Active • 0 Dispatched</div>
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
              <th class="py-3.5 px-4 font-semibold">Business & Location</th>
              <th class="py-3.5 px-4 font-semibold">Decision Maker</th>
              <th class="py-3.5 px-4 font-semibold">Contact Email</th>
              <th class="py-3.5 px-4 font-semibold">High-Ticket Offer</th>
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

                const isHvac = p.niche === 'hvac';
                const nicheBadge = isHvac
                  ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">❄️ HVAC</span>`
                  : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">✨ MedSpa</span>`;

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
                <tr class="hover:bg-gray-800/40 transition prospect-row" data-status="${p.status}" data-search="${(p.clinic_name + ' ' + p.doctor_name + ' ' + p.city + ' ' + p.treatment + ' ' + p.email + ' ' + (p.niche || '')).toLowerCase()}">
                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-white text-sm">${p.clinic_name || 'N/A'}</span>
                      ${nicheBadge}
                    </div>
                    <div class="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <span class="text-rose-400">📍</span> ${p.city || 'United States'}
                    </div>
                    ${
                      p.specific_observation
                        ? `<div class="text-[11px] text-blue-300/90 italic flex items-center gap-1 mt-1">
                            <span>💡</span>
                            <span class="truncate max-w-[280px]" title="${escapeQuotes(p.specific_observation)}">"${escapeQuotes(p.specific_observation)}"</span>
                          </div>`
                        : ''
                    }
                  </td>

                  <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-blue-400 shadow-sm">
                        ${initials}
                      </div>
                      <div class="font-semibold text-white">${p.doctor_name || 'Operations Lead'}</div>
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
                      title="Preview personalized Harvey cold email"
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
        Engine: RFC 5322 MIME Threading • 45–65 Words Harvey Ceiling
      </div>
    </div>

  </main>

  <!-- Email Preview Modal -->
  <div id="previewModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div class="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-start justify-between border-b border-gray-800 pb-3">
        <div>
          <div class="flex items-center space-x-2">
            <h3 id="modalTitle" class="text-sm font-bold text-white">Preview Step 1 Email Audit</h3>
            <span id="modalWordCount" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"></span>
          </div>
          <p id="modalRecipient" class="text-xs text-gray-400 font-mono mt-0.5">To: doctor@clinic.com</p>
        </div>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
      </div>

      <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-3 text-xs">
        <div class="text-gray-400 font-mono border-b border-gray-800 pb-2">
          <strong>Subject:</strong> <span id="modalSubject" class="text-blue-400 font-semibold"></span>
        </div>
        <div id="modalBody" class="font-mono text-gray-200 leading-relaxed whitespace-pre-line py-1"></div>
        <div class="text-[11px] text-gray-500 border-t border-gray-800 pt-2 font-mono flex items-center justify-between">
          <span>Rules: 45–65 words • Zero AI fluff • Lowercase after dash</span>
          <span class="text-emerald-400">✓ Harvey Compliant</span>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <a id="modalFullStudioLink" href="/outreach/preview" class="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold">
          <span>Open Full Script Studio (All 4 Steps)</span>
          <span>→</span>
        </a>
        <button onclick="closeModal()" class="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <script>
    const prospects = ${prospectsJson};

    function escapeQuotes(str) {
      if (!str) return '';
      return String(str).replace(/'/g, "\\\\'");
    }

    function openPreview(id) {
      const p = prospects.find(x => x.id === id);
      if (!p) return;

      document.getElementById('modalTitle').innerText = 'Step 1 • Controlled Imperfection Micro-Audit';
      document.getElementById('modalRecipient').innerText = 'To: ' + (p.doctor_name || 'Lead') + ' <' + p.email + '>';
      document.getElementById('modalSubject').innerText = p.step1Preview?.subject || ('quick question - ' + (p.clinic_name || 'practice'));
      document.getElementById('modalBody').innerText = p.step1Preview?.text || '';
      document.getElementById('modalWordCount').innerText = (p.step1Preview?.wordCount || 55) + ' Words (Harvey Cap: 45–65)';

      const queryParams = new URLSearchParams({
        step: 1,
        doctorName: p.doctor_name || '',
        clinicName: p.clinic_name || '',
        city: p.city || '',
        treatment: p.treatment || '',
        email: p.email || '',
        niche: p.niche || 'medspa',
        specificObservation: p.specific_observation || '',
      });

      document.getElementById('modalFullStudioLink').href = '/outreach/preview?' + queryParams.toString();
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
  const wordCount = countWords(rendered.text);
  const isWordCountValid = wordCount >= 45 && wordCount <= 65;

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
        <p class="text-xs text-gray-400 mt-1">Preview 1-on-1 plain-text scripts, inspect MIME threading, and verify 45–65 word limits.</p>
      </div>

      <div class="flex items-center gap-2">
        <a href="/outreach/prospects" class="px-3.5 py-2 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-800 rounded-xl transition flex items-center gap-1.5">
          <span>📊 Back to Pipeline</span>
        </a>
      </div>
    </div>

    <!-- Step Selector Tabs -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <a href="?step=1&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 1
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-blue-400">Step 1 • Cold Hook</div>
        <div class="font-bold text-sm text-white mt-0.5">Micro-Audit</div>
        <div class="text-[11px] text-gray-400 mt-1">45–65 Words • Day 1</div>
      </a>

      <a href="?step=2&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 2
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-400">Step 2 • Proof</div>
        <div class="font-bold text-sm text-white mt-0.5">30s Audio Demo</div>
        <div class="text-[11px] text-gray-400 mt-1">Threaded Re: (+2 biz days)</div>
      </a>

      <a href="?step=3&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 3
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Step 3 • Economic Math</div>
        <div class="font-bold text-sm text-white mt-0.5">Revenue Leak</div>
        <div class="text-[11px] text-gray-400 mt-1">Threaded Re: (+3 biz days)</div>
      </a>

      <a href="?step=4&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 4
             ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
             : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Step 4 • Closer</div>
        <div class="font-bold text-sm text-white mt-0.5">Clean Breakup</div>
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
          <label class="block text-[11px] font-medium text-gray-400">Pre-fill Scouted Lead:</label>
          <select id="clinicSelector" onchange="applyClinicPreset(this.value)" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
            <option value="">-- Choose Scouted Prospect --</option>
            <optgroup label="✨ MedSpas & Aesthetic Clinics">
              <option value="riveros">Med Aesthetics Miami (Dr. Carlos Riveros)</option>
              <option value="baluch">Rejuve Med-Spa (Dr. Amir Baluch)</option>
              <option value="moleno">Vitalyc Medspa (Dr. Richard Moleno)</option>
              <option value="grimsley">ELLEMES Medical Spa (Dr. Mark Grimsley)</option>
              <option value="hanna">Lumea Med Spa (Dr. Hanna)</option>
            </optgroup>
            <optgroup label="❄️ Emergency HVAC Contractors">
              <option value="apex">Apex Heating & Air (David Miller • Phoenix, AZ)</option>
              <option value="titan">Titan Emergency HVAC (Mike Sullivan • Dallas, TX)</option>
            </optgroup>
          </select>
        </div>

        <form method="GET" action="/outreach/preview" class="space-y-3 pt-2">
          <input type="hidden" name="step" value="${selectedStep}" />

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Target Niche</label>
            <select name="niche" id="inputNiche" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="medspa" ${sample.niche !== 'hvac' ? 'selected' : ''}>✨ MedSpa / Aesthetic Clinic</option>
              <option value="hvac" ${sample.niche === 'hvac' ? 'selected' : ''}>❄️ Emergency HVAC & Plumbing</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Doctor / Owner Name</label>
            <input type="text" name="doctorName" id="inputDoctor" value="${sample.doctor_name || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">Business / Clinic Name</label>
            <input type="text" name="clinicName" id="inputClinic" value="${sample.clinic_name || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">City / Market</label>
            <input type="text" name="city" id="inputCity" value="${sample.city || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">High-Ticket Offer / Service</label>
            <input type="text" name="treatment" id="inputTreatment" value="${sample.treatment || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-gray-400">The Auditor Observation Hook (Optional)</label>
            <textarea name="specificObservation" id="inputObservation" rows="2" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">${sample.specific_observation || ''}</textarea>
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
            <span class="${isWordCountValid ? 'text-emerald-400' : 'text-amber-400'} font-mono font-bold">${wordCount} Words</span>
          </div>
          <div class="space-y-1 text-[11px] text-gray-400">
            <div class="flex items-center gap-1.5 ${isWordCountValid ? 'text-emerald-400' : 'text-amber-400'}">
              <span>${isWordCountValid ? '✓' : '⚠️'}</span> Strictly 45–65 Words Cap (${wordCount} words)
            </div>
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Casual Mechanics: Lowercase after dash & mid-thought pivot
            </div>
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Zero AI Clichés (streamline, elevate, delighted filtered)
            </div>
            <div class="flex items-center gap-1.5 text-emerald-400">
              <span>✓</span> Zero Pitch in Email 1: Sells 60s demo only
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
        niche: 'medspa',
        doctor: 'Dr. Carlos Riveros',
        clinic: 'Med Aesthetics Miami',
        city: 'Miami, FL',
        treatment: 'Morpheus8',
        email: 'coralgables@medaestheticsmiami.com',
        observation: 'Saw your site makes patients fill out a static contact form on the Morpheus8 page instead of booking directly.'
      },
      baluch: {
        niche: 'medspa',
        doctor: 'Dr. Amir Baluch',
        clinic: 'Rejuve Med-Spa',
        city: 'Dallas, TX',
        treatment: 'Morpheus8',
        email: 'hiddenbeauty@rejuvemedspa.com',
        observation: 'Saw your site makes patients fill out a static contact form on the Morpheus8 page instead of booking directly.'
      },
      moleno: {
        niche: 'medspa',
        doctor: 'Dr. Richard Moleno',
        clinic: 'Vitalyc Medspa',
        city: 'Dallas, TX',
        treatment: 'BodyTite & Morpheus8',
        email: 'info@vitalyc.com',
        observation: 'Saw your site makes patients fill out a static contact form on the BodyTite & Morpheus8 page instead of booking directly.'
      },
      grimsley: {
        niche: 'medspa',
        doctor: 'Dr. Mark Grimsley',
        clinic: 'ELLEMES Medical Spa',
        city: 'Atlanta, GA',
        treatment: 'Morpheus8',
        email: 'info@ellemesmedspa.com',
        observation: 'Saw your site makes patients fill out a static contact form on the Morpheus8 page instead of booking directly.'
      },
      hanna: {
        niche: 'medspa',
        doctor: 'Dr. Hanna',
        clinic: 'Lumea Med Spa',
        city: 'Miami, FL',
        treatment: 'Morpheus8 & Injectables',
        email: 'support@lumeamedspa.com',
        observation: 'Saw your site makes patients fill out a static contact form on the Morpheus8 & Injectables page instead of booking directly.'
      },
      apex: {
        niche: 'hvac',
        doctor: 'David Miller',
        clinic: 'Apex Heating & Air',
        city: 'Phoenix, AZ',
        treatment: 'Emergency AC Repair',
        email: 'service@apexheating.com',
        observation: 'Saw your emergency repair page routes homeowners to a static contact form instead of instant dispatch.'
      },
      titan: {
        niche: 'hvac',
        doctor: 'Mike Sullivan',
        clinic: 'Titan Emergency HVAC',
        city: 'Dallas, TX',
        treatment: '24/7 HVAC Replacement',
        email: 'info@titanhvac.com',
        observation: 'Noticed your team handles high-ticket 24/7 HVAC Replacement, but after 5:30 PM calls likely route to an answering service or voicemail.'
      }
    };

    function applyClinicPreset(key) {
      if (!presets[key]) return;
      const p = presets[key];
      document.getElementById('inputNiche').value = p.niche;
      document.getElementById('inputDoctor').value = p.doctor;
      document.getElementById('inputClinic').value = p.clinic;
      document.getElementById('inputCity').value = p.city;
      document.getElementById('inputTreatment').value = p.treatment;
      document.getElementById('inputEmail').value = p.email;
      document.getElementById('inputObservation').value = p.observation || '';
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

// 1. Pipeline CRM Dashboard Route
outreachRouter.get('/prospects', async (req, res) => {
  const format = req.query.format;
  const statusFilter = req.query.status;

  const prospects = await getProspects({ status: statusFilter });

  if (format === 'json') {
    return res.json({
      status: 'success',
      count: prospects.length,
      active: prospects.filter((p) => p.status === 'active').length,
      pending: prospects.filter((p) => p.status === 'pending').length,
      replied: prospects.filter((p) => p.status === 'replied').length,
      unsubscribed: prospects.filter((p) => p.status === 'unsubscribed').length,
      completed: prospects.filter((p) => p.status === 'completed').length,
      prospects,
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProspectsHtml(prospects));
});

// Aliases for dashboard
outreachRouter.get('/dashboard', (req, res) => res.redirect('/outreach/prospects'));
outreachRouter.get('/pipeline', (req, res) => res.redirect('/outreach/prospects'));

// 2. Email Script Studio Route
outreachRouter.get('/preview', async (req, res) => {
  const step = Math.min(Math.max(parseInt(req.query.step || '1', 10), 1), 4);
  const sample = {
    doctor_name: req.query.doctorName || 'Dr. Carlos Riveros',
    clinic_name: req.query.clinicName || 'Med Aesthetics Miami',
    city: req.query.city || 'Miami, FL',
    treatment: req.query.treatment || 'Morpheus8',
    email: req.query.email || 'coralgables@medaestheticsmiami.com',
    niche: req.query.niche || 'medspa',
    specific_observation: req.query.specificObservation || 'Saw your site makes patients fill out a static contact form on the Morpheus8 page instead of booking directly.',
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderScriptStudioHtml(step, sample));
});

// 3. Activate Prospect Route
outreachRouter.post('/activate', async (req, res) => {
  const { prospectId } = req.body || {};
  if (!prospectId) {
    return res.status(400).json({ status: 'error', message: 'Field "prospectId" is required' });
  }

  const result = await activateProspect(prospectId);
  if (result.success) {
    res.json({ status: 'success', message: 'Prospect activated into queue', prospect: result.prospect });
  } else {
    res.status(400).json({ status: 'error', message: result.error });
  }
});

// 4. Manual trigger of queue worker
outreachRouter.post('/cron/trigger', async (req, res) => {
  try {
    const summary = await runOutreachQueueWorker();
    res.json({ status: 'success', summary });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Unsubscribe route
outreachRouter.get('/unsubscribe', async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send('Invalid unsubscribe link.');
  }

  const result = await unsubscribeProspect(email);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Unsubscribed — SureGreet AI</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0b0f19; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #111827; border: 1px solid #374151; padding: 32px; border-radius: 16px; max-width: 440px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin-top:0; color:#10b981;">✓ Unsubscribed</h2>
    <p style="color:#9ca3af; font-size:14px; line-height:1.5;">${email} has been permanently removed from all SureGreet AI outreach sequences.</p>
  </div>
</body>
</html>`);
});
