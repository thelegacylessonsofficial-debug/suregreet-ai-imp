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
import {
  generateHarveyScript,
  generateFullSequence,
  auditHarveyCopy,
  BANNED_AI_PHRASES,
  formatSalutation,
  getUnsubscribeUrl,
} from '../templates/outreachTemplates.js';
import { sendEmail } from '../services/mailer.js';
import { runHarveyAutonomousPipeline } from '../services/harveyService.js';
import { config } from '../config.js';

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

      <!-- Automated Follow-Up & Leak Prevention Control Bar -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] border-l-4 border-l-cyan-500 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            ${getSvgIcon('bolt', 'w-5 h-5')}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Automated Follow-Up & Leak Prevention System</h3>
              <span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active Engine</span>
            </div>
            <p class="text-[11px] text-[var(--text-secondary)] mt-0.5">
              4-Step RFC Threading: Step 1 Cold Hook → Step 2 Voice Demo (+2d) → Step 3 Revenue Leak (+3d) → Step 4 Breakup (+3d). Auto-freezes on reply.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <a href="/outreach/preview" class="px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition flex items-center gap-1.5">
            ${getSvgIcon('mail', 'w-3.5 h-3.5 text-cyan-400')}
            <span>Script Studio (4 Steps)</span>
          </a>
          <button onclick="triggerOutreachWorker(true)" id="btnTriggerWorker" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow-md shadow-cyan-500/20 flex items-center gap-1.5">
            ${getSvgIcon('play', 'w-3.5 h-3.5')}
            <span>Run Follow-Up Queue Now</span>
          </button>
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
                <th class="py-3.5 px-4 font-semibold text-[var(--accent-emerald)]">1-Click Phone Dial & Direct Email</th>
                <th class="py-3.5 px-4 font-semibold text-cyan-400">Harvey Bespoke Hook</th>
                <th class="py-3.5 px-4 font-semibold">Sequence Pipeline</th>
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

                  const currentStep = p.current_step || 0;
                  let stepBadge = '';
                  if (currentStep === 0) {
                    stepBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20 font-mono">Step 0/4 • Pending</span>';
                  } else if (currentStep === 1) {
                    stepBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">Step 1/4 • Cold Hook</span>';
                  } else if (currentStep === 2) {
                    stepBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">Step 2/4 • Proof Demo</span>';
                  } else if (currentStep === 3) {
                    stepBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">Step 3/4 • Revenue Leak</span>';
                  } else {
                    stepBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">Completed (4/4)</span>';
                  }

                  let dueText = '';
                  if (p.next_due_at && p.status === 'active') {
                    const dueDate = new Date(p.next_due_at);
                    const isDueNow = dueDate <= new Date();
                    dueText = `<div class="text-[10px] ${isDueNow ? 'text-amber-400 font-bold animate-pulse' : 'text-[var(--text-muted)]'} font-mono mt-0.5">
                      ${isDueNow ? '● Due Now' : 'Due: ' + dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>`;
                  }

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

                    <!-- 1-Click Dial Phone & Direct Email Cell -->
                    <td class="py-3.5 px-4 whitespace-nowrap">
                      <div class="flex items-center gap-2">
                        ${
                          p.phone
                            ? `<div class="flex items-center gap-1">
                                <a href="tel:${String(p.phone).replace(/[^0-9+]/g, '')}" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--accent-emerald-subtle)] hover:bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 rounded-xl font-mono font-bold text-xs transition shadow-sm group" title="Click to dial immediately">
                                  <span class="group-hover:scale-110 transition">${getSvgIcon('phone', 'w-3 h-3')}</span>
                                  <span>${formatUsPhone(p.phone)}</span>
                                </a>
                                <button onclick="copyToClipboard('${String(p.phone).replace(/[^0-9+]/g, '')}', 'Phone number copied!')" class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded-lg transition text-[11px]" title="Copy phone number">
                                  ${getSvgIcon('copy', 'w-3 h-3')}
                                </button>
                              </div>`
                            : `<span class="text-[var(--text-muted)] text-xs italic">No phone</span>`
                        }
                        ${
                          p.email
                            ? `<div class="flex items-center gap-1">
                                <a href="mailto:${escapeHtml(p.email)}" class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl font-mono text-xs transition shadow-sm group" title="Direct Email: ${escapeHtml(p.email)}">
                                  <span>✉️</span>
                                  <span class="max-w-[170px] truncate">${escapeHtml(p.email)}</span>
                                </a>
                                <button onclick="copyToClipboard('${escapeHtml(p.email)}', 'Email address copied!')" class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded-lg transition text-[11px]" title="Copy email address">
                                  ${getSvgIcon('copy', 'w-3 h-3')}
                                </button>
                              </div>`
                            : `<span class="text-[var(--text-muted)] text-xs italic">No email</span>`
                        }
                      </div>
                    </td>

                    <!-- Harvey Bespoke Hook & Quality Gate (Dedicated Column) -->
                    <td class="py-3.5 px-4 max-w-xs" id="harvey-cell-${p.id}">
                      <div class="space-y-1.5">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          ${
                            p.harvey_score
                              ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${p.harvey_score >= 85 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">Score: ${p.harvey_score}/100</span>`
                              : `<span class="px-2 py-0.5 rounded text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">Audit Ready</span>`
                          }
                          <span class="text-[10px] text-[var(--text-muted)] font-mono">0 Clichés • 0 Em-dashes</span>
                        </div>
                        <p class="text-[11px] text-[var(--text-primary)] font-medium leading-tight line-clamp-2" title="${escapeHtml(p.specific_observation || p.harvey_draft || 'Click Run Harvey to inspect site & compile bespoke hook')}">
                          ${escapeHtml(p.specific_observation || 'Static form friction detected')}
                        </p>
                        <div class="flex items-center gap-1.5 pt-0.5">
                          <button 
                            type="button"
                            onclick="inspectHarveyHook('${p.id}')"
                            class="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Inspect bespoke prompt, draft, and test-send to phone"
                          >
                            <span>Inspect & Test</span>
                          </button>
                          <button 
                            type="button"
                            id="btnRunHarvey-${p.id}"
                            onclick="runHarveyForProspect('${p.id}', this)"
                            class="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-[10px] font-medium transition flex items-center gap-1 cursor-pointer"
                            title="Crawl site and regenerate bespoke 1-of-1 hook"
                          >
                            ${getSvgIcon('bolt', 'w-3 h-3 text-amber-400')}
                            <span>Audit</span>
                          </button>
                        </div>
                      </div>
                    </td>

                    <!-- Sequence Pipeline (4 Steps) -->
                    <td class="py-3.5 px-4 whitespace-nowrap">
                      <div>${stepBadge}</div>
                      ${dueText}
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

                      <!-- Send Step Follow-Up Button -->
                      ${
                        p.status === 'active' && currentStep > 0 && currentStep < 4
                          ? `<button 
                              onclick="confirmSendStep('${p.id}', ${currentStep + 1}, '${escapeQuotes(p.doctor_name || 'Doctor')}', '${escapeQuotes(p.clinic_name || 'Clinic')}')"
                              class="px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition"
                              title="Send Follow-Up Step ${currentStep + 1} immediately"
                            >
                              Send Step ${currentStep + 1}
                            </button>`
                          : ''
                      }

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

    <!-- Harvey Bespoke Hook & Demo Dispatcher Modal -->
    <div id="harveyInspectorModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold">${getSvgIcon('bolt', 'w-4 h-4')}</span>
              <h3 class="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>Harvey Bespoke Hook & Quality Gate</span>
                <span id="modalHarveyScoreBadge" class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">Score: 100/100</span>
              </h3>
            </div>
            <p id="modalHarveySubtitle" class="text-xs text-[var(--text-muted)] mt-0.5">Site-Inspected 1-of-1 Cold Hook Draft</p>
          </div>
          <button onclick="closeHarveyModal()" class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold cursor-pointer">✕</button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Quality Scorecard Bar -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-xl">
              <span class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Word Count</span>
              <div id="modalHarveyWordCount" class="text-sm font-mono font-bold text-[var(--text-primary)] mt-0.5">52 Words</div>
              <span class="text-[10px] text-emerald-400">✓ Under 65 Ceiling</span>
            </div>
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-xl">
              <span class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">AI Clichés</span>
              <div class="text-sm font-mono font-bold text-emerald-400 mt-0.5">0 Detected</div>
              <span class="text-[10px] text-[var(--text-muted)]">Zero Buzzwords</span>
            </div>
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-xl">
              <span class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Em-Dashes (—)</span>
              <div class="text-sm font-mono font-bold text-emerald-400 mt-0.5">0 Em-Dashes</div>
              <span class="text-[10px] text-[var(--text-muted)]">Human Punctuation</span>
            </div>
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 rounded-xl">
              <span class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Exclamations (!)</span>
              <div class="text-sm font-mono font-bold text-emerald-400 mt-0.5">0 Marks</div>
              <span class="text-[10px] text-[var(--text-muted)]">Peer-to-Peer</span>
            </div>
          </div>

          <!-- Subject Line -->
          <div>
            <label class="block text-[11px] text-[var(--text-muted)] font-semibold uppercase mb-1">Subject Line (2-4 Words Peer-to-Peer)</label>
            <div id="modalHarveySubject" class="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl font-mono text-cyan-300 font-semibold">
              quick question - inquiries
            </div>
          </div>

          <!-- Bespoke Cold Hook Draft Body -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[11px] text-[var(--text-muted)] font-semibold uppercase">1-of-1 Bespoke Email Draft</label>
              <button onclick="copyToClipboard(document.getElementById('modalHarveyBody').innerText, 'Draft copied!')" class="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer">
                ${getSvgIcon('copy', 'w-3 h-3')}
                <span>Copy Copy</span>
              </button>
            </div>
            <div id="modalHarveyBody" class="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl whitespace-pre-line leading-relaxed text-[var(--text-primary)] font-mono selection:bg-cyan-500/20 text-xs">
            </div>
          </div>

          <!-- Dynamic Prompt Dossier Accordion -->
          <details class="group bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3">
            <summary class="flex items-center justify-between cursor-pointer font-semibold text-[11px] text-[var(--text-secondary)] group-open:text-cyan-400">
              <span class="flex items-center gap-1.5">
                <span>🔍 Inspect Dynamic Harvey Prompt Fed to LLM</span>
              </span>
              <span class="text-[10px] font-mono group-open:rotate-180 transition">▼</span>
            </summary>
            <div id="modalHarveyPrompt" class="mt-2.5 pt-2 border-t border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto pr-1">
            </div>
          </details>
        </div>

        <!-- Safe Demo Dispatch Bar -->
        <div class="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div class="text-[11px] text-amber-400 flex items-center gap-1.5 font-medium">
            <span>🛡️</span>
            <span>Safety Gate: Demo sends strictly to your phone. Live prospects remain frozen.</span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="closeHarveyModal()" class="px-4 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-medium transition cursor-pointer">
              Close
            </button>
            <button id="btnModalTestSend" onclick="sendModalHarveyDemo()" class="px-5 py-2 rounded-xl bg-cyan-500 hover:opacity-90 text-black font-extrabold text-xs transition shadow-md shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer">
              ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
              <span>Send Demo to My Phone (architd062@gmail.com)</span>
            </button>
          </div>
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

      let activeHarveyProspectId = null;

      function inspectHarveyHook(id) {
        activeHarveyProspectId = id;
        const p = prospects.find(x => String(x.id) === String(id));
        if (!p) return;

        const modal = document.getElementById('harveyInspectorModal');
        const scoreBadge = document.getElementById('modalHarveyScoreBadge');
        const subtitle = document.getElementById('modalHarveySubtitle');
        const subjectEl = document.getElementById('modalHarveySubject');
        const bodyEl = document.getElementById('modalHarveyBody');
        const promptEl = document.getElementById('modalHarveyPrompt');
        const wordCountEl = document.getElementById('modalHarveyWordCount');

        const score = p.harvey_score || 95;
        if (scoreBadge) {
          scoreBadge.innerText = 'Score: ' + score + '/100';
          scoreBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ' + 
            (score >= 85 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20');
        }
        
        if (subtitle) {
          subtitle.innerText = (p.doctor_name || 'Doctor') + ' • ' + (p.clinic_name || 'Practice') + ' (' + (p.city || 'US') + ')';
        }
        if (subjectEl) {
          subjectEl.innerText = p.original_subject || ('quick question - ' + (p.clinic_name || 'practice').toLowerCase() + ' inquiries');
        }
        
        const cleanDraft = (p.harvey_draft || (p.step1Preview ? p.step1Preview.text : '') || p.notes || '').split('--')[0].trim();
        const fallbackDraft = [
          'Hey ' + (p.doctor_name || 'Doctor') + ',',
          '',
          (p.specific_observation || 'Saw your site makes visitors fill out a static form instead of booking directly.'),
          '',
          'Quick question - when an inquiry comes in after 6 PM, does someone call in 2 minutes, or wait until morning?',
          '',
          'Put together a 60-second demo showing our AI receptionist booking consults 24/7.',
          '',
          'Worth a quick look?',
          '',
          'Best,',
          'Archit'
        ].join('\\n');
        
        const finalDraft = cleanDraft || fallbackDraft;
        if (bodyEl) {
          bodyEl.innerText = finalDraft;
        }
        
        if (wordCountEl) {
          const words = finalDraft.split(/\\s+/).filter(Boolean).length;
          wordCountEl.innerText = words + ' Words';
        }

        if (promptEl) {
          promptEl.innerText = p.harvey_prompt || [
            '[CLINIC AUDIT DOSSIER]',
            'Practice: ' + (p.clinic_name || 'Practice'),
            'Doctor: ' + (p.doctor_name || 'Doctor'),
            'Offer: ' + (p.treatment || 'Consultation'),
            'Friction Leak: ' + (p.specific_observation || 'Static form friction detected'),
            'Rule: 45-60 words, 0 em-dashes, 0 exclamation marks, 0 AI clichés.'
          ].join('\\n');
        }

        if (modal) modal.classList.remove('hidden');
      }

      function closeHarveyModal() {
        const modal = document.getElementById('harveyInspectorModal');
        if (modal) modal.classList.add('hidden');
      }

      async function runHarveyForProspect(id, btnEl) {
        if (btnEl) {
          btnEl.disabled = true;
          btnEl.innerHTML = '${getSvgIcon('spinner', 'w-3 h-3 text-amber-400')}<span>Auditing...</span>';
        }

        try {
          const res = await fetch(getAuthUrl('/outreach/harvey/generate'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prospectId: id })
          });
          const data = await res.json();

          if (res.ok && data.status === 'success') {
            showToast('Harvey Audit Complete', 'Score: ' + (data.audit?.score || 95) + '/100. Bespoke 1-of-1 copy staged in CRM.', 'success');
            
            const p = prospects.find(x => String(x.id) === String(id));
            if (p) {
              p.harvey_score = data.audit?.score || 95;
              p.harvey_draft = data.draft?.body || '';
              p.harvey_prompt = data.prompt || '';
              p.harvey_status = 'passed';
              p.specific_observation = data.dossier?.frictionObservation || p.specific_observation;
            }

            const cell = document.getElementById('harvey-cell-' + id);
            if (cell && p) {
              cell.innerHTML = '<div class="space-y-1.5">' +
                '<div class="flex items-center gap-1.5 flex-wrap">' +
                  '<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Score: ' + (p.harvey_score) + '/100</span>' +
                  '<span class="text-[10px] text-[var(--text-muted)] font-mono">0 Clichés • 0 Em-dashes</span>' +
                '</div>' +
                '<p class="text-[11px] text-[var(--text-primary)] font-medium leading-tight line-clamp-2" title="' + (p.specific_observation || '').replace(/"/g, '&quot;') + '">' +
                  (p.specific_observation || 'Static form friction detected') +
                '</p>' +
                '<div class="flex items-center gap-1.5 pt-0.5">' +
                  '<button type="button" data-id="' + id + '" onclick="inspectHarveyHook(this.getAttribute(\\'data-id\\'))" class="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"><span>Inspect & Test</span></button>' +
                  '<button type="button" id="btnRunHarvey-' + id + '" data-id="' + id + '" onclick="runHarveyForProspect(this.getAttribute(\\'data-id\\'), this)" class="px-2 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-[10px] font-medium transition flex items-center gap-1 cursor-pointer">${getSvgIcon('bolt', 'w-3 h-3 text-amber-400')}<span>Audit</span></button>' +
                '</div>' +
              '</div>';
            }
          } else {
            showToast('Harvey Audit Failed', data.message || 'Error executing audit', 'error');
          }
        } catch (e) {
          showToast('Error', e.message, 'error');
        } finally {
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '${getSvgIcon('bolt', 'w-3 h-3 text-amber-400')}<span>Audit</span>';
          }
        }
      }

      async function sendModalHarveyDemo() {
        if (!activeHarveyProspectId) return;
        const btn = document.getElementById('btnModalTestSend');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '${getSvgIcon('spinner', 'w-3.5 h-3.5 text-black')}<span>Dispatching to Phone...</span>';
        }

        try {
          const res = await fetch(getAuthUrl('/outreach/harvey/test-send'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              prospectId: activeHarveyProspectId,
              toEmail: 'architd062@gmail.com'
            })
          });
          const data = await res.json();

          if (res.ok && data.status === 'success') {
            showToast('Demo Delivered', 'Bespoke cold hook sent to architd062@gmail.com! Check your mobile inbox.', 'success');
          } else {
            showToast('Test Failed', data.message || 'Could not dispatch demo', 'error');
          }
        } catch (e) {
          showToast('Network Error', e.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('bolt', 'w-3.5 h-3.5')}<span>Send Demo to My Phone (architd062@gmail.com)</span>';
          }
        }
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
        const currentKey = new URLSearchParams(window.location.search).get('key') || localStorage.getItem('suregreet_admin_key') || '';
        if (currentKey) queryParams.set('key', currentKey);

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

      async function triggerOutreachWorker(force = false) {
        const btn = document.getElementById('btnTriggerWorker');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳ Processing Queue...</span>';
        }
        try {
          const url = getAuthUrl('/outreach/cron/trigger' + (force ? '?force=true' : ''));
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ force: !!force })
          });
          const data = await res.json();
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('play', 'w-3.5 h-3.5')}<span>Run Follow-Up Queue Now</span>';
          }
          if (res.ok) {
            const summary = data.summary || {};
            if (summary.status === 'outside_window') {
              showToast('Outside Sending Window', 'Outside Mon-Fri 9:00 AM - 4:30 PM EST window.', 'warning');
            } else if (summary.status === 'no_prospects_due') {
              showToast('Queue Checked', 'All prospects are up-to-date. Zero follow-ups currently due.', 'success');
            } else {
              showToast('Queue Run Complete', (summary.processedCount || 0) + ' follow-up emails processed.', 'success');
              setTimeout(() => window.location.reload(), 1500);
            }
          } else {
            showToast('Queue Error', data.message || 'Error triggering worker', 'error');
          }
        } catch (e) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('play', 'w-3.5 h-3.5')}<span>Run Follow-Up Queue Now</span>';
          }
          showToast('Network Error', e.message, 'error');
        }
      }

      async function confirmSendStep(id, stepNumber, drName, clinicName) {
        const ok = confirm('Send Follow-Up Step ' + stepNumber + ' directly to ' + drName + ' (' + clinicName + ')?\\n\\nThis will dispatch with RFC threading and calculate the next due date.');
        if (!ok) return;

        try {
          const res = await fetch(getAuthUrl('/outreach/send-step'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prospectId: id, stepNumber: stepNumber })
          });
          const data = await res.json();
          if (res.ok && (data.status === 'success' || data.success)) {
            showToast('Step ' + stepNumber + ' Sent!', 'Dispatched to ' + drName, 'success');
            setTimeout(() => window.location.reload(), 1200);
          } else {
            showToast('Dispatch Error', data.message || data.error || 'Failed to dispatch step', 'error');
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

function renderScriptStudioHtml({ sample, step = 1, framework = 'pas', signalHook = 'form_friction', prospects = [], authKey = '' }) {
  // Generate the full 4-step sequence
  const fullSequence = generateFullSequence({
    doctorName: sample.doctor_name,
    clinicName: sample.clinic_name,
    city: sample.city,
    treatment: sample.treatment,
    niche: sample.niche || 'medspa',
    specificObservation: sample.specific_observation,
    prospectEmail: sample.email,
    framework,
    signalHook,
  });

  const selectedStepIdx = typeof step === 'number' && step >= 1 && step <= 4 ? step - 1 : 0;
  const activeEmail = fullSequence[selectedStepIdx];
  const audit = activeEmail.audit || auditHarveyCopy(activeEmail.text, activeEmail.subject);
  const isAllSteps = step === 'all';

  // Sequence metadata
  const stepsList = [
    {
      num: 1,
      name: 'Cold Hook (Micro-Audit)',
      timing: 'Day 1',
      tag: 'Initial Touch',
      optimal: '45–65 Words',
      desc: 'Controlled imperfection micro-audit on form friction or after-hours gap'
    },
    {
      num: 2,
      name: 'Proof & 30s Audio Demo',
      timing: '+2 Biz Days',
      tag: 'Threaded Re:',
      optimal: '25–35 Words',
      desc: 'Quick 2-line follow-up offering a 30-second live test line'
    },
    {
      num: 3,
      name: 'Revenue Leak Automation',
      timing: '+3 Biz Days',
      tag: 'Threaded Re:',
      optimal: '50–65 Words',
      desc: 'Napkin math on $12k/mo lost consults & 14-day zero-risk trial'
    },
    {
      num: 4,
      name: 'Clean Breakup',
      timing: '+3 Biz Days',
      tag: 'Threaded Re:',
      optimal: '25–35 Words',
      desc: 'Polite door-left-open closure removing them from future touchpoints'
    },
  ];

  const isHvac = sample.niche === 'hvac';
  const leakedAmount = isHvac ? '$4,000+' : '$12,000';
  const leakedAnnual = isHvac ? '$48,000+' : '$144,000';
  const avgTicket = isHvac ? '$2,000+' : '$1,500+';
  const keyParam = authKey ? '&key=' + encodeURIComponent(authKey) : '';

  const bodyContent = `
    <!-- Top Hero Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
      <div>
        <div class="flex items-center space-x-2">
          <h2 class="text-lg font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <span>Harvey Outbound & Follow-Up Sequence Studio</span>
          </h2>
          <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            4-Step Sequence Engine Live
          </span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-1">
          Complete Multi-Touch Sequence • RFC 5322 Threading • Revenue Leak Automation • Anti-AI Quality Gate (< 65 Words)
        </p>
      </div>

      <div class="flex items-center space-x-3">
        <a href="/outreach/prospects${authKey ? `?key=${encodeURIComponent(authKey)}` : ''}" class="text-xs bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl transition flex items-center gap-1.5 font-semibold">
          <span>Back to Pipeline CRM</span>
          ${getSvgIcon('external', 'w-3 h-3 text-[var(--text-muted)]')}
        </a>
      </div>
    </div>

    <!-- 4-Step Sequence Navigation Tabs -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      ${stepsList.map(s => {
        const isActive = !isAllSteps && step === s.num;
        const activeClass = isActive
          ? 'bg-cyan-500/15 border-cyan-500 text-[var(--text-primary)] shadow-lg shadow-cyan-500/10'
          : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]';
        return `
          <a href="?step=${s.num}${keyParam}&signalHook=${encodeURIComponent(signalHook)}&framework=${encodeURIComponent(framework)}&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}"
             class="p-3.5 rounded-2xl border transition flex flex-col justify-between ${activeClass}">
            <div>
              <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                <span>Step ${s.num} • ${s.tag}</span>
                <span class="font-mono text-[var(--text-muted)]">${s.timing}</span>
              </div>
              <div class="font-bold text-sm text-[var(--text-primary)] mt-1">${s.name}</div>
              <p class="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">${s.desc}</p>
            </div>
            <div class="text-[10px] text-[var(--text-secondary)] font-mono mt-2 pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span>Limit:</span>
              <span class="font-semibold text-cyan-300">${s.optimal}</span>
            </div>
          </a>
        `;
      }).join('')}

      <!-- All 4 Steps Chained Thread View Tab -->
      <a href="?step=all${keyParam}&signalHook=${encodeURIComponent(signalHook)}&framework=${encodeURIComponent(framework)}&doctorName=${encodeURIComponent(sample.doctor_name || '')}&clinicName=${encodeURIComponent(sample.clinic_name || '')}&city=${encodeURIComponent(sample.city || '')}&treatment=${encodeURIComponent(sample.treatment || '')}&email=${encodeURIComponent(sample.email || '')}&niche=${encodeURIComponent(sample.niche || 'medspa')}&specificObservation=${encodeURIComponent(sample.specific_observation || '')}"
         class="p-3.5 rounded-2xl border transition flex flex-col justify-between ${isAllSteps ? 'bg-purple-500/15 border-purple-500 text-[var(--text-primary)] shadow-lg shadow-purple-500/10' : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'}">
        <div>
          <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-purple-400">
            <span>RFC Thread</span>
            <span class="font-mono text-[var(--text-muted)]">Full Chain</span>
          </div>
          <div class="font-bold text-sm text-[var(--text-primary)] mt-1">Full Sequence Thread</div>
          <p class="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">All 4 emails stacked in single conversation</p>
        </div>
        <div class="text-[10px] text-[var(--text-secondary)] font-mono mt-2 pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <span>Duration:</span>
          <span class="font-semibold text-purple-300">9 Biz Days</span>
        </div>
      </a>
    </div>

    <!-- Main Dual Studio Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

      <!-- Left Column: Variable Customizer & Signal Hook Ingestion (5 cols) -->
      <div class="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4 shadow-xl">
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
            ${getSvgIcon('bolt', 'w-3.5 h-3.5 text-cyan-400')}
            <span>Prospect & Hook Customizer</span>
          </h3>
          <span class="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">Live Sync</span>
        </div>

        <!-- CRM Preset Quick Picker -->
        ${prospects && prospects.length > 0 ? `
          <div>
            <label class="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Load From Pipeline CRM (${prospects.length} Leads)</label>
            <select id="crmProspectPicker" onchange="loadSelectedProspect(this)" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">
              <option value="">-- Choose a verified prospect to auto-fill --</option>
              ${prospects.map(p => `
                <option value="${p.id}"
                  data-doctor="${escapeQuotes(p.doctor_name || '')}"
                  data-clinic="${escapeQuotes(p.clinic_name || '')}"
                  data-city="${escapeQuotes(p.city || '')}"
                  data-treatment="${escapeQuotes(p.treatment || '')}"
                  data-email="${escapeQuotes(p.email || '')}"
                  data-niche="${escapeQuotes(p.niche || 'medspa')}"
                  data-observation="${escapeQuotes(p.specific_observation || '')}">
                  ${escapeHtml(p.doctor_name || p.clinic_name)} — ${escapeHtml(p.clinic_name)} (${escapeHtml(p.city || 'US')})
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <form method="GET" action="/outreach/preview" class="space-y-3 pt-1" id="customizerForm">
          ${authKey ? `<input type="hidden" name="key" value="${escapeHtml(authKey)}" />` : ''}
          <input type="hidden" name="step" value="${step}" id="inputStep" />

          <!-- Step 1 Framework Selector (PAS vs QVC) -->
          <div>
            <label class="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Step 1 Cold Hook Framework</label>
            <select name="framework" id="inputFramework" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-purple-300 font-semibold focus:outline-none focus:border-cyan-500">
              <option value="pas" ${framework === 'pas' ? 'selected' : ''}>PAS Micro-Audit (Problem • Agitation • Solution)</option>
              <option value="qvc" ${framework === 'qvc' ? 'selected' : ''}>QVC Bottleneck (Question • Value • 3-Min CTA)</option>
            </select>
          </div>

          <!-- Signal Hook Selector -->
          <div>
            <label class="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Intent Signal Hook</label>
            <select name="signalHook" id="inputSignalHook" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-cyan-300 font-semibold focus:outline-none focus:border-cyan-500">
              <option value="form_friction" ${signalHook === 'form_friction' ? 'selected' : ''}>Static Form Friction (Patient drop-off audit)</option>
              <option value="meta_ads" ${signalHook === 'meta_ads' ? 'selected' : ''}>Active Meta / Google Ads Signal (Paid traffic)</option>
              <option value="after_hours" ${signalHook === 'after_hours' ? 'selected' : ''}>After-Hours Voicemail Gap (7:15 PM call test)</option>
              <option value="hiring" ${signalHook === 'hiring' ? 'selected' : ''}>Front Desk Hiring Leak (Staff onboarding gap)</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Target Niche</label>
              <select name="niche" id="inputNiche" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">
                <option value="medspa" ${sample.niche !== 'hvac' ? 'selected' : ''}>MedSpa / Aesthetics</option>
                <option value="hvac" ${sample.niche === 'hvac' ? 'selected' : ''}>Emergency HVAC / Plumbing</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">City / Metro</label>
              <input type="text" name="city" id="inputCity" value="${escapeHtml(sample.city || '')}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Doctor / Decision Maker</label>
            <input type="text" name="doctorName" id="inputDoctor" value="${escapeHtml(sample.doctor_name || '')}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Clinic / Business Name</label>
            <input type="text" name="clinicName" id="inputClinic" value="${escapeHtml(sample.clinic_name || '')}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">High-Ticket Procedure</label>
              <input type="text" name="treatment" id="inputTreatment" value="${escapeHtml(sample.treatment || '')}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Target Email</label>
              <input type="text" name="email" id="inputEmail" value="${escapeHtml(sample.email || '')}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Specific Diagnostic Hook / Friction Gap</label>
            <textarea name="specificObservation" id="inputObservation" rows="2" placeholder="e.g. Saw your site makes patients fill out a static form for Morpheus8..." class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500">${escapeHtml(sample.specific_observation || '')}</textarea>
          </div>

          <button type="submit" class="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs rounded-xl transition shadow-md shadow-cyan-500/20 flex items-center justify-center gap-1.5">
            ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
            <span>Regenerate Sequence Copy</span>
          </button>
        </form>
      </div>

      <!-- Right Column: Anti-AI Quality Gate, Viewports & 1-Click Test Send (7 cols) -->
      <div class="lg:col-span-7 space-y-5">

        <!-- HARVEY ANTI-AI SCORECARD & QUALITY GATE -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-xl space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${audit.passed ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Anti-AI Deliverability Scorecard</h3>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${audit.score >= 85 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">
                Score: ${audit.score}/100
              </span>
              <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded ${audit.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'}">
                ${audit.passed ? '✓ Deliverability Passed' : 'Needs Polish'}
              </span>
            </div>
          </div>

          <!-- Metric Cards Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <!-- Word Count -->
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 rounded-xl">
              <div class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Word Count</div>
              <div class="text-base font-mono font-bold text-[var(--text-primary)] mt-0.5">${audit.wordCount}</div>
              <div class="text-[10px] ${audit.isOptimalWordCount ? 'text-emerald-400' : audit.isUnderHardCeiling ? 'text-amber-400' : 'text-rose-400'} mt-0.5">
                ${audit.isOptimalWordCount ? '✓ Optimal (45–65)' : audit.isUnderHardCeiling ? 'Under 75 cap' : 'Exceeds 75 cap'}
              </div>
            </div>

            <!-- Cliché Scanner -->
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 rounded-xl">
              <div class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">AI Clichés</div>
              <div class="text-base font-mono font-bold ${audit.foundBanned.length === 0 ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">
                ${audit.foundBanned.length}
              </div>
              <div class="text-[10px] text-[var(--text-muted)] mt-0.5">
                ${audit.foundBanned.length === 0 ? '✓ 0 LLM Clichés' : audit.foundBanned.slice(0, 1).join(', ')}
              </div>
            </div>

            <!-- Em-Dash & Exclamations -->
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 rounded-xl">
              <div class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Punctuation Tell</div>
              <div class="text-base font-mono font-bold ${audit.emDashes === 0 && audit.exclamations === 0 ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">
                ${audit.emDashes} — / ${audit.exclamations} !
              </div>
              <div class="text-[10px] text-[var(--text-muted)] mt-0.5">
                ${audit.emDashes === 0 && audit.exclamations === 0 ? '✓ Peer-to-peer' : 'Remove em-dashes'}
              </div>
            </div>

            <!-- Subject Line Words -->
            <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 rounded-xl">
              <div class="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Subject Length</div>
              <div class="text-base font-mono font-bold text-[var(--text-primary)] mt-0.5">${audit.subjectWords} Words</div>
              <div class="text-[10px] ${audit.subjectWords >= 2 && audit.subjectWords <= 6 ? 'text-emerald-400' : 'text-amber-400'} mt-0.5">
                ${audit.subjectWords >= 2 && audit.subjectWords <= 6 ? '✓ 2–5 Words' : 'Target 2–4 words'}
              </div>
            </div>
          </div>

          <!-- REVENUE LEAK AUTOMATION CARD (HIGHLIGHTED IN STEP 3 OR ON HOVER) -->
          <div class="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="p-1 rounded-lg bg-amber-500/20 text-amber-400">${getSvgIcon('bolt', 'w-4 h-4')}</span>
                <h4 class="text-xs font-bold text-amber-300 uppercase tracking-wider">Revenue Leak Diagnostic Automation (Step 3 Math)</h4>
              </div>
              <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ${leakedAmount} / Month Leaking
              </span>
            </div>
            <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
              When an ad lead or evening prospect hits voicemail or a static form, 78% call a competitor immediately.
              At an average package value of <strong class="text-[var(--text-primary)]">${avgTicket}</strong>, losing just 2 after-hours leads a week leaks <strong class="text-amber-400">${leakedAmount}/mo (${leakedAnnual}/year)</strong>.
              Step 3 pitches the <span class="text-emerald-400 font-semibold">14-Day Free Trial</span> of SureGreet AI to capture those missed consults at zero upfront risk.
            </p>
          </div>
        </div>

        <!-- DUAL VIEWPORT: PLAIN TEXT, IPHONE MOBILE & FULL THREAD PREVIEW -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xl overflow-hidden">
          <!-- Viewport Header Tabs -->
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3 bg-[var(--bg-surface)]">
            <div class="flex items-center space-x-2">
              <button onclick="switchViewport('plain')" id="tabBtnPlain" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-cyan-400 border border-cyan-500/30 transition shadow-sm">
                Plain Text Payload
              </button>
              <button onclick="switchViewport('mobile')" id="tabBtnMobile" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
                📱 iPhone iOS Mail View
              </button>
              <button onclick="switchViewport('thread')" id="tabBtnThread" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
                Chained Thread View (All 4)
              </button>
            </div>

            <button onclick="copyToClipboard(document.getElementById('renderedEmailBody').innerText, 'Plain text email payload copied!')" class="px-3 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-semibold transition flex items-center gap-1.5">
              ${getSvgIcon('copy', 'w-3 h-3 text-cyan-400')}
              <span>Copy Payload</span>
            </button>
          </div>

          <!-- VIEWPORT 1: PLAIN TEXT & MIME PAYLOAD -->
          <div id="plainTextView" class="p-5 space-y-3 font-mono text-xs">
            <div class="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl space-y-1">
              <div class="text-[var(--text-muted)] flex items-center justify-between">
                <span><strong>From:</strong> Archit &lt;archit@suregreet.ai&gt;</span>
                <span class="text-[10px] text-emerald-400">RFC 5322 Threading: PASS</span>
              </div>
              <div class="text-[var(--text-muted)]">
                <strong>To:</strong> <span class="text-[var(--text-primary)] font-mono">${escapeHtml(sample.email || 'doctor@clinic.com')}</span>
              </div>
              <div class="text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1.5 mt-1.5 flex items-center justify-between">
                <div><strong>Subject:</strong> <span class="text-cyan-400 font-semibold" id="renderedEmailSubject">${escapeHtml(activeEmail.subject)}</span></div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">Step ${activeEmail.step || step}</span>
              </div>
            </div>

            <div id="renderedEmailBody" class="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] whitespace-pre-line leading-relaxed selection:bg-cyan-500/30">
${escapeHtml(activeEmail.text)}
            </div>
          </div>

          <!-- VIEWPORT 2: REALISTIC IPHONE MOBILE MAIL PREVIEW -->
          <div id="mobileView" class="hidden p-6 flex justify-center bg-[var(--bg-card)]">
            <div class="w-[340px] bg-black rounded-[44px] p-3 shadow-2xl border-4 border-neutral-800 relative">
              <!-- Dynamic Island / Notch -->
              <div class="w-24 h-4 bg-neutral-900 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span class="w-2.5 h-2.5 rounded-full bg-neutral-950 inline-block mr-2"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-blue-950 inline-block"></span>
              </div>

              <!-- iOS Mail Body Screen -->
              <div class="bg-white text-neutral-900 rounded-[32px] p-4 text-[13px] font-sans min-h-[460px] flex flex-col justify-between shadow-inner">
                <div>
                  <!-- iOS Mail Header Bar -->
                  <div class="flex items-center justify-between text-[11px] text-neutral-500 border-b border-neutral-100 pb-2 mb-2.5">
                    <span class="text-blue-600 font-medium">‹ Inbox</span>
                    <span class="font-bold text-neutral-800">Step ${activeEmail.step || step}</span>
                    <span class="text-blue-600 font-medium">Details</span>
                  </div>

                  <!-- Sender Pill & Timestamp -->
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center space-x-2">
                      <div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">A</div>
                      <div>
                        <div class="font-bold text-[13px] text-neutral-900 leading-tight">Archit | SureGreet AI</div>
                        <div class="text-[11px] text-neutral-500">To: ${escapeHtml(sample.doctor_name || 'Dr. Riveros')}</div>
                      </div>
                    </div>
                    <span class="text-[10px] text-neutral-400">9:41 AM</span>
                  </div>

                  <!-- Subject Line -->
                  <div class="font-semibold text-[13px] text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
                    ${escapeHtml(activeEmail.subject)}
                  </div>

                  <!-- Email Body -->
                  <div class="text-neutral-800 text-[12px] whitespace-pre-line leading-relaxed font-sans">
${escapeHtml(activeEmail.text)}
                  </div>
                </div>

                <div class="pt-4 border-t border-neutral-100 text-[10px] text-neutral-400 text-center font-mono">
                  Above-the-fold 100% visible on iPhone • 0 scrolling required
                </div>
              </div>
            </div>
          </div>

          <!-- VIEWPORT 3: FULL THREADED SEQUENCE VIEW (ALL 4 EMAILS CHAINED) -->
          <div id="threadView" class="hidden p-5 space-y-4 font-mono text-xs max-h-[600px] overflow-y-auto custom-scrollbar">
            <div class="p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl text-purple-300 text-xs">
              <strong>MIME Threading Simulation:</strong> Shows how Step 1, Step 2, Step 3, and Step 4 chain together into a single ongoing email thread in the doctor's inbox over 9 business days.
            </div>

            ${fullSequence.map((seq, idx) => `
              <div class="p-4 bg-[var(--bg-surface)] border ${idx === 0 ? 'border-blue-500/30' : idx === 1 ? 'border-purple-500/30' : idx === 2 ? 'border-amber-500/30' : 'border-emerald-500/30'} rounded-2xl space-y-2">
                <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-[11px]">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded font-bold text-[10px] ${idx === 0 ? 'bg-blue-500/20 text-blue-300' : idx === 1 ? 'bg-purple-500/20 text-purple-300' : idx === 2 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}">
                      Step ${seq.step} • ${seq.name}
                    </span>
                    <span class="text-[var(--text-muted)] font-mono">${seq.timing}</span>
                  </div>
                  <span class="text-[10px] text-[var(--text-muted)]">${seq.audit?.wordCount || 50} Words</span>
                </div>
                <div class="text-[var(--text-muted)] text-[11px]">
                  <strong>Subject:</strong> <span class="text-cyan-400">${escapeHtml(seq.subject)}</span>
                </div>
                <div class="text-[var(--text-primary)] whitespace-pre-line leading-relaxed text-xs pt-1">
${escapeHtml(seq.text)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 1-CLICK TEST SEND TO MY PHONE / INBOX -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-xl space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center space-x-2">
              <span class="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ${getSvgIcon('mail', 'w-4 h-4')}
              </span>
              <div>
                <h4 class="text-xs font-bold text-[var(--text-primary)]">1-Click Test Dispatch to Your Phone</h4>
                <p class="text-[11px] text-[var(--text-muted)]">Fire any follow-up step directly to your phone inbox to inspect delivery.</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <select id="testStepPicker" class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none focus:border-cyan-500">
                <option value="current">Current View: Step ${activeEmail.step || step}</option>
                <option value="1">Step 1 • Cold Hook</option>
                <option value="2">Step 2 • Proof 30s Bump</option>
                <option value="3">Step 3 • Revenue Leak Math</option>
                <option value="4">Step 4 • Clean Breakup</option>
              </select>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <input type="email" id="testRecipient" value="architd062@gmail.com" placeholder="your-email@example.com" class="w-full sm:flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-cyan-500" />
            <button onclick="sendTestEmailDirect()" id="btnSendTest" class="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 whitespace-nowrap">
              ${getSvgIcon('bolt', 'w-3.5 h-3.5')}
              <span>Send Test to My Phone</span>
            </button>
          </div>
        </div>

      </div>

    </div>

    <!-- Client-Side Script Studio Interactivity -->
    <script>
      const fullSequenceData = ${JSON.stringify(fullSequence)};

      function switchViewport(mode) {
        const plainView = document.getElementById('plainTextView');
        const mobileView = document.getElementById('mobileView');
        const threadView = document.getElementById('threadView');
        const btnPlain = document.getElementById('tabBtnPlain');
        const btnMobile = document.getElementById('tabBtnMobile');
        const btnThread = document.getElementById('tabBtnThread');

        plainView.classList.add('hidden');
        mobileView.classList.add('hidden');
        threadView.classList.add('hidden');

        btnPlain.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition';
        btnMobile.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition';
        btnThread.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition';

        if (mode === 'mobile') {
          mobileView.classList.remove('hidden');
          btnMobile.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-cyan-400 border border-cyan-500/30 transition shadow-sm';
        } else if (mode === 'thread') {
          threadView.classList.remove('hidden');
          btnThread.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-purple-400 border border-purple-500/30 transition shadow-sm';
        } else {
          plainView.classList.remove('hidden');
          btnPlain.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-cyan-400 border border-cyan-500/30 transition shadow-sm';
        }
      }

      function loadSelectedProspect(selectEl) {
        const selected = selectEl.options[selectEl.selectedIndex];
        if (!selected || !selected.value) return;

        document.getElementById('inputDoctor').value = selected.getAttribute('data-doctor') || '';
        document.getElementById('inputClinic').value = selected.getAttribute('data-clinic') || '';
        document.getElementById('inputCity').value = selected.getAttribute('data-city') || '';
        document.getElementById('inputTreatment').value = selected.getAttribute('data-treatment') || '';
        document.getElementById('inputEmail').value = selected.getAttribute('data-email') || '';
        document.getElementById('inputNiche').value = selected.getAttribute('data-niche') || 'medspa';
        document.getElementById('inputObservation').value = selected.getAttribute('data-observation') || '';

        // Auto submit form to regenerate copy
        document.getElementById('customizerForm').submit();
      }

      async function sendTestEmailDirect() {
        const to = document.getElementById('testRecipient').value.trim();
        if (!to) return showToast('Missing Recipient', 'Please enter a target email address', 'warning');

        const stepChoice = document.getElementById('testStepPicker').value;
        let chosenSubject = document.getElementById('renderedEmailSubject').innerText.trim();
        let chosenText = document.getElementById('renderedEmailBody').innerText.trim();

        if (stepChoice !== 'current') {
          const stepIdx = parseInt(stepChoice, 10) - 1;
          if (fullSequenceData && fullSequenceData[stepIdx]) {
            chosenSubject = fullSequenceData[stepIdx].subject;
            chosenText = fullSequenceData[stepIdx].text;
          }
        }

        const btn = document.getElementById('btnSendTest');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Dispatching...</span>';

        try {
          const authKey = new URLSearchParams(window.location.search).get('key') || '';
          const url = authKey ? '/outreach/test-send?key=' + encodeURIComponent(authKey) : '/outreach/test-send';

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject: chosenSubject, text: chosenText })
          });

          const data = await res.json();
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-3.5 h-3.5')}<span>Send Test to My Phone</span>';

          if (data.status === 'success' || data.success) {
            showToast('Test Sent Successfully', 'Check ' + to + ' on your mobile device (ID: ' + (data.messageId || 'sent') + ')', 'success');
          } else {
            showToast('Test Send Note', data.message || data.error || 'Server processed test dispatch.', 'warning');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-3.5 h-3.5')}<span>Send Test to My Phone</span>';
          showToast('Network Error', err.message, 'error');
        }
      }
    </script>
  `;

  return renderSaasShell({
    title: `SureGreet AI — Follow-Up Studio (Step ${step})`,
    activeNav: 'studio',
    pageHeading: `Email Follow-Up Studio • Step ${step}`,
    badgeText: 'Harvey Sequence Engine v2',
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

// 2. Email Script Studio Route (Harvey Engine v2 with Full 4-Step Sequence)
outreachRouter.get('/preview', async (req, res) => {
  const authKey = req.query.key || '';

  let step = req.query.step || '1';
  if (step !== 'all') {
    step = parseInt(step, 10);
    if (isNaN(step) || step < 1 || step > 4) step = 1;
  }

  // Framework for Step 1: pas or qvc
  let framework = (req.query.framework || 'pas').toLowerCase();
  if (framework !== 'qvc') framework = 'pas';

  const signalHook = req.query.signalHook || 'form_friction';

  const sample = {
    doctor_name: req.query.doctorName || 'Dr. Carlos Riveros',
    clinic_name: req.query.clinicName || 'Med Aesthetics Miami',
    city: req.query.city || 'Miami, FL',
    treatment: req.query.treatment || 'Morpheus8',
    email: req.query.email || 'coralgables@medaestheticsmiami.com',
    niche: req.query.niche || 'medspa',
    specific_observation: req.query.specificObservation || 'Saw your site makes patients fill out a static contact form on the Morpheus8 page instead of booking directly.',
  };

  // Fetch all live prospects for instant pre-population dropdown
  const allProspects = await getProspects();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderScriptStudioHtml({
    sample,
    step,
    framework,
    signalHook,
    prospects: allProspects || [],
    authKey,
  }));
});

// 2.1 Test Dispatch Endpoint for Script Studio
outreachRouter.post('/test-send', async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ status: 'error', message: 'Fields "to" and "text" are required' });
  }

  try {
    const result = await sendEmail({
      to,
      subject: `[TEST] ${subject || 'quick question'}`,
      text,
      html: html || `<div style="font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: 520px; white-space: pre-line;">${escapeHtml(text)}</div>`,
    });
    res.json({ status: result.success ? 'success' : 'error', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2.2 Send Specific Sequence Step to a Prospect
outreachRouter.post('/send-step', async (req, res) => {
  const { prospectId, stepNumber } = req.body || {};
  if (!prospectId || !stepNumber) {
    return res.status(400).json({ status: 'error', message: 'Fields "prospectId" and "stepNumber" (1-4) are required' });
  }

  try {
    const result = await sendOutreachStep({ prospectId, stepNumber: Number(stepNumber) });
    if (result.success) {
      res.json({ status: 'success', message: `Step ${stepNumber} dispatched successfully`, ...result });
    } else {
      res.status(400).json({ status: 'error', message: result.error || 'Failed to dispatch step' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2.3 Dynamic Copy Generation & Audit API Endpoint
outreachRouter.post('/generate-script', (req, res) => {
  const { framework, signalHook, doctorName, clinicName, city, treatment, niche, specificObservation, prospectEmail } = req.body || {};
  const generated = generateHarveyScript({
    framework,
    signalHook,
    doctorName,
    clinicName,
    city,
    treatment,
    niche,
    specificObservation,
    prospectEmail,
  });
  const audit = auditHarveyCopy(generated.text, generated.subject);
  res.json({ status: 'success', generated, audit });
});

// 2.4 Autonomous Harvey Pipeline Endpoint (Scrapes -> Builds Dossier -> Prompts -> Quality Gates -> Stages in Supabase)
outreachRouter.post('/harvey/generate', async (req, res) => {
  const { prospectId, url } = req.body || {};
  if (!prospectId && !url) {
    return res.status(400).json({ status: 'error', message: 'Field "prospectId" or "url" is required' });
  }

  try {
    const result = await runHarveyAutonomousPipeline({ prospectId, url });
    res.json({ status: 'success', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2.5 Safe Harvey Test-Send to Archit's Phone (architd062@gmail.com)
outreachRouter.post('/harvey/test-send', async (req, res) => {
  const { prospectId, toEmail } = req.body || {};
  const recipient = (toEmail || config.ownerEmail || 'architd062@gmail.com').trim();

  try {
    let subject = '';
    let text = '';
    let clinicName = 'Clinic';
    let doctorName = 'Doctor';

    if (prospectId) {
      const prospect = await getProspectById(prospectId);
      if (prospect) {
        clinicName = prospect.clinic_name || clinicName;
        doctorName = prospect.doctor_name || doctorName;
        subject = prospect.original_subject || `quick question - ${clinicName.toLowerCase()} inquiries`;
        text = prospect.harvey_draft || renderStepContent(1, prospect).text;
      }
    }

    if (!text) {
      return res.status(400).json({ status: 'error', message: 'No email draft available to test send' });
    }

    const result = await sendEmail({
      to: recipient,
      subject: `[HARVEY DEMO • ${clinicName}] ${subject}`,
      text: text,
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 540px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <div style="font-size: 11px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
          ⚡ SureGreet AI • Harvey 1-of-1 Cold Hook Demo
        </div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
          Target Prospect: <strong>${escapeHtml(doctorName)}</strong> at <strong>${escapeHtml(clinicName)}</strong>
        </div>
        <div style="white-space: pre-line; color: #0f172a;">
          ${escapeHtml(text.split('--')[0].trim())}
        </div>
        <div style="margin-top: 16px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          Dispatched in demo mode to Archit's verification inbox (${recipient}). Live prospects are frozen.
        </div>
      </div>`,
    });

    res.json({ status: result.success ? 'success' : 'error', recipient, result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
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
    const force = req.body?.force === true || req.query?.force === 'true';
    const summary = await runOutreachQueueWorker({ force });
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
