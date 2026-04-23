/**
 * app.js — ANUNCIOS.TV v3 — con iconos reales de canales
 */

const state = {
  ads:             {},
  selectedChannel: null,
  selectedDuration: null,
  tickInterval:    null,
};

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

/* ── Helpers ─────────────────────────────────────────────────── */
function formatTime(s) {
  if (!s || s <= 0) return '00:00';
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function getChannel(id) { return window.CHANNELS.find(c => c.id === id); }

// Returns HTML for channel logo — real image if available, colored badge fallback
function logoHtml(ch, size = 'normal') {
  const px = size === 'big' ? '40px' : '32px';
  const fontSize = size === 'big' ? '14px' : '11px';
  if (ch.icon) {
    return `<img src="${ch.icon}"
      alt="${ch.name}"
      style="width:${px};height:${px};object-fit:contain;border-radius:4px;background:#1a1d24;padding:2px;flex-shrink:0;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';"
    /><span class="channel-logo" style="display:none;background:${ch.color};color:#000;font-size:${fontSize}">${ch.logo}</span>`;
  }
  return `<span class="channel-logo" style="background:${ch.color};color:#000;font-size:${fontSize}">${ch.logo}</span>`;
}

function logoHtmlAd(ch, size = 'normal') {
  const px = size === 'big' ? '40px' : '32px';
  if (ch.icon) {
    return `<img src="${ch.icon}"
      alt="${ch.name}"
      style="width:${px};height:${px};object-fit:contain;border-radius:4px;background:rgba(255,68,68,0.15);padding:2px;flex-shrink:0;opacity:0.6;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';"
    /><span class="channel-logo" style="display:none;background:rgba(255,68,68,0.25);color:#ff9999">${ch.logo}</span>`;
  }
  return `<span class="channel-logo" style="background:rgba(255,68,68,0.25);color:#ff9999">${ch.logo}</span>`;
}

/* ── Notifications ───────────────────────────────────────────── */
async function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
function fireNotification(channelName, nextTitle) {
  const body = nextTitle ? `${channelName} vuelve · Sigue: ${nextTitle}` : `${channelName} ha terminado la publicidad`;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('📺 ¡Vuelve a la tele!', { body, icon: 'icons/icon-192.png', badge: 'icons/icon-72.png' });
  }
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

/* ── Toast ───────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  els.toasts.prepend(t);
  setTimeout(() => { t.style.animation = 'fadeOut 0.4s ease forwards'; setTimeout(() => t.remove(), 400); }, 4500);
}

/* ── Ticker ──────────────────────────────────────────────────── */
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
          fireNotification(ch?.name || id, EPG.getNext(id)?.title);
          toast(`✅ ${ch?.name} ha terminado la publicidad`, 'success');
          setTimeout(() => { DB.endAd(id); delete state.ads[id]; renderAll(); }, 2000);
        }
      }
    }
    if (dirty) renderActiveList();
  }, 1000);
}

/* ── Render ──────────────────────────────────────────────────── */
function renderStatusBar() {
  const count  = Object.keys(state.ads).length;
  const online = DB.isOnline();
  const epgTag = window.EPG_PROXY_URL ? ' · EPG 📡' : '';
  els.statusDots.forEach(d => {
    d.className = 'status-dot';
    if (count > 0) d.classList.add('active');
    else if (online) d.classList.add('online');
  });
  if (!online)     els.subtitle.textContent = `Modo local${epgTag}`;
  else if (!count) els.subtitle.textContent = `Sin publicidad activa · Comunitario 🟢${epgTag}`;
  else             els.subtitle.textContent = `${count} canal${count>1?'es':''} en publicidad · 🟢${epgTag}`;
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
    const pct = hasTimer ? Math.max(0,(rem/ad.duration)*100) : null;
    const cdClass = rem<30?'urgent':rem<60?'warn':'';
    const nowProg  = EPG.getNow(ad.channelId);
    const nextProg = EPG.getNext(ad.channelId);

    const card = document.createElement('div');
    card.className = `active-card${hasTimer?' has-timer':''}`;
    card.dataset.channelId = ad.channelId;
    card.innerHTML = `
      <div class="active-card-top">
        <div class="active-card-left">
          ${logoHtml(ch)}
          <div>
            <span class="channel-name-big">${ch.name}</span>
            ${nowProg?`<div style="font-size:10px;color:#666;margin-top:2px">🎬 ${nowProg.title}</div>`:''}
          </div>
          <span class="reporters-badge">👥 ${ad.reporters}</span>
        </div>
        <div class="active-card-right">
          ${hasTimer?`<span class="countdown ${cdClass}">${formatTime(rem)}</span>`:`<span class="no-timer-label">sin timer</span>`}
          <button class="end-btn" data-channel="${ad.channelId}">FIN</button>
        </div>
      </div>
      ${nextProg?`<div style="font-size:11px;color:#555;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">▶ Después: <span style="color:#888">${EPG.formatProgram(nextProg)}</span></div>`:''}
      ${hasTimer?`<div class="progress-bar-track" style="margin-top:6px"><div class="progress-bar-fill" style="width:${pct}%;background:${pct>50?'var(--info)':pct>20?'#ffaa00':'var(--danger)'}"></div></div>`:''}
    `;
    els.activeList.appendChild(card);
  }
  els.activeList.querySelectorAll('.end-btn').forEach(btn => {
    btn.addEventListener('click', () => handleEndAd(btn.dataset.channel));
  });
}

function renderChannelGrid() {
  els.channelGrid.innerHTML = '';
  for (const ch of window.CHANNELS) {
    const ad      = state.ads[ch.id];
    const isAd    = !!ad;
    const nowProg  = EPG.getNow(ch.id);
    const nextProg = EPG.getNext(ch.id);
    const hasEpg   = !!(nowProg || nextProg);
    const epgPct   = EPG.progressPercent(nowProg);

    const btn = document.createElement('button');
    btn.className = `channel-btn${isAd?' in-ad':''}${hasEpg?' has-epg':''}`;
    btn.disabled = isAd;

    const timerHtml = (isAd && ad.duration && ad.remaining > 0)
      ? `<span class="channel-timer-small">${formatTime(ad.remaining)}</span>` : '';

    const epgHtml = hasEpg ? `
      <div class="epg-strip">
        ${nowProg?`<div class="epg-now"><strong>${nowProg.title}</strong></div>${epgPct!==null?`<div class="epg-progress-track"><div class="epg-progress-fill" style="width:${epgPct.toFixed(1)}%"></div></div>`:''}` :''}
        ${nextProg?`<div class="epg-next">▶ ${EPG.formatProgram(nextProg)}</div>`:''}
      </div>` : '';

    btn.innerHTML = `
      <div class="${hasEpg?'channel-btn-top':'channel-btn-left'}">
        <div class="channel-btn-left">
          ${isAd ? logoHtmlAd(ch) : logoHtml(ch)}
          <div>
            <div class="channel-name">${ch.name}</div>
            <div class="channel-status">${isAd?`EN PUBLI · 👥 ${ad.reporters}`:'Reportar'}</div>
          </div>
        </div>
        ${timerHtml}
      </div>
      ${epgHtml}
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

/* ── Modal ───────────────────────────────────────────────────── */
function openModal(ch) {
  state.selectedChannel = ch;
  state.selectedDuration = null;

  // Modal logo — use real icon if available
  els.modalLogo.innerHTML = '';
  if (ch.icon) {
    els.modalLogo.innerHTML = `<img src="${ch.icon}" alt="${ch.name}"
      style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:#1a1d24;padding:3px;"
      onerror="this.parentElement.innerHTML='<span style=\'background:${ch.color};color:#000;font-weight:900;font-size:14px;padding:6px 12px;border-radius:6px\'>${ch.logo}</span>'"
    />`;
  } else {
    els.modalLogo.style.background = ch.color;
    els.modalLogo.textContent = ch.logo;
  }
  els.modalName.textContent = ch.name;

  const existingHint = els.modalOverlay.querySelector('.modal-epg-hint');
  if (existingHint) existingHint.remove();
  const nowProg = EPG.getNow(ch.id);
  if (nowProg) {
    const hint = document.createElement('div');
    hint.className = 'modal-epg-hint';
    hint.style.cssText = `font-size:11px;color:#666;margin:-10px 0 14px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid rgba(255,255,255,0.07);`;
    hint.innerHTML = `📺 Interrumpiendo: <span style="color:#999">${nowProg.title}</span>`;
    els.durationGrid.before(hint);
  }

  els.durationGrid.innerHTML = '';
  for (const d of window.AD_DURATIONS) {
    const btn = document.createElement('button');
    btn.className = 'dur-btn';
    btn.textContent = d.label;
    btn.dataset.value = d.value ?? '';
    btn.addEventListener('click', () => {
      state.selectedDuration = d.value;
      els.durationGrid.querySelectorAll('.dur-btn').forEach(b => b.classList.toggle('selected', b===btn));
    });
    els.durationGrid.appendChild(btn);
  }
  els.durationGrid.querySelector('.dur-btn').classList.add('selected');
  els.modalOverlay.classList.remove('hidden');
  askNotificationPermission();
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  const hint = els.modalOverlay.querySelector('.modal-epg-hint');
  if (hint) hint.remove();
  // Reset modal logo styles
  els.modalLogo.style.background = '';
  els.modalLogo.textContent = '';
  state.selectedChannel = null;
  state.selectedDuration = null;
}

/* ── Actions ─────────────────────────────────────────────────── */
async function handleReport() {
  const ch = state.selectedChannel;
  if (!ch) return;
  closeModal();
  const ad = await DB.reportAd(ch.id, state.selectedDuration);
  if (!ad) { toast('❌ Error al reportar. Inténtalo de nuevo.', 'error'); return; }
  state.ads[ch.id] = ad;
  renderAll();
  startTicker();
  toast(`📢 ${ch.name} en publicidad`, 'info');
}

async function handleEndAd(channelId) {
  const ch   = getChannel(channelId);
  const next = EPG.getNext(channelId);
  await DB.endAd(channelId);
  delete state.ads[channelId];
  renderAll();
  toast(`✅ ${ch?.name} ha terminado${next?' · Sigue: '+next.title:''}`, 'success');
}

/* ── Realtime ────────────────────────────────────────────────── */
function setupRealtime() {
  DB.subscribeToChanges(({ eventType, channelId, row }) => {
    if (eventType === 'INSERT' || (eventType === 'UPDATE' && row?.isActive)) {
      if (!state.ads[channelId]) {
        if (row.duration) {
          const elapsed = Math.floor((Date.now() - new Date(row.startedAt).getTime()) / 1000);
          row.remaining = Math.max(0, row.duration - elapsed);
        }
        state.ads[channelId] = row;
        toast(`📢 ${getChannel(channelId)?.name} en publicidad (otro usuario)`, 'info');
        renderAll(); startTicker();
      } else if (eventType === 'UPDATE') {
        state.ads[channelId] = { ...state.ads[channelId], reporters: row.reporters };
        renderAll();
      }
    } else if (eventType === 'DELETE' || (eventType === 'UPDATE' && row && !row.isActive)) {
      if (state.ads[channelId]) {
        delete state.ads[channelId];
        toast(`✅ ${getChannel(channelId)?.name} ha terminado la publicidad`, 'success');
        renderAll();
      }
    }
  });
}

/* ── Init ────────────────────────────────────────────────────── */
async function init() {
  if (!DB.isOnline() && !localStorage.getItem('config_dismissed')) {
    els.configBanner.classList.remove('hidden');
    $('dismissConfig').addEventListener('click', () => {
      els.configBanner.classList.add('hidden');
      localStorage.setItem('config_dismissed', '1');
    });
  }

  els.channelGrid.innerHTML = `<div class="epg-loading" style="grid-column:1/-1">Cargando programación…</div>`;

  const [ads] = await Promise.all([
    DB.fetchActive(),
    EPG.fetchEPG(),
  ]);

  state.ads = ads;
  for (const id in state.ads) {
    const ad = state.ads[id];
    if (ad.duration && ad.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(ad.startedAt).getTime()) / 1000);
      ad.remaining = Math.max(0, ad.duration - elapsed);
      if (ad.remaining === 0 && ad.duration) { DB.endAd(id); delete state.ads[id]; }
    }
  }

  renderAll();
  startTicker();
  setupRealtime();

  setInterval(async () => {
    await EPG.fetchEPG();
    renderChannelGrid();
    renderActiveList();
  }, 10 * 60 * 1000);

  els.reportBtn.addEventListener('click', handleReport);
  els.modalOverlay.addEventListener('click', (e) => { if (e.target === els.modalOverlay) closeModal(); });
}

document.addEventListener('DOMContentLoaded', init);

/* ── PWA Install ─────────────────────────────────────────────── */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (localStorage.getItem('install_dismissed')) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.innerHTML = `
    <div><strong>📺 Instalar Anuncios.TV</strong><p>Añade la app a tu pantalla de inicio</p></div>
    <button class="install-btn" id="installBtn">Instalar</button>
    <button class="install-dismiss" id="installDismiss" title="Cerrar">×</button>
  `;
  document.body.appendChild(banner);
  $('installBtn').addEventListener('click', async () => {
    banner.remove();
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') localStorage.setItem('install_dismissed', '1');
  });
  $('installDismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('install_dismissed', '1');
  });
});
