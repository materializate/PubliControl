/**
 * epg.js — Módulo de guía de programación (EPG)
 *
 * - Si hay EPG_PROXY_URL configurado: consulta la Supabase Edge Function
 * - Si no hay proxy: carga datos de demostración realistas
 *
 * Cache local de 10 minutos.
 */

window.EPG = (() => {
  const CACHE_KEY = 'anuncios_tv_epg';
  const CACHE_TTL = 10 * 60 * 1000;

  let _data = {};
  let _lastFetch = 0;
  let _fetchPromise = null;

  // ── Cache ──────────────────────────────────────────────────
  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return data;
    } catch { }
    return null;
  }
  function saveCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { }
  }

  // ── Demo data ──────────────────────────────────────────────
  // Genera programas ficticios pero con horas reales y barras de progreso correctas
  function makeDemoData() {
    const now = Date.now();
    const h   = (ms) => new Date(ms).toISOString();

    // Cada programa dura entre 45-90 minutos; generamos current + next
    function prog(title, minsAgo, durMins, nextTitle, nextDurMins) {
      const start = now - minsAgo * 60000;
      const end   = start + durMins * 60000;
      const nstart = end;
      const nend   = nstart + nextDurMins * 60000;
      return {
        now:  { title, start: h(start), end: h(end) },
        next: { title: nextTitle, start: h(nstart), end: h(nend) },
      };
    }

    return {
      la1:      prog('Telediario 2',          15, 55, 'El Tiempo', 10),
      la2:      prog('Saber y Ganar',         30, 45, 'Aquí la Tierra', 60),
      a3:       prog('El Hormiguero',         20, 65, 'El Intermedio', 60),
      cuatro:   prog('Todo es Mentira',       10, 90, 'Cuatro al día', 60),
      t5:       prog('Supervivientes: En Directo', 5, 120, 'Informativos', 30),
      sx:       prog('La Sexta Noticias',     40, 30, 'El Intermedio', 60),
      dmax:     prog('Buscadores de Oro',     25, 60, 'Deadliest Catch', 60),
      energy:   prog('The Big Bang Theory',   12, 25, 'Two and a Half Men', 25),
      divinity: prog('Anatomía de Grey',      35, 45, 'Scandal', 45),
      bemad:    prog('Fútbol Americano NFL',  50, 90, 'Baloncesto NBA', 90),
      mega:     prog('Los Simpsons',           8, 25, 'Los Simpsons', 25),
      clan:     prog('Doraemon',              18, 25, 'Peppa Pig', 15),
      fdf:      prog('CSI: Las Vegas',        40, 45, 'Mentes Criminales', 45),
    };
  }

  // ── Helpers ────────────────────────────────────────────────
  function formatTime(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Public API ─────────────────────────────────────────────
  async function fetchEPG() {
    if (_fetchPromise) return _fetchPromise;
    if (_data && Object.keys(_data).length > 0 && Date.now() - _lastFetch < CACHE_TTL) return _data;

    const cached = loadCache();
    if (cached) { _data = cached; _lastFetch = Date.now(); return _data; }

    // No proxy → use demo data
    if (!window.EPG_PROXY_URL) {
      _data = makeDemoData();
      _lastFetch = Date.now();
      return _data;
    }

    _fetchPromise = fetch(window.EPG_PROXY_URL)
      .then(r => { if (!r.ok) throw new Error(`EPG proxy ${r.status}`); return r.json(); })
      .then(json => { _data = json; _lastFetch = Date.now(); saveCache(json); return json; })
      .catch(err => {
        console.warn('[EPG] proxy error, using demo data:', err);
        _data = makeDemoData();
        _lastFetch = Date.now();
        return _data;
      })
      .finally(() => { _fetchPromise = null; });

    return _fetchPromise;
  }

  function getNow(channelId)  { return _data[channelId]?.now  ?? null; }
  function getNext(channelId) { return _data[channelId]?.next ?? null; }

  function formatProgram(program) {
    if (!program) return '';
    const time = formatTime(program.start);
    return time ? `${program.title} · ${time}` : program.title;
  }

  function progressPercent(program) {
    if (!program?.start || !program?.end) return null;
    const now   = Date.now();
    const start = new Date(program.start).getTime();
    const end   = new Date(program.end).getTime();
    if (end <= start) return null;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  return { fetchEPG, getNow, getNext, formatProgram, progressPercent };
})();
