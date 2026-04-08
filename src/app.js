/**
 * ─────────────────────────────────────────────────────────────
 *  app.js — Lógica principal de ANUNCIOS.TV
 * ─────────────────────────────────────────────────────────────
 */

/* ── State ─────────────────────────────────────────────────── */
const state = {
  ads:             {},        // { channelId: adObject }
  selectedChannel: null,
  selectedDuration: null,
  tickInterval:    null,
};

/* ── DOM refs ───────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const els = {
  subtitle:      $('subtitle'),
  statusDots:    [$('statusDot'), $('statusDot2')],
  activeSection: $('activeSection'),
  activeList:    $('activeList'),
  channelGrid:   $('channelGrid'),
  modalOverlay:  $('modalOverlay'),
  modalLogo:     $('modalLogo'),
  modalName:     $('modalName'),
  durationGrid:  $('durationGrid'),
  reportBtn:     $('reportBtn'),
  toasts:        $('toasts'),
  configBanner:  $('configBanner'),
};

/* ── Helpers ────────────────────────────────────────────────── */
function formatTime(s) {
  if (!s || s <= 0) return '00:00';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function getChannel(id) {
  return window.CHANNELS.find(c => c.id === id);
}

/* ── Notifications ──────────────────────────────────────────── */
async function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function fireNotification(channelName) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('📺 ¡Vuelve a la tele!', {
      body: `${channelName} ha terminado la publicidad`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-72.png',
      vibrate: [200, 100, 200],
    });
  }
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

/* ── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  els.toasts.prepend(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut 0.4s ease forwards';
    setTimeout(() => t.remove(), 400);
  }, 4500);
}

/* ── Ticker ─────────────────────────────────────────────────── */
function startTicker() {
  if (state.tickInterval) return;
  state.tickInterval = setInterval(() => {
    let dirty = false;
    for (const id in state.ads) {
      const ad = state.ads[id];
      if (ad.duration && ad.remaining > 0) {
        ad.remaining -= 1;
        dirty = true;
        if (ad.remaining === 0) {
          const ch = getChannel(id);
          fireNotification(ch?.name || id);
          toast(`✅ ${ch?.name} ha terminado la publicidad`, 'success');
          // Mark ended after 2s visual feedback
          setTimeout(() => {
            DB.endAd(id);
            delete state.ads[id];
            renderAll();
          }, 2000);
        }
      }
    }
    if (dirty) renderActiveList();
  }, 1000);
}

/* ── Render helpers ─────────────────────────────────────────── */

function renderStatusBar() {
  const count = Object.keys(state.ads).length;
  const online = DB.isOnline();

  els.statusDots.forEach(d => {
    d.className = 'status-dot';
    if (count > 0) d.classList.add('active');
    else if (online) d.classList.add('online');
  });

  if (!online) {
    els.subtitle.textContent = 'Modo local (sin Supabase)';
  } else if (count === 0) {
    els.subtitle.textContent = 'Sin publicidad activa · Modo comunitario 🟢';
  } else {
    els.subtitle.textContent =
      `${count} canal${count > 1 ? 'es' : ''} en publicidad · Modo comunitario 🟢`;
  }
}

function renderActiveList() {
  const active = Object.values(state.ads);
  els.activeSection.classList.toggle('hidden', active.length === 0);

  els.activeList.innerHTML = '';
  for (const ad of active) {
    const ch = getChannel(ad.channelId);
    if (!ch) continue;

    const hasTimer = ad.duration != null;
    const rem = ad.remaining;
    const pct = hasTimer ? Math.max(0, (rem / ad.duration) * 100) : null;
    const cdClass = rem < 30 ? 'urgent' : rem < 60 ? 'warn' : '';
    const isEnding = hasTimer && rem === 0;

    const card = document.createElement('div');
    card.className = `active-card${hasTimer ? ' has-timer' : ''}${isEnding ? ' ending' : ''}`;
    card.dataset.channelId = ad.channelId;
    card.innerHTML = `
      <div class="active-card-top">
        <div class="active-card-left">
          <span class="channel-logo" style="background:${ch.color}">${ch.logo}</span>
          <span class="channel-name-big">${ch.name}</span>
          <span class="reporters-badge">👥 ${ad.reporters}</span>
        </div>
        <div class="active-card-right">
          ${hasTimer
            ? `<span class="countdown ${cdClass}">${formatTime(rem)}</span>`
            : `<span class="no-timer-label">sin timer</span>`
          }
          <button class="end-btn" data-channel="${ad.channelId}">FIN</button>
        </div>
      </div>
      ${hasTimer ? `
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%;background:${
            pct > 50 ? 'var(--info)' : pct > 20 ? '#ffaa00' : 'var(--danger)'
          }"></div>
        </div>
      ` : ''}
    `;
    els.activeList.appendChild(card);
  }

  // End buttons
  els.activeList.querySelectorAll('.end-btn').forEach(btn => {
    btn.addEventListener('click', () => handleEndAd(btn.dataset.channel));
  });
}

function renderChannelGrid() {
  els.channelGrid.innerHTML = '';
  for (const ch of window.CHANNELS) {
    const ad = state.ads[ch.id];
    const isAd = !!ad;

    const btn = document.createElement('button');
    btn.className = `channel-btn${isAd ? ' in-ad' : ''}`;
    btn.disabled = isAd;

    const logoStyle = isAd
      ? `background:rgba(255,68,68,0.25);color:#ff9999;`
      : `background:${ch.color};color:#000;`;

    const timerHtml = (isAd && ad.duration && ad.remaining > 0)
      ? `<span class="channel-timer-small">${formatTime(ad.remaining)}</span>`
      : '';

    btn.innerHTML = `
      <div class="channel-btn-left">
        <span class="channel-logo" style="${logoStyle}">${ch.logo}</span>
        <div>
          <div class="channel-name">${ch.name}</div>
          <div class="channel-status">${isAd ? `EN PUBLI · 👥 ${ad.reporters}` : 'Reportar'}</div>
        </div>
      </div>
      ${timerHtml}
    `;
    if (!isAd) btn.addEventListener('click', () => openModal(ch));
    els.channelGrid.appendChild(btn);
  }
}

function renderAll() {
  renderStatusBar();
  renderActiveList();
  renderChannelGrid();
}

/* ── Modal ──────────────────────────────────────────────────── */
function openModal(ch) {
  state.selectedChannel = ch;
  state.selectedDuration = null;

  els.modalLogo.textContent = ch.logo;
  els.modalLogo.style.background = ch.color;
  els.modalName.textContent = ch.name;

  // Build duration buttons
  els.durationGrid.innerHTML = '';
  for (const d of window.AD_DURATIONS) {
    const btn = document.createElement('button');
    btn.className = 'dur-btn';
    btn.textContent = d.label;
    btn.dataset.value = d.value ?? '';
    btn.addEventListener('click', () => {
      state.selectedDuration = d.value;
      els.durationGrid.querySelectorAll('.dur-btn')
        .forEach(b => b.classList.toggle('selected', b === btn));
    });
    els.durationGrid.appendChild(btn);
  }

  // Pre-select "No sé"
  els.durationGrid.querySelector('.dur-btn').classList.add('selected');

  els.modalOverlay.classList.remove('hidden');
  askNotificationPermission();
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  state.selectedChannel = null;
  state.selectedDuration = null;
}

/* ── Actions ────────────────────────────────────────────────── */
async function handleReport() {
  const ch = state.selectedChannel;
  if (!ch) return;

  closeModal();

  const ad = await DB.reportAd(ch.id, state.selectedDuration);
  if (!ad) {
    toast('❌ Error al reportar. Inténtalo de nuevo.', 'error');
    return;
  }

  state.ads[ch.id] = ad;
  renderAll();
  startTicker();
  toast(`📢 ${ch.name} en publicidad`, 'info');
}

async function handleEndAd(channelId) {
  const ch = getChannel(channelId);
  await DB.endAd(channelId);
  delete state.ads[channelId];
  renderAll();
  toast(`✅ ${ch?.name} ha terminado la publicidad`, 'success');
}

/* ── Realtime ────────────────────────────────────────────────── */
function setupRealtime() {
  DB.subscribeToChanges(({ eventType, channelId, row }) => {
    if (eventType === 'INSERT' || (eventType === 'UPDATE' && row?.isActive)) {
      if (!state.ads[channelId]) {
        // Compute remaining from server start time
        if (row.duration) {
          const elapsed = Math.floor(
            (Date.now() - new Date(row.startedAt).getTime()) / 1000
          );
          row.remaining = Math.max(0, row.duration - elapsed);
        }
        state.ads[channelId] = row;
        const ch = getChannel(channelId);
        toast(`📢 ${ch?.name} en publicidad (otro usuario)`, 'info');
        renderAll();
        startTicker();
      } else if (eventType === 'UPDATE') {
        // Update reporter count etc.
        state.ads[channelId] = { ...state.ads[channelId], reporters: row.reporters };
        renderAll();
      }
    } else if (
      eventType === 'DELETE' ||
      (eventType === 'UPDATE' && row && !row.isActive)
    ) {
      if (state.ads[channelId]) {
        delete state.ads[channelId];
        const ch = getChannel(channelId);
        toast(`✅ ${ch?.name} ha terminado la publicidad`, 'success');
        renderAll();
      }
    }
  });
}

/* ── Init ───────────────────────────────────────────────────── */
async function init() {
  // Config banner
  if (!DB.isOnline()) {
    const dismissed = localStorage.getItem('config_dismissed');
    if (!dismissed) {
      els.configBanner.classList.remove('hidden');
      $('dismissConfig').addEventListener('click', () => {
        els.configBanner.classList.add('hidden');
        localStorage.setItem('config_dismissed', '1');
      });
    }
  }

  // Load initial state
  state.ads = await DB.fetchActive();

  // Compute remaining for any active timed ads
  for (const id in state.ads) {
    const ad = state.ads[id];
    if (ad.duration && ad.startedAt) {
      const elapsed = Math.floor(
        (Date.now() - new Date(ad.startedAt).getTime()) / 1000
      );
      ad.remaining = Math.max(0, ad.duration - elapsed);
      // Auto-clear already-expired
      if (ad.remaining === 0 && ad.duration) {
        DB.endAd(id);
        delete state.ads[id];
      }
    }
  }

  renderAll();
  startTicker();
  setupRealtime();

  // Modal listeners
  els.reportBtn.addEventListener('click', handleReport);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
}

document.addEventListener('DOMContentLoaded', init);

/* ── PWA Install prompt ─────────────────────────────────────── */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  // Only show if not already installed / dismissed
  if (localStorage.getItem('install_dismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.innerHTML = `
    <div>
      <strong>📺 Instalar Anuncios.TV</strong>
      <p>Añade la app a tu pantalla de inicio</p>
    </div>
    <button class="install-btn" id="installBtn">Instalar</button>
    <button class="install-dismiss" id="installDismiss" title="Cerrar">×</button>
  `;
  document.body.appendChild(banner);

  $('installBtn').addEventListener('click', async () => {
    banner.remove();
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('install_dismissed', '1');
    }
  });
  $('installDismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('install_dismissed', '1');
  });
});
