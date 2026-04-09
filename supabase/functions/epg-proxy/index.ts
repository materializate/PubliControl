/**
 * supabase/functions/epg-proxy/index.ts
 *
 * Edge Function que actúa como proxy EPG:
 *  1. Descarga el XML de TDTChannels (EPG oficial gratuito TDT España)
 *  2. Parsea el XMLTV en Deno
 *  3. Devuelve el programa actual + siguiente de cada canal en JSON
 *  4. Cachea la respuesta 10 minutos (header Cache-Control)
 *
 * Deploy:
 *   supabase functions deploy epg-proxy --no-verify-jwt
 *
 * Uso desde la app:
 *   GET https://<project>.supabase.co/functions/v1/epg-proxy
 *   → { "la1": { "now": { title, start, end, desc }, "next": {...} }, ... }
 */

const EPG_URL = "https://www.tdtchannels.com/epg/TV.xml";

// Mapping: nuestro channelId → xmltv channel id de TDTChannels
const CHANNEL_MAP: Record<string, string> = {
  la1:      "La 1",
  la2:      "La 2",
  a3:       "Antena 3",
  cuatro:   "Cuatro",
  t5:       "Telecinco",
  sx:       "La Sexta",
  dmax:     "DMAX",
  energy:   "Energy",
  divinity: "Divinity",
  bemad:    "Be Mad",
  mega:     "Mega",
  clan:     "Clan",
  nova:     "Nova",
  trece:    "Trece",
  paramount:"Paramount Network",
  ax:       "AXN",
  fdf:      "FDF",
  neox:     "Neox",
  neot:     "Neo",
  star:     "Star Life",
  mtv:      "MTV",
  comedy:   "Comedy Central",
  syfy:     "Syfy",
  tbn:      "TBN España",
  euronews: "Euronews",
  rt:       "RT en Español",
  tvg:      "TVG",
  tv3:      "TV3",
  ibtv:     "IB3 Televisió",
  eitb:     "ETB 1",
  aragon:   "Aragón TV",
  extrema:  "Canal Extremadura",
  cana:     "Canal Sur",
};

interface Program {
  title: string;
  start: string;   // ISO
  end: string;     // ISO
  desc?: string;
  category?: string;
}

interface ChannelEPG {
  now: Program | null;
  next: Program | null;
}

// Parse XMLTV datetime "20240408210000 +0200" → Date
function parseXmltvDate(s: string): Date {
  const clean = s.trim();
  // Format: YYYYMMDDHHmmss [+-]HHMM
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!m) return new Date(0);
  const [, Y, Mo, D, H, Mi, S, tz] = m;
  const tzOffset = tz
    ? (parseInt(tz.slice(0, 3)) * 60 + parseInt(tz.slice(0, 1) + tz.slice(3))) 
    : 0;
  const utc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S) - tzOffset * 60000;
  return new Date(utc);
}

function getTextContent(el: Element, tag: string): string {
  return el.querySelector(tag)?.textContent?.trim() ?? "";
}

Deno.serve(async (_req) => {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=600",   // 10 min cache
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (_req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    // Fetch EPG XML
    const res = await fetch(EPG_URL, {
      headers: { "User-Agent": "AnunciosTV/1.0 EPG-Proxy" },
    });
    if (!res.ok) throw new Error(`EPG fetch failed: ${res.status}`);

    const xml = await res.text();

    // Parse XML using Deno's built-in DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const now = new Date();
    const result: Record<string, ChannelEPG> = {};

    // Build reverse map: display-name → our channelId
    const nameToId: Record<string, string> = {};
    for (const [id, name] of Object.entries(CHANNEL_MAP)) {
      nameToId[name.toLowerCase()] = id;
    }

    // Parse all <channel> elements and their display-names
    const channelEls = doc.querySelectorAll("channel");
    const xmltvIdToOurId: Record<string, string> = {};

    for (const ch of channelEls) {
      const xmltvId = ch.getAttribute("id") ?? "";
      const displayName = ch.querySelector("display-name")?.textContent?.trim().toLowerCase() ?? "";
      // Try direct match
      if (nameToId[displayName]) {
        xmltvIdToOurId[xmltvId] = nameToId[displayName];
      }
      // Try partial match
      if (!xmltvIdToOurId[xmltvId]) {
        for (const [name, ourId] of Object.entries(nameToId)) {
          if (displayName.includes(name) || name.includes(displayName)) {
            xmltvIdToOurId[xmltvId] = ourId;
            break;
          }
        }
      }
    }

    // Parse all <programme> elements
    // Group by channel
    const progsByChannel: Record<string, Program[]> = {};

    const programmes = doc.querySelectorAll("programme");
    for (const prog of programmes) {
      const chId = prog.getAttribute("channel") ?? "";
      const ourId = xmltvIdToOurId[chId];
      if (!ourId) continue;

      const start = parseXmltvDate(prog.getAttribute("start") ?? "");
      const end   = parseXmltvDate(prog.getAttribute("stop")  ?? "");
      const title = prog.querySelector("title")?.textContent?.trim() ?? "";
      const desc  = prog.querySelector("desc")?.textContent?.trim();
      const cat   = prog.querySelector("category")?.textContent?.trim();

      if (!progsByChannel[ourId]) progsByChannel[ourId] = [];
      progsByChannel[ourId].push({
        title,
        start: start.toISOString(),
        end:   end.toISOString(),
        ...(desc ? { desc } : {}),
        ...(cat  ? { category: cat } : {}),
      });
    }

    // For each channel, find current and next programme
    for (const [ourId, progs] of Object.entries(progsByChannel)) {
      // Sort by start time
      progs.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      let nowProg: Program | null = null;
      let nextProg: Program | null = null;

      for (let i = 0; i < progs.length; i++) {
        const s = new Date(progs[i].start);
        const e = new Date(progs[i].end);
        if (s <= now && now < e) {
          nowProg  = progs[i];
          nextProg = progs[i + 1] ?? null;
          break;
        }
      }

      result[ourId] = { now: nowProg, next: nextProg };
    }

    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (err) {
    console.error("[epg-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers }
    );
  }
});
