/**
 * db.js — Capa de datos (Supabase + localStorage fallback)
 */

window.DB = (() => {
  const USE_SUPABASE = window.SUPABASE_URL && window.SUPABASE_ANON;
  let _client = null;
  const TABLE = 'ad_reports';

  function getClient() {
    if (!_client && USE_SUPABASE) {
      _client = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON
      );
    }
    return _client;
  }

  function now() { return new Date().toISOString(); }
  function localKey() { return 'anuncios_tv_ads'; }
  function localLoad() {
    try { return JSON.parse(localStorage.getItem(localKey()) || '{}'); }
    catch { return {}; }
  }
  function localSave(data) {
    localStorage.setItem(localKey(), JSON.stringify(data));
  }

function normalizeRow(row) {
  const elapsed = row.started_at
    ? Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
    : 0;
  return {
    id:        row.id,
    channelId: row.channel_id,
    duration:  row.duration,
    remaining: row.duration ? Math.max(0, row.duration - elapsed) : null,
    startedAt: row.started_at,
    endedAt:   row.ended_at,
    isActive:  row.is_active,
    reporters: row.reporters || 1,
  };
}

  function isOnline() { return !!USE_SUPABASE; }

  async function fetchActive() {
    if (!USE_SUPABASE) return localLoad();

    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('started_at', { ascending: false });

    if (error) { console.error('[DB] fetchActive error', error); return {}; }

    const map = {};
    for (const row of (data || [])) {
      if (!map[row.channel_id]) {
        const norm = normalizeRow(row);
        if (norm.duration) {
          const elapsed = Math.floor((Date.now() - new Date(norm.startedAt).getTime()) / 1000);
          norm.remaining = Math.max(0, norm.duration - elapsed);
        }
        map[row.channel_id] = norm;
      }
    }
    return map;
  }

  async function reportAd(channelId, duration) {
    if (!USE_SUPABASE) {
      const map = localLoad();
      const ad = {
        id: `local_${Date.now()}`,
        channelId, duration, remaining: duration,
        startedAt: now(), endedAt: null, isActive: true, reporters: 1,
      };
      map[channelId] = ad;
      localSave(map);
      return ad;
    }

    const sb = getClient();

    // Check if already active
    const { data: existing } = await sb
      .from(TABLE)
      .select('id, reporters')
      .eq('channel_id', channelId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      await sb.from(TABLE)
        .update({ reporters: (existing.reporters || 1) + 1 })
        .eq('id', existing.id);
      const { data: updated } = await sb.from(TABLE).select('*').eq('id', existing.id).single();
      return updated ? normalizeRow(updated) : null;
    }

    const { data, error } = await sb
      .from(TABLE)
      .insert({ channel_id: channelId, duration: duration || null, started_at: now(), is_active: true, reporters: 1 })
      .select()
      .single();

    if (error) { console.error('[DB] reportAd error', error); return null; }
    return normalizeRow(data);
  }

  async function endAd(channelId) {
    if (!USE_SUPABASE) {
      const map = localLoad();
      delete map[channelId];
      localSave(map);
      return;
    }

    const sb = getClient();

    // First find the active row id
    const { data: rows, error: fetchErr } = await sb
      .from(TABLE)
      .select('id')
      .eq('channel_id', channelId)
      .eq('is_active', true);

    if (fetchErr) { console.error('[DB] endAd fetch error', fetchErr); return; }
    if (!rows || rows.length === 0) { console.warn('[DB] endAd: no active row found for', channelId); return; }

    // Update each matching row by id (avoids RLS issues with compound filters)
    for (const row of rows) {
      const { error: updateErr } = await sb
        .from(TABLE)
        .update({ is_active: false, ended_at: now() })
        .eq('id', row.id);

      if (updateErr) {
        console.error('[DB] endAd update error for id', row.id, updateErr);
      } else {
        console.log('[DB] endAd: marked inactive', channelId, row.id);
      }
    }
  }

  function subscribeToChanges(callback) {
    if (!USE_SUPABASE) return;
    const sb = getClient();
    sb.channel('ad_reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        const row = payload.new || payload.old;
        callback({
          eventType: payload.eventType,
          channelId: row?.channel_id,
          row: row ? normalizeRow(row) : null,
        });
      })
      .subscribe();
  }

  return { isOnline, fetchActive, reportAd, endAd, subscribeToChanges };
})();
