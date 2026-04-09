/**
 * supabase/functions/epg-proxy/index.ts
 * Proxy EPG — parsea XMLTV de TDTChannels con regex (sin DOMParser)
 * Deploy: supabase functions deploy epg-proxy --no-verify-jwt
 */

const EPG_URL = "https://www.tdtchannels.com/epg/TV.xml";

const CHANNEL_MAP: Record<string, string[]> = {
  la1:       ["La 1", "la1"],
  la2:       ["La 2", "la2"],
  a3:        ["Antena 3", "antena3", "antena-3"],
  cuatro:    ["Cuatro", "cuatro"],
  t5:        ["Telecinco", "telecinco"],
  sx:        ["La Sexta", "lasexta", "la-sexta"],
  dmax:      ["DMAX", "dmax"],
  energy:    ["Energy", "energy"],
  divinity:  ["Divinity", "divinity"],
  bemad:     ["Be Mad", "bemad", "be-mad"],
  mega:      ["Mega", "mega"],
  clan:      ["Clan", "clan"],
  fdf:       ["FDF", "fdf", "Factoría de Ficción", "factoria de ficcion"],
};

interface Program {
  title: string;
  start: string;
  end: string;
  desc?: string;
}

// Parse XMLTV datetime "20240408210000 +0200" → ms timestamp
function parseXmltvDate(s: string): number {
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return 0;
  const [, Y, Mo, D, H, Mi, S, tz] = m;
  const tzSign  = tz?.startsWith('-') ? -1 : 1;
  const tzHH    = tz ? parseInt(tz.slice(1, 3)) : 0;
  const tzMM    = tz ? parseInt(tz.slice(3, 5)) : 0;
  const tzOffset = tzSign * (tzHH * 60 + tzMM) * 60000;
  return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S) - tzOffset;
}

// Extract text content between XML tags (simple, no nesting needed)
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

// Decode common XML entities
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

Deno.serve(async (_req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (_req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const res = await fetch(EPG_URL, {
      headers: { "User-Agent": "AnunciosTV/1.0 EPG-Proxy" },
    });
    if (!res.ok) throw new Error(`EPG fetch failed: ${res.status}`);
    const xml = await res.text();

    // ── 1. Build map: xmltv channel id → our channel id ───────
    // Extract all <channel id="..."><display-name>...</display-name></channel>
    const xmltvToOurId: Record<string, string> = {};
    const channelRe = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = channelRe.exec(xml)) !== null) {
      const xmltvId   = cm[1];
      const block     = cm[2];
      // Get all display-name values
      const nameRe    = /<display-name[^>]*>([^<]+)<\/display-name>/gi;
      let nm: RegExpExecArray | null;
      while ((nm = nameRe.exec(block)) !== null) {
        const displayName = decodeEntities(nm[1].trim()).toLowerCase();
        for (const [ourId, aliases] of Object.entries(CHANNEL_MAP)) {
          if (aliases.some(a => displayName.includes(a.toLowerCase()) || a.toLowerCase().includes(displayName))) {
            xmltvToOurId[xmltvId] = ourId;
            break;
          }
        }
        if (xmltvToOurId[xmltvId]) break;
      }
    }

    // ── 2. Parse <programme> elements ─────────────────────────
    const now = Date.now();
    const progsByChannel: Record<string, Program[]> = {};

    const progRe = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = progRe.exec(xml)) !== null) {
      const [, startStr, stopStr, xmltvId, body] = pm;
      const ourId = xmltvToOurId[xmltvId];
      if (!ourId) continue;

      const start = parseXmltvDate(startStr);
      const end   = parseXmltvDate(stopStr);
      if (!start || !end) continue;

      const title = decodeEntities(extractTag(body, 'title'));
      const desc  = decodeEntities(extractTag(body, 'desc'));
      if (!title) continue;

      if (!progsByChannel[ourId]) progsByChannel[ourId] = [];
      progsByChannel[ourId].push({
        title,
        start: new Date(start).toISOString(),
        end:   new Date(end).toISOString(),
        ...(desc ? { desc } : {}),
      });
    }

    // ── 3. Find current + next programme per channel ──────────
    const result: Record<string, { now: Program | null; next: Program | null }> = {};

    for (const [ourId, progs] of Object.entries(progsByChannel)) {
      progs.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      let nowProg: Program | null = null;
      let nextProg: Program | null = null;

      for (let i = 0; i < progs.length; i++) {
        const s = new Date(progs[i].start).getTime();
        const e = new Date(progs[i].end).getTime();
        if (s <= now && now < e) {
          nowProg  = progs[i];
          nextProg = progs[i + 1] ?? null;
          break;
        }
      }
      result[ourId] = { now: nowProg, next: nextProg };
    }

    // ── 4. Fill missing channels with nulls ───────────────────
    for (const ourId of Object.keys(CHANNEL_MAP)) {
      if (!result[ourId]) result[ourId] = { now: null, next: null };
    }

    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (err) {
    console.error("[epg-proxy] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
  }
});
