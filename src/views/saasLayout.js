/**
 * SureGreet AI — Production SaaS Layout & Navigation Component
 * Adheres strictly to ui-ux-pro-max & hallmark guidelines:
 * - Linear/Vercel-grade left sidebar navigation with mobile drawer
 * - Lucide vector SVG icons (zero structural emojis)
 * - Dual Theme Toggle (Deep Obsidian Dark #080B11 <-> Clean Slate Light #F8FAFC)
 * - Semantic CSS variables with instant localStorage persistence
 */

export function getSvgIcon(name, className = 'w-4 h-4') {
  const icons = {
    pipeline: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
    hunter: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
    bots: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
    calls: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
    inbox: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
    studio: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
    phone: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
    copy: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>`,
    external: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>`,
    check: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
    sun: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`,
    moon: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`,
    bolt: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
    play: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    shield: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
    menu: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    close: `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
  };
  return icons[name] || '';
}

/**
 * Returns the complete modern SaaS shell HTML
 */
export function renderSaasShell({
  title = 'SureGreet AI — Operating System',
  activeNav = 'pipeline',
  pageHeading = 'Pipeline CRM',
  badgeText = 'US MedSpa & HVAC',
  bodyContent = '',
  extraScripts = '',
  authKeyParam = '',
}) {
  const keyQuery = authKeyParam ? `?key=${encodeURIComponent(authKeyParam)}` : '';

  const navItems = [
    { id: 'pipeline', label: 'Pipeline CRM', href: `/outreach/prospects${keyQuery}`, icon: 'pipeline', count: '11' },
    { id: 'scraper', label: 'Lead Hunter Studio', href: `/scraper/dashboard${keyQuery}`, icon: 'hunter', count: 'Free' },
    { id: 'bots', label: 'Lead Bots Control Hub', href: `/outreach/prospects${keyQuery}#bots`, icon: 'bots', badge: '4 Bots' },
    { id: 'calls', label: 'Daily Dials & Logs', href: `/calls${keyQuery}`, icon: 'calls', count: '10 RGA' },
    { id: 'inbox', label: 'Inbox LAARC Closer', href: `/inbox/dashboard${keyQuery}`, icon: 'inbox', badge: 'Auto' },
    { id: 'studio', label: 'Email Script Studio', href: `/outreach/preview${keyQuery}`, icon: 'studio', badge: 'Harvey' },
  ];

  const sidebarLinksHtml = navItems
    .map((item) => {
      const isActive = activeNav === item.id;
      const activeClass = isActive
        ? 'bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 font-semibold shadow-sm'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent font-medium';

      return `
      <a href="${item.href}" id="nav-item-${item.id}" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition duration-150 group ${activeClass}">
        <div class="flex items-center gap-2.5">
          <span class="${isActive ? 'text-[var(--accent-emerald)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition'}">
            ${getSvgIcon(item.icon, 'w-4 h-4')}
          </span>
          <span>${item.label}</span>
        </div>
        ${
          item.count
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded-md font-mono ${isActive ? 'bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}">${item.count}</span>`
            : item.badge
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">${item.badge}</span>`
            : ''
        }
      </a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  
  <script>
    // Immediate Theme Initialization (Zero Flash)
    (function() {
      const saved = localStorage.getItem('suregreet_theme');
      if (saved === 'light') {
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
      }
    })();
  </script>

  <style>
    :root {
      --bg-base: #080B11;
      --bg-surface: #0E131F;
      --bg-card: #131A29;
      --bg-card-subtle: #0B101A;
      --bg-hover: #192236;
      --border-subtle: #1E2738;
      --border-strong: #2D3B55;
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --accent-emerald: #10B981;
      --accent-emerald-subtle: rgba(16, 185, 129, 0.12);
      --accent-cyan: #06B6D4;
      --accent-cyan-subtle: rgba(6, 182, 212, 0.12);
      --accent-indigo: #6366F1;
      --accent-amber: #F59E0B;
      --accent-rose: #F43F5E;
    }

    html.light {
      --bg-base: #F8FAFC;
      --bg-surface: #FFFFFF;
      --bg-card: #FFFFFF;
      --bg-card-subtle: #F1F5F9;
      --bg-hover: #E2E8F0;
      --border-subtle: #E2E8F0;
      --border-strong: #CBD5E1;
      --text-primary: #0F172A;
      --text-secondary: #475569;
      --text-muted: #94A3B8;
      --accent-emerald: #059669;
      --accent-emerald-subtle: rgba(5, 150, 105, 0.10);
      --accent-cyan: #0284C7;
      --accent-cyan-subtle: rgba(2, 132, 199, 0.10);
      --accent-indigo: #4F46E5;
      --accent-amber: #D97706;
      --accent-rose: #E11D48;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: clip;
    }

    code, pre, .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: var(--bg-surface);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: var(--border-subtle);
      border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.85); }
    }
    .pulse-dot {
      animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  </style>
</head>
<body class="antialiased min-h-screen flex flex-col md:flex-row text-sm selection:bg-emerald-500/20 selection:text-emerald-300">

  <!-- Mobile Top Navigation Header -->
  <header class="md:hidden h-14 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between sticky top-0 z-50">
    <div class="flex items-center gap-2.5">
      <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-black text-xs shadow-sm shadow-emerald-500/20">
        SG
      </div>
      <span class="font-bold text-sm tracking-tight text-[var(--text-primary)]">SureGreet AI</span>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="toggleTheme()" class="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition" title="Toggle Light/Dark Theme">
        <span id="theme-icon-mobile">${getSvgIcon('sun', 'w-4 h-4')}</span>
      </button>
      <button onclick="toggleMobileMenu()" class="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
        ${getSvgIcon('menu', 'w-5 h-5')}
      </button>
    </div>
  </header>

  <!-- Left Sidebar (Linear / Vercel style) -->
  <aside id="sidebarNav" class="hidden md:flex w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex-col justify-between shrink-0 h-screen sticky top-0 z-40 transition-all duration-200">
    <div class="flex flex-col min-h-0">
      
      <!-- Brand & Agency Info -->
      <div class="h-16 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <a href="/outreach/prospects${keyQuery}" class="flex items-center gap-3 group">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-extrabold text-black text-sm shadow-md shadow-emerald-500/20 group-hover:scale-105 transition">
            SG
          </div>
          <div>
            <div class="font-bold text-sm tracking-tight text-[var(--text-primary)] flex items-center gap-1.5">
              <span>SureGreet AI</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/20">OS v2</span>
            </div>
            <p class="text-[11px] text-[var(--text-muted)]">Archit's Revenue Engine</p>
          </div>
        </a>
      </div>

      <!-- Navigation Section -->
      <div class="p-3 space-y-1 overflow-y-auto custom-scrollbar flex-1">
        <div class="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Agency Workspaces
        </div>
        ${sidebarLinksHtml}
      </div>
    </div>

    <!-- Bottom Controls & Theme Toggle -->
    <div class="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-card-subtle)] shrink-0 space-y-3">
      <!-- Founder & Sentinel Status -->
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-full bg-[var(--accent-emerald-subtle)] border border-[var(--accent-emerald)]/30 flex items-center justify-center text-[var(--accent-emerald)] font-bold text-xs">
            A
          </div>
          <div>
            <div class="text-xs font-semibold text-[var(--text-primary)]">Archit Deshmukh</div>
            <div class="text-[10px] text-[var(--accent-emerald)] flex items-center gap-1.5 font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-emerald)] pulse-dot"></span>
              <span>Sentinel Live</span>
            </div>
          </div>
        </div>

        <!-- 1-Click Dual Theme Toggle -->
        <button onclick="toggleTheme()" class="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition" title="Toggle Light/Dark Theme">
          <span id="theme-icon">${getSvgIcon('sun', 'w-4 h-4')}</span>
        </button>
      </div>

      <!-- External Outbound Links -->
      <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1">
        <a href="https://www.facebook.com/ads/library/?country=US&q=MedSpa%20Miami" target="_blank" class="hover:text-[var(--text-primary)] transition flex items-center gap-1">
          <span>Meta Ads</span>
          ${getSvgIcon('external', 'w-3 h-3 text-[var(--text-muted)]')}
        </a>
        <a href="/demo-medspa" target="_blank" class="text-[var(--accent-cyan)] hover:underline flex items-center gap-1 font-medium">
          <span>Voice Demo</span>
          ${getSvgIcon('external', 'w-3 h-3')}
        </a>
      </div>
    </div>
  </aside>

  <!-- Mobile Drawer Backdrop -->
  <div id="mobileDrawerBackdrop" onclick="toggleMobileMenu()" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"></div>

  <!-- Mobile Drawer Menu -->
  <div id="mobileDrawer" class="hidden fixed inset-y-0 left-0 w-72 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] z-50 p-4 flex-col justify-between md:hidden">
    <div>
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-black text-sm">
            SG
          </div>
          <span class="font-bold text-sm text-[var(--text-primary)]">SureGreet AI</span>
        </div>
        <button onclick="toggleMobileMenu()" class="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ${getSvgIcon('close', 'w-5 h-5')}
        </button>
      </div>
      <div class="py-4 space-y-1">
        ${sidebarLinksHtml}
      </div>
    </div>
    <div class="pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
      Founder: Archit • SureGreet AI v2
    </div>
  </div>

  <!-- Main Content Viewport -->
  <main class="flex-1 flex flex-col min-w-0 bg-[var(--bg-base)] min-h-screen">
    
    <!-- Unified Top Bar -->
    <header class="h-16 border-b border-[var(--border-subtle)] px-4 sm:px-8 flex items-center justify-between bg-[var(--bg-surface)]/70 backdrop-blur-md sticky top-0 z-30">
      <div class="flex items-center gap-3 sm:gap-4">
        <h1 class="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
          ${pageHeading}
        </h1>
        <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/20">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-emerald)] pulse-dot"></span>
          <span>${badgeText}</span>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <a href="/scraper/dashboard${keyQuery}" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition">
          ${getSvgIcon('hunter', 'w-3.5 h-3.5 text-[var(--accent-cyan)]')}
          <span>Scout Leads</span>
        </a>

        <button onclick="runGlobalOutreachQueue()" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent-emerald)] hover:opacity-90 text-black font-bold text-xs transition shadow-sm shadow-emerald-500/20">
          ${getSvgIcon('play', 'w-3.5 h-3.5')}
          <span>Run Outreach Queue</span>
        </button>
      </div>
    </header>

    <!-- Page Body Container -->
    <div class="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
      ${bodyContent}
    </div>
  </main>

  <!-- Global Toast Notification Container -->
  <div id="globalToast" class="fixed bottom-6 right-6 z-50 hidden transition-all duration-300">
    <div class="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl flex items-center gap-3 text-xs max-w-sm">
      <div id="toastIcon" class="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"></div>
      <div>
        <p id="toastTitle" class="font-bold text-[var(--text-primary)]"></p>
        <p id="toastMessage" class="text-[var(--text-secondary)] text-[11px] mt-0.5"></p>
      </div>
    </div>
  </div>

  <script>
    // Theme Switcher Engine
    function updateThemeIcons() {
      const isLight = document.documentElement.classList.contains('light');
      const sunSvg = '${getSvgIcon('sun', 'w-4 h-4').replace(/\n/g, '')}';
      const moonSvg = '${getSvgIcon('moon', 'w-4 h-4').replace(/\n/g, '')}';
      
      const themeIcon = document.getElementById('theme-icon');
      const themeIconMobile = document.getElementById('theme-icon-mobile');
      if (themeIcon) themeIcon.innerHTML = isLight ? moonSvg : sunSvg;
      if (themeIconMobile) themeIconMobile.innerHTML = isLight ? moonSvg : sunSvg;
    }

    function toggleTheme() {
      const isLight = document.documentElement.classList.contains('light');
      if (isLight) {
        document.documentElement.classList.remove('light');
        localStorage.setItem('suregreet_theme', 'dark');
      } else {
        document.documentElement.classList.add('light');
        localStorage.setItem('suregreet_theme', 'light');
      }
      updateThemeIcons();
    }
    updateThemeIcons();

    function toggleMobileMenu() {
      const drawer = document.getElementById('mobileDrawer');
      const backdrop = document.getElementById('mobileDrawerBackdrop');
      if (drawer && backdrop) {
        drawer.classList.toggle('hidden');
        drawer.classList.toggle('flex');
        backdrop.classList.toggle('hidden');
      }
    }

    // Global Toast Notification Helper
    function showToast(title, message, type = 'success') {
      const toast = document.getElementById('globalToast');
      const icon = document.getElementById('toastIcon');
      const tTitle = document.getElementById('toastTitle');
      const tMsg = document.getElementById('toastMessage');

      if (!toast) return;

      tTitle.innerText = title;
      tMsg.innerText = message;

      if (type === 'success') {
        icon.className = 'w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center';
        icon.innerHTML = '${getSvgIcon('check', 'w-4 h-4')}';
      } else if (type === 'error') {
        icon.className = 'w-7 h-7 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center';
        icon.innerHTML = '✕';
      } else {
        icon.className = 'w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center';
        icon.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}';
      }

      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 4000);
    }

    // Global Key & Auth Sync
    const urlKey = new URLSearchParams(window.location.search).get('key');
    if (urlKey) {
      localStorage.setItem('suregreet_admin_key', urlKey);
    }
    const adminKey = urlKey || localStorage.getItem('suregreet_admin_key') || '';

    function getAuthUrl(endpoint) {
      if (!adminKey) return endpoint;
      const delim = endpoint.includes('?') ? '&' : '?';
      return endpoint + delim + 'key=' + encodeURIComponent(adminKey);
    }

    function getAuthHeaders(extra = {}) {
      const h = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...extra };
      if (adminKey) h['x-admin-key'] = adminKey;
      return h;
    }

    async function runGlobalOutreachQueue() {
      if (!confirm('Run outreach sequence worker now?\\n\\nThis will evaluate all active prospects and dispatch due steps inside business hours.')) return;
      try {
        const res = await fetch(getAuthUrl('/test/run-outreach-queue'), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: JSON.stringify({ force: false })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Queue Executed', 'Evaluated sequence candidates successfully.', 'success');
        } else {
          showToast('Queue Error', data.message || 'Worker failed', 'error');
        }
      } catch (e) {
        showToast('Network Error', e.message, 'error');
      }
    }
  </script>

  ${extraScripts}
</body>
</html>`;
}
