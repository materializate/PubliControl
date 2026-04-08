/**
 * ─────────────────────────────────────────────────────────────
 *  db.js — Capa de datos
 *  Usa Supabase si está configurado, si no, modo localStorage.
 * ─────────────────────────────────────────────────────────────
 *
 *  Tabla Supabase: ad_reports
 *  ┌─────────────┬──────────────────────────────────────────┐
 *  │ id          │ uuid PK default gen_random_uuid()        │
 *  │ channel_id  │ text NOT NULL                            │
 *  │ duration    │ integer (segundos, nullable)              │
 *  │ started_at  │ timestamptz default now()                 │
 *  │ ended_at    │ timestamptz nullable                      │
 *  │ is_active   │ boolean default true                     │
 *  │ reporters   │ integer default 1                        │
 *  └─────────────┴──────────────────────────────────────────┘
 */

window.DB = (() => {
  const USE_SUPABASE = window.SUPABASE_URL && window.SUPABASE_ANON;
  let _client = null;
  let _realtimeCb = null;
  const TABLE = 'ad_reports';

  // ── Supabase client ────────────────────────────────────────
  function getClient() {
    if (!_client && USE_SUPABASE) {
      _client = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON
      );
    }
    return _client;
  }

  // ── Helpers ────────────────────────────────────────────────
  function now() { return new Date().toISOString(); }

  function localKey() { return 'anuncios_tv_ads'; }

  function localLoad() {
    try {
      return JSON.parse(localStorage.getItem(localKey()) || '{}');
    } catch { return {}; }
  }

  function localSave(data) {
    localStorage.setItem(localKey(), JSON.stringify(data));
  }

  // Build a unified "active ads" map { channelId: adObject }
  function normalizeRow(row) {
    return {
      id:         row.id,
      channelId:  row.channel_id,
      duration:   row.duration,
      remaining:  row.remaining,          // computed client-side
      startedAt:  row.started_at,
      endedAt:    row.ended_at,
      isActive:   row.is_active,
      reporters:  row.reporters || 1,
    };
  }

  // ── PUBLIC API ─────────────────────────────────────────────

  /**
   * isOnline() → boolean
   */
  function isOnline() { return !!USE_SUPABASE; }

  /**
   * fetchActive() → Promise<{ [channelId]: adObject }>
   */
  async function fetchActive() {
    if (!USE_SUPABASE) {
      return localLoad();
    }
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('started_at', { ascending: false });

    if (error) { console.error('[DB] fetchActive error', error); return {}; }

    const map = {};
    for (const row of (data || [])) {
      // Keep only the most recent report per channel
      if (!map[row.channel_id]) {
        const norm = normalizeRow(row);
        // Compute remaining from server time
        if (norm.duration) {
          const elapsed = Math.floor((Date.now() - new Date(norm.startedAt).getTime()) / 1000);
          norm.remaining = Math.max(0, norm.duration - elapsed);
        }
        map[row.channel_id] = norm;
      }
    }
    return map;
  }

  /**
   * reportAd(channelId, duration|null) → Promise<adObject>
   */
  async function reportAd(channelId, duration) {
    if (!USE_SUPABASE) {
      const map = localLoad();
      const ad = {
        id: `local_${Date.now()}`,
        channelId,
        duration,
        remaining: duration,
        startedAt: now(),
        endedAt: null,
        isActive: true,
        reporters: 1,
      };
      map[channelId] = ad;
      localSave(map);
      return ad;
    }

    const sb = getClient();

    // Check if already reported recently (< 10 min) — increment reporters
    const { data: existing } = await sb
      .from(TABLE)
      .select('id, reporters')
      .eq('channel_id', channelId)
      .eq('is_active', true)
      .single();

    if (existing) {
      // Bump reporter count
      await sb
        .from(TABLE)
        .update({ reporters: (existing.reporters || 1) + 1 })
        .eq('id', existing.id);
      // Re-fetch the updated row
      const { data: updated } = await sb
        .from(TABLE)
        .select('*')
        .eq('id', existing.id)
        .single();
      return updated ? normalizeRow(updated) : null;
    }

    // New report
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        channel_id:  channelId,
        duration:    duration || null,
        started_at:  now(),
        is_active:   true,
        reporters:   1,
      })
      .select()
      .single();

    if (error) { console.error('[DB] reportAd error', error); return null; }
    const norm = normalizeRow(data);
    norm.remaining = duration;
    return norm;
  }

  /**
   * endAd(channelId) → Promise<void>
   */
  async function endAd(channelId) {
    if (!USE_SUPABASE) {
      const map = localLoad();
      delete map[channelId];
      localSave(map);
      return;
    }

    const sb = getClient();
    await sb
      .from(TABLE)
      .update({ is_active: false, ended_at: now() })
      .eq('channel_id', channelId)
      .eq('is_active', true);
  }

  /**
   * subscribeToChanges(callback) — Realtime listener
   * callback({ eventType, channelId, row })
   */
  function subscribeToChanges(callback) {
    _realtimeCb = callback;
    if (!USE_SUPABASE) return;

    const sb = getClient();
    sb
      .channel('ad_reports_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        (payload) => {
          const row = payload.new || payload.old;
          callback({
            eventType:  payload.eventType,   // INSERT | UPDATE | DELETE
            channelId:  row?.channel_id,
            row:        row ? normalizeRow(row) : null,
          });
        }
      )
      .subscribe();
  }

  return { isOnline, fetchActive, reportAd, endAd, subscribeToChanges };
})();
