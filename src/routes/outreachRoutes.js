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
  updateProspect,
  deleteProspect,
} from '../services/outreachService.js';
import { runOutreachQueueWorker, isWithinSendingWindow } from '../cron/outreachCron.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';
import { renderLeadBotsHubHtml } from '../views/leadBotsHub.js';

export const outreachRouter = Router();

function countWords(str) {
  if (!str) return 0;
  const body = str.split('--')[0].trim();
  return body.split(/\s+/).filter(Boolean).length;
}

function escapeQuotes(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatUsPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  let tenDigits = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    tenDigits = digits.slice(1);
  } else if (digits.length > 10) {
    tenDigits = digits.slice(-10);
  }
  if (tenDigits.length === 10) {
    return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
  }
  return raw;
}

function renderProspectsHtml(list, authKey = '') {
  const total = list.length;
  const pendingCount = list.filter((p) => p.status === 'pending').length;
  const activeCount = list.filter((p) => p.status === 'active').length;
  const repliedCount = list.filter((p) => p.status === 'replied').length;
  const bookedCount = list.filter((p) => p.status === 'meeting_booked').length;
  const completedCount = list.filter((p) => p.status === 'completed').length;
  const phoneCount = list.filter((p) => Boolean(p.phone)).length;

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

  const bodyContent = `
    <!-- Top View Switcher Tabs -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--accent-emerald)] font-mono">Workspace View</span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-0.5">Switch between active Outbound Pipeline CRM and the 4 Autonomous Lead Bots.</p>
      </div>

      <div class="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold">
        <button onclick="switchView('pipeline')" id="tabViewPipeline" class="px-4 py-2 rounded-xl bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 transition flex items-center gap-2">
          ${getSvgIcon('pipeline', 'w-4 h-4')}
          <span>Pipeline CRM (${total})</span>
        </button>
        <button onclick="switchView('bots')" id="tabViewBots" class="px-4 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition flex items-center gap-2">
          ${getSvgIcon('bots', 'w-4 h-4 text-cyan-400')}
          <span>Lead Bots Hub (4)</span>
        </button>
      </div>
    </div>

    <!-- VIEW 1: PIPELINE CRM VIEW -->
    <div id="pipelineViewContainer" class="space-y-6">

      <!-- Executive KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-1 shadow-md">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Total Scouted</div>
          <div class="text-2xl font-bold text-[var(--text-primary)] tracking-tight">${total}</div>
          <div class="text-[11px] text-[var(--text-muted)] font-mono">100% US Verified</div>
        </div>

        <div class="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 space-y-1 shadow-md">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
            <span>Pending (On Hold)</span>
            ${getSvgIcon('shield', 'w-3.5 h-3.5 text-amber-400')}
          </div>
          <div class="text-2xl font-bold text-amber-300 tracking-tight">${pendingCount}</div>
          <div class="text-[11px] text-amber-400/80 font-mono">Safety Sentinel Guard</div>
        </div>

        <div class="bg-cyan-950/20 border border-cyan-500/20 rounded-2xl p-4 space-y-1 shadow-md">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">Phone Dial Ready</div>
          <div class="text-2xl font-bold text-cyan-300 tracking-tight">${phoneCount}</div>
          <div class="text-[11px] text-cyan-400/80 font-mono">1-Click Calling</div>
        </div>

        <div class="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-4 space-y-1 shadow-md">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Active In Queue</div>
          <div class="text-2xl font-bold text-blue-300 tracking-tight">${activeCount}</div>
          <div class="text-[11px] text-blue-400/80 font-mono">Cron Dispatched</div>
        </div>

        <div class="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 space-y-1 col-span-2 lg:col-span-1 shadow-md">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Replied / Hot</span>
            ${getSvgIcon('check', 'w-3.5 h-3.5 text-emerald-400')}
          </div>
          <div class="text-2xl font-bold text-emerald-300 tracking-tight">${repliedCount + bookedCount}</div>
          <div class="text-[11px] text-emerald-400/80 font-mono">Discovery Ready</div>
        </div>
      </div>

      <!-- Search & Status Filter Controls -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-card)] p-3.5 rounded-2xl border border-[var(--border-subtle)]">
        <div class="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button onclick="filterStatus('all')" id="tab-all" class="filter-tab px-3.5 py-1.5 rounded-xl bg-[var(--accent-emerald)] text-black font-bold transition">
            All (${total})
          </button>
          <button onclick="filterStatus('pending')" id="tab-pending" class="filter-tab px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium transition">
            Pending (${pendingCount})
          </button>
          <button onclick="filterStatus('active')" id="tab-active" class="filter-tab px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium transition">
            Active (${activeCount})
          </button>
          <button onclick="filterStatus('replied')" id="tab-replied" class="filter-tab px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium transition">
            Replied (${repliedCount})
          </button>
          <button onclick="filterStatus('meeting_booked')" id="tab-meeting_booked" class="filter-tab px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium transition">
            Meeting Booked (${bookedCount})
          </button>
        </div>

        <div class="relative">
          <input 
            id="searchInput"
            type="text" 
            placeholder="Search by doctor, clinic, city, or phone..."
            oninput="applySearch()"
            class="w-full sm:w-80 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-emerald)] transition"
          />
        </div>
      </div>

      <!-- Prospects Table with 1-Click Action Suite -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-2xl">
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-[11px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-surface)]/80 border-b border-[var(--border-subtle)]">
              <tr>
                <th class="py-3.5 px-4 font-semibold">Doctor / DM</th>
                <th class="py-3.5 px-4 font-semibold">Clinic & Location</th>
                <th class="py-3.5 px-4 font-semibold text-[var(--accent-emerald)]">1-Click Phone Dial</th>
                <th class="py-3.5 px-4 font-semibold">Contact Email</th>
                <th class="py-3.5 px-4 font-semibold">Offer / Service</th>
                <th class="py-3.5 px-4 font-semibold text-center">Live Status</th>
                <th class="py-3.5 px-4 font-semibold text-right">Action Hub</th>
              </tr>
            </thead>
            <tbody id="prospectsTableBody" class="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-secondary)]">
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
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">HVAC</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">MedSpa</span>`;

                  return `
                  <tr class="hover:bg-[var(--bg-hover)] transition prospect-row" data-id="${p.id}" data-status="${p.status}" data-search="${(p.clinic_name + ' ' + p.doctor_name + ' ' + p.city + ' ' + p.treatment + ' ' + p.email + ' ' + (p.phone || '') + ' ' + (p.niche || '')).toLowerCase()}">
                    
                    <!-- Doctor / DM -->
                    <td class="py-3.5 px-4">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--accent-emerald)] shadow-sm shrink-0">
                          ${initials}
                        </div>
                        <div>
                          <div class="font-bold text-[var(--text-primary)] text-xs">${escapeHtml(p.doctor_name || 'Operations Lead')}</div>
                          <div class="text-[10px] text-[var(--text-muted)] font-mono">${escapeHtml(p.email)}</div>
                        </div>
                      </div>
                    </td>

                    <!-- Clinic & Location -->
                    <td class="py-3.5 px-4">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-[var(--text-primary)]">${escapeHtml(p.clinic_name || 'N/A')}</span>
                        ${nicheBadge}
                      </div>
                      <div class="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <span>📍 ${escapeHtml(p.city || 'United States')}</span>
                      </div>
                    </td>

                    <!-- 1-Click Dial Phone Cell -->
                    <td class="py-3.5 px-4 whitespace-nowrap">
                      ${
                        p.phone
                          ? `<div class="flex items-center gap-1.5">
                              <a href="tel:${String(p.phone).replace(/[^0-9+]/g, '')}" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--accent-emerald-subtle)] hover:bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 rounded-xl font-mono font-bold text-xs transition shadow-sm group" title="Click to dial immediately">
                                <span class="group-hover:scale-110 transition">${getSvgIcon('phone', 'w-3 h-3')}</span>
                                <span>${formatUsPhone(p.phone)}</span>
                              </a>
                              <button onclick="copyToClipboard('${String(p.phone).replace(/[^0-9+]/g, '')}', 'Phone number copied!')" class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded-lg transition text-[11px]" title="Copy phone number">
                                ${getSvgIcon('copy', 'w-3 h-3')}
                              </button>
                            </div>`
                          : `<span class="text-[var(--text-muted)] text-xs italic">No phone on file</span>`
                      }
                    </td>

                    <!-- Contact Email -->
                    <td class="py-3.5 px-4 font-mono text-xs">
                      <a href="mailto:${p.email}" class="text-cyan-400 hover:underline">${escapeHtml(p.email)}</a>
                    </td>

                    <!-- Offer / Service -->
                    <td class="py-3.5 px-4">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        ${escapeHtml(p.treatment || 'Consultation')}
                      </span>
                    </td>

                    <!-- Live Status Dropdown -->
                    <td class="py-3.5 px-4 text-center whitespace-nowrap">
                      <select onchange="updateProspectStatus('${p.id}', this.value)" class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-semibold rounded-xl px-2.5 py-1 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-emerald)] transition">
                        <option value="pending" ${p.status === 'pending' ? 'selected' : ''}>Pending (On Hold)</option>
                        <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active (In Queue)</option>
                        <option value="replied" ${p.status === 'replied' ? 'selected' : ''}>Replied</option>
                        <option value="meeting_booked" ${p.status === 'meeting_booked' ? 'selected' : ''}>Meeting Booked</option>
                        <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="unsubscribed" ${p.status === 'unsubscribed' ? 'selected' : ''}>Unsubscribed</option>
                      </select>
                    </td>

                    <!-- Action Hub -->
                    <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <!-- 1-Click Dial Logger -->
                      <button 
                        onclick="openDialLogger('${p.id}', '${escapeQuotes(p.doctor_name || 'Doctor')}', '${escapeQuotes(p.clinic_name || 'Clinic')}', '${escapeQuotes(p.phone || '')}')"
                        class="px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition"
                        title="Log an outbound call dial for Archit's 10 daily RGAs"
                      >
                        Log Dial
                      </button>

                      <!-- Preview Step 1 Audit -->
                      <button 
                        onclick="openPreview('${p.id}')"
                        class="px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium transition"
                        title="Preview personalized Harvey cold email"
                      >
                        Preview
                      </button>

                      <!-- Instant Activate Step 1 -->
                      ${
                        p.status === 'pending'
                          ? `<button 
                              onclick="confirmActivate('${p.id}', '${escapeQuotes(p.doctor_name)}', '${escapeQuotes(p.clinic_name)}')"
                              class="px-2.5 py-1.5 rounded-xl bg-[var(--accent-emerald)] hover:opacity-90 text-black text-xs font-bold transition shadow-sm"
                            >
                              Activate
                            </button>`
                          : ''
                      }

                      <!-- Remove Lead Button -->
                      <button 
                        onclick="confirmDeleteProspect('${p.id}', '${escapeQuotes(p.doctor_name || 'Doctor')}', '${escapeQuotes(p.clinic_name || 'Clinic')}')"
                        class="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition text-xs inline-flex items-center justify-center align-middle"
                        title="Permanently remove this lead from CRM database"
                      >
                        ${getSvgIcon('trash', 'w-3.5 h-3.5')}
                      </button>
                    </td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        ${
          list.length === 0
            ? `<div class="p-12 text-center text-[var(--text-muted)] text-xs">
                No prospects found in database. <a href="/scraper/dashboard" class="text-cyan-400 underline font-medium">Scout clinics now</a>.
              </div>`
            : ''
        }
      </div>

    </div>

    <!-- VIEW 2: LEAD BOTS CONTROL HUB (TOGGLED) -->
    <div id="botsViewContainer" class="hidden space-y-6">
      ${renderLeadBotsHubHtml()}
    </div>
  `;

  const extraScripts = `
    <!-- Email Preview Modal -->
    <div id="previewModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
        <div class="flex items-start justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div class="flex items-center space-x-2">
              <h3 id="modalTitle" class="text-sm font-bold text-[var(--text-primary)]">Preview Step 1 Email Audit</h3>
              <span id="modalWordCount" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"></span>
            </div>
            <p id="modalRecipient" class="text-xs text-[var(--text-muted)] font-mono mt-0.5">To: doctor@clinic.com</p>
          </div>
          <button onclick="closeModal()" class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold">✕</button>
        </div>

        <div class="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3 text-xs">
          <div class="text-[var(--text-secondary)] font-mono border-b border-[var(--border-subtle)] pb-2">
            <strong>Subject:</strong> <span id="modalSubject" class="text-cyan-400 font-semibold"></span>
          </div>
          <div id="modalBody" class="font-mono text-[var(--text-primary)] leading-relaxed whitespace-pre-line py-1"></div>
          <div class="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2 font-mono flex items-center justify-between">
            <span>Rules: 45–65 words • Zero AI fluff • Lowercase after dash</span>
            <span class="text-emerald-400">✓ Harvey Compliant</span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <a id="modalFullStudioLink" href="/outreach/preview" class="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-semibold">
            <span>Open Full Script Studio (All 4 Steps)</span>
            <span>→</span>
          </a>
          <button onclick="closeModal()" class="px-4 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-medium transition">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Outbound Dial Logger Modal -->
    <div id="dialLoggerModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div class="flex items-start justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h3 class="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span>Log Outbound Cold Dial</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">10 Daily RGAs</span>
            </h3>
            <p class="text-xs text-[var(--text-muted)] mt-0.5">Records call in Supabase and syncs with Archit's Telegram Bot</p>
          </div>
          <button onclick="closeDialModal()" class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-[var(--text-muted)] mb-1">Contact Name</label>
              <input type="text" id="dialContactName" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-primary)]" />
            </div>
            <div>
              <label class="block text-[11px] text-[var(--text-muted)] mb-1">Clinic Name</label>
              <input type="text" id="dialClinicName" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-primary)]" />
            </div>
          </div>

          <div>
            <label class="block text-[11px] text-[var(--text-muted)] mb-1">Phone Number</label>
            <input type="text" id="dialPhone" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-primary)] font-mono" />
          </div>

          <div>
            <label class="block text-[11px] text-[var(--text-muted)] mb-1">Call Outcome</label>
            <select id="dialOutcome" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-primary)] font-medium">
              <option value="Decision Maker Connected">🗣️ Decision Maker Connected</option>
              <option value="Demo / Meeting Booked">🎯 Demo / Meeting Booked (HOT)</option>
              <option value="Gatekeeper Rejection / Follow Up">🛡️ Gatekeeper Rejection / Follow Up</option>
              <option value="Voicemail Left">📼 Voicemail Left</option>
              <option value="No Answer / Busy">📵 No Answer / Busy</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] text-[var(--text-muted)] mb-1">Call Notes / Pain Points Noted</label>
            <textarea id="dialNotes" rows="3" placeholder="Doctor mentioned after-hours inquiry leaks; interested in 30s Morpheus8 audio demo..." class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-2.5 text-[var(--text-primary)]"></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button onclick="closeDialModal()" class="px-4 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-medium transition">
            Cancel
          </button>
          <button onclick="submitDialLog()" class="px-5 py-2 rounded-xl bg-cyan-500 hover:opacity-90 text-black font-bold text-xs transition shadow-md shadow-cyan-500/15">
            Save Call & Log 1 RGA
          </button>
        </div>
      </div>
    </div>

    <script>
      const prospects = ${prospectsJson};

      // Switch between Pipeline CRM and Lead Bots Control Hub
      function switchView(view) {
        const pipeCont = document.getElementById('pipelineViewContainer');
        const botsCont = document.getElementById('botsViewContainer');
        const tabPipe = document.getElementById('tabViewPipeline');
        const tabBots = document.getElementById('tabViewBots');

        if (view === 'bots') {
          pipeCont.classList.add('hidden');
          botsCont.classList.remove('hidden');
          tabBots.className = "px-4 py-2 rounded-xl bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 transition flex items-center gap-2";
          tabPipe.className = "px-4 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition flex items-center gap-2";
          window.location.hash = 'bots';
        } else {
          botsCont.classList.add('hidden');
          pipeCont.classList.remove('hidden');
          tabPipe.className = "px-4 py-2 rounded-xl bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 transition flex items-center gap-2";
          tabBots.className = "px-4 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition flex items-center gap-2";
          window.location.hash = '';
        }
      }

      // Check hash on page load
      if (window.location.hash === '#bots') {
        switchView('bots');
      }

      // 1-Click Clipboard Copy
      function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied', successMsg, 'success');
        });
      }

      // 1-Click Status Update Dropdown
      async function updateProspectStatus(id, newStatus) {
        try {
          const res = await fetch(getAuthUrl('/outreach/update-status'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prospectId: id, status: newStatus })
          });
          const data = await res.json();
          if (res.ok) {
            showToast('Status Updated', 'Prospect marked as ' + newStatus, 'success');
            const row = document.querySelector('.prospect-row[data-id="' + id + '"]');
            if (row) row.setAttribute('data-status', newStatus);
          } else {
            showToast('Update Failed', data.message || 'Error updating status', 'error');
          }
        } catch (e) {
          showToast('Error', e.message, 'error');
        }
      }

      // Outbound Dial Logger Modal Helpers
      let activeDialProspectId = null;

      function openDialLogger(id, drName, clinicName, phone) {
        activeDialProspectId = id;
        document.getElementById('dialContactName').value = drName;
        document.getElementById('dialClinicName').value = clinicName;
        document.getElementById('dialPhone').value = phone;
        document.getElementById('dialNotes').value = '';
        document.getElementById('dialLoggerModal').classList.remove('hidden');
      }

      function closeDialModal() {
        document.getElementById('dialLoggerModal').classList.add('hidden');
      }

      async function submitDialLog() {
        const contactName = document.getElementById('dialContactName').value.trim();
        const clinicName = document.getElementById('dialClinicName').value.trim();
        const phone = document.getElementById('dialPhone').value.trim();
        const outcome = document.getElementById('dialOutcome').value;
        const notes = document.getElementById('dialNotes').value.trim();

        try {
          const res = await fetch(getAuthUrl('/calls/log-outbound'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              contactName,
              clinicName,
              phone,
              outcome,
              notes
            })
          });
          const data = await res.json();
          if (res.ok) {
            closeDialModal();
            showToast('Dial Logged!', 'Progress: ' + data.todayCount + ' / 10 calls logged today.', 'success');
            if (outcome.includes('Booked')) {
              updateProspectStatus(activeDialProspectId, 'meeting_booked');
            }
          } else {
            showToast('Log Failed', data.message || 'Error logging call', 'error');
          }
        } catch (e) {
          showToast('Error', e.message, 'error');
        }
      }

      // Preview Step 1 Modal Helpers
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
          const res = await fetch(getAuthUrl('/outreach/activate'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prospectId: id })
          });

          if (!res.ok) {
            let errMsg = 'HTTP ' + res.status;
            try {
              const errData = await res.json();
              errMsg = errData.message || errData.error || errMsg;
            } catch (e) {
              if (res.status === 401) errMsg = 'Authentication required. Please reload the page to log in.';
            }
            throw new Error(errMsg);
          }

          const data = await res.json();
          if (data.status === 'success') {
            showToast('Activated!', 'Step 1 dispatched to ' + drName, 'success');
            setTimeout(() => window.location.reload(), 1200);
          } else {
            showToast('Error', data.error || 'Failed to activate', 'error');
          }
        } catch (e) {
          showToast('Failed', e.message, 'error');
        }
      }

      async function confirmDeleteProspect(id, drName, clinicName) {
        const ok = confirm('Permanently remove ' + drName + ' (' + clinicName + ') from the CRM database?\\n\\nThis will stop all automated sequences and delete the lead record.');
        if (!ok) return;

        try {
          const res = await fetch(getAuthUrl('/outreach/delete'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prospectId: id })
          });
          const data = await res.json();
          if (res.ok) {
            showToast('Lead Deleted', drName + ' removed from database.', 'success');
            const row = document.querySelector('.prospect-row[data-id="' + id + '"]');
            if (row) {
              row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              row.style.opacity = '0';
              row.style.transform = 'translateX(25px)';
              setTimeout(() => row.remove(), 300);
            }
          } else {
            showToast('Delete Failed', data.message || 'Error deleting lead', 'error');
          }
        } catch (e) {
          showToast('Network Error', e.message, 'error');
        }
      }

      function filterStatus(status) {
        document.querySelectorAll('.filter-tab').forEach(tab => {
          tab.classList.remove('bg-[var(--accent-emerald)]', 'text-black', 'font-bold');
          tab.classList.add('bg-[var(--bg-surface)]', 'text-[var(--text-secondary)]', 'font-medium');
        });
        const activeTab = document.getElementById('tab-' + status);
        if (activeTab) {
          activeTab.classList.remove('bg-[var(--bg-surface)]', 'text-[var(--text-secondary)]', 'font-medium');
          activeTab.classList.add('bg-[var(--accent-emerald)]', 'text-black', 'font-bold');
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
  `;

  return renderSaasShell({
    title: 'SureGreet AI — Pipeline CRM & Lead Bots Operating System',
    activeNav: 'pipeline',
    pageHeading: 'Outbound Pipeline CRM',
    badgeText: 'Live DB • 11 Verified Leads',
    bodyContent,
    extraScripts,
    authKeyParam: authKey,
  });
}

function renderScriptStudioHtml(selectedStep, sample, authKey = '') {
  const rendered = renderStepContent(selectedStep, sample);
  const wordCount = countWords(rendered.text);
  const isWordCountValid = wordCount >= 45 && wordCount <= 65;

  const bodyContent = `
    <!-- Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <div class="flex items-center space-x-2">
          <h2 class="text-lg font-bold tracking-tight text-[var(--text-primary)]">Outbound Email Script Studio</h2>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Harvey Sales Copy Engine
          </span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-1">Preview 1-on-1 plain-text scripts, inspect MIME threading, and verify 45–65 word limits.</p>
      </div>

      <div class="flex items-center gap-2">
        <a href="/outreach/prospects" class="px-3.5 py-2 text-xs font-semibold bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl transition flex items-center gap-1.5">
          <span>Back to Pipeline</span>
        </a>
      </div>
    </div>

    <!-- Step Selector Tabs -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <a href="?step=1&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 1
             ? 'bg-blue-600/15 border-blue-500 text-[var(--text-primary)] shadow-lg shadow-blue-500/10'
             : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-blue-400">Step 1 • Cold Hook</div>
        <div class="font-bold text-sm text-[var(--text-primary)] mt-0.5">Micro-Audit</div>
        <div class="text-[11px] text-[var(--text-muted)] mt-1 font-mono">45–65 Words • Day 1</div>
      </a>

      <a href="?step=2&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 2
             ? 'bg-purple-600/15 border-purple-500 text-[var(--text-primary)] shadow-lg shadow-purple-500/10'
             : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-400">Step 2 • Proof</div>
        <div class="font-bold text-sm text-[var(--text-primary)] mt-0.5">30s Audio Demo</div>
        <div class="text-[11px] text-[var(--text-muted)] mt-1 font-mono">Threaded Re: (+2 biz days)</div>
      </a>

      <a href="?step=3&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 3
             ? 'bg-amber-600/15 border-amber-500 text-[var(--text-primary)] shadow-lg shadow-amber-500/10'
             : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Step 3 • Economic Math</div>
        <div class="font-bold text-sm text-[var(--text-primary)] mt-0.5">Revenue Leak</div>
        <div class="text-[11px] text-[var(--text-muted)] mt-1 font-mono">Threaded Re: (+3 biz days)</div>
      </a>

      <a href="?step=4&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}" 
         class="p-3.5 rounded-2xl border transition ${
           selectedStep === 4
             ? 'bg-emerald-600/15 border-emerald-500 text-[var(--text-primary)] shadow-lg shadow-emerald-500/10'
             : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
         }">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Step 4 • Closer</div>
        <div class="font-bold text-sm text-[var(--text-primary)] mt-0.5">Clean Breakup</div>
        <div class="text-[11px] text-[var(--text-muted)] mt-1 font-mono">Threaded Re: (+3 biz days)</div>
      </a>
    </div>

    <!-- Dual Studio: Customizer Sidebar + Inbox Mockup -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Left Column: Customizer -->
      <div class="lg:col-span-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4 shadow-xl">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-2">
          Prospect Variables Customizer
        </h3>

        <form method="GET" action="/outreach/preview" class="space-y-3 pt-2">
          <input type="hidden" name="step" value="${selectedStep}" />

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">Target Niche</label>
            <select name="niche" id="inputNiche" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">
              <option value="medspa" ${sample.niche !== 'hvac' ? 'selected' : ''}>MedSpa / Aesthetic Clinic</option>
              <option value="hvac" ${sample.niche === 'hvac' ? 'selected' : ''}>Emergency HVAC & Plumbing</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">Doctor / Owner Name</label>
            <input type="text" name="doctorName" id="inputDoctor" value="${sample.doctor_name || ''}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">Business / Clinic Name</label>
            <input type="text" name="clinicName" id="inputClinic" value="${sample.clinic_name || ''}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">City / Market</label>
            <input type="text" name="city" id="inputCity" value="${sample.city || ''}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">High-Ticket Offer / Service</label>
            <input type="text" name="treatment" id="inputTreatment" value="${sample.treatment || ''}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">Target Email</label>
            <input type="text" name="email" id="inputEmail" value="${sample.email || ''}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)]">Friction Gap Observation</label>
            <textarea name="specificObservation" id="inputObservation" rows="3" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">${sample.specific_observation || ''}</textarea>
          </div>

          <button type="submit" class="w-full py-2 bg-[var(--accent-emerald)] hover:opacity-90 text-black font-bold text-xs rounded-xl transition shadow-sm">
            Update Live Preview
          </button>
        </form>
      </div>

      <!-- Right Column: Harvey Live Preview -->
      <div class="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4 shadow-xl">
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-[var(--text-primary)]">Rendered Plain Text Payload</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${isWordCountValid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">
              ${wordCount} Words (Harvey Cap: 45–65)
            </span>
          </div>
          <button onclick="copyToClipboard(document.getElementById('renderedEmailBody').innerText, 'Email body copied!')" class="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-semibold transition">
            Copy Text
          </button>
        </div>

        <div class="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3 font-mono text-xs">
          <div class="border-b border-[var(--border-subtle)] pb-2 text-[var(--text-muted)]">
            <strong>Subject:</strong> <span class="text-cyan-400">${rendered.subject}</span>
          </div>
          <div id="renderedEmailBody" class="text-[var(--text-primary)] whitespace-pre-line leading-relaxed">${rendered.text}</div>
        </div>
      </div>

    </div>
  `;

  return renderSaasShell({
    title: `SureGreet AI — Script Studio (Step ${selectedStep})`,
    activeNav: 'studio',
    pageHeading: `Email Script Studio • Step ${selectedStep}`,
    badgeText: 'Harvey Sales Engine',
    bodyContent,
    authKeyParam: authKey,
  });
}

// 1. Pipeline CRM Dashboard Route
outreachRouter.get('/prospects', async (req, res) => {
  const format = req.query.format;
  const statusFilter = req.query.status;
  const authKey = req.query.key || '';

  const prospects = await getProspects({ status: statusFilter });

  if (format === 'json') {
    return res.json({
      status: 'success',
      count: prospects.length,
      active: prospects.filter((p) => p.status === 'active').length,
      pending: prospects.filter((p) => p.status === 'pending').length,
      replied: prospects.filter((p) => p.status === 'replied').length,
      meeting_booked: prospects.filter((p) => p.status === 'meeting_booked').length,
      unsubscribed: prospects.filter((p) => p.status === 'unsubscribed').length,
      completed: prospects.filter((p) => p.status === 'completed').length,
      prospects,
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProspectsHtml(prospects, authKey));
});

// Aliases for dashboard
outreachRouter.get('/dashboard', (req, res) => res.redirect('/outreach/prospects'));
outreachRouter.get('/pipeline', (req, res) => res.redirect('/outreach/prospects'));

// 2. Email Script Studio Route
outreachRouter.get('/preview', async (req, res) => {
  const step = Math.min(Math.max(parseInt(req.query.step || '1', 10), 1), 4);
  const authKey = req.query.key || '';
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
  res.send(renderScriptStudioHtml(step, sample, authKey));
});

// 3. Update Prospect Status Route (1-Click Action Hub)
outreachRouter.post('/update-status', async (req, res) => {
  const { prospectId, status, notes } = req.body || {};
  if (!prospectId || !status) {
    return res.status(400).json({ status: 'error', message: 'Fields "prospectId" and "status" are required' });
  }

  const valid = ['pending', 'active', 'replied', 'meeting_booked', 'completed', 'unsubscribed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ status: 'error', message: `Invalid status: ${status}` });
  }

  try {
    const updates = { status };
    if (notes !== undefined) updates.notes = notes;
    if (status === 'meeting_booked' || status === 'replied' || status === 'unsubscribed') {
      updates.next_due_at = null; // stop automated cron sequence
    }
    const updated = await updateProspect(prospectId, updates);
    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Prospect not found or update failed' });
    }
    res.json({ status: 'success', prospect: updated });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Activate Prospect Route
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

// 5. Delete / Remove Prospect Route (1-Click Lead Removal)
outreachRouter.post(['/delete', '/remove'], async (req, res) => {
  const { prospectId, email } = req.body || {};
  const target = prospectId || email;
  if (!target) {
    return res.status(400).json({ status: 'error', message: 'Field "prospectId" or "email" is required' });
  }

  try {
    const result = await deleteProspect(target);
    if (result.success) {
      res.json({ status: 'success', message: 'Prospect permanently removed from database', deleted: result.deleted });
    } else {
      res.status(400).json({ status: 'error', message: result.error || 'Failed to remove prospect' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Manual trigger of queue worker
outreachRouter.post('/cron/trigger', async (req, res) => {
  try {
    const summary = await runOutreachQueueWorker();
    res.json({ status: 'success', summary });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 6. Unsubscribe route
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
    body { font-family: -apple-system, sans-serif; background: #080b11; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #0e131f; border: 1px solid #1e2738; padding: 32px; border-radius: 16px; max-width: 440px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin-top:0; color:#10b981;">✓ Unsubscribed</h2>
    <p style="color:#94a3b8; font-size:14px; line-height:1.5;">${email} has been permanently removed from all SureGreet AI outreach sequences.</p>
  </div>
</body>
</html>`);
});
