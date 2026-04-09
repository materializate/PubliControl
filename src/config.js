/**
 * ─────────────────────────────────────────────────────────────
 *  ANUNCIOS.TV — Configuración
 * ─────────────────────────────────────────────────────────────
 *
 *  1. Crea un proyecto gratis en https://supabase.com
 *  2. Ve a Project Settings → API
 *  3. Copia "Project URL" y "anon public" key aquí abajo
 *  4. Ve a Table Editor y ejecuta el SQL de /supabase/schema.sql
 *  5. Despliega la Edge Function:
 *       supabase functions deploy epg-proxy --no-verify-jwt
 *  6. ¡Listo! La app funciona en modo comunitario + EPG real
 *
 *  Si dejas los valores vacíos (''), la app funciona en modo
 *  local (solo tu dispositivo, sin sincronización ni EPG).
 * ─────────────────────────────────────────────────────────────
 */

window.SUPABASE_URL  = '';   // ej: 'https://abcdefgh.supabase.co'
window.SUPABASE_ANON = '';   // ej: 'eyJhbGciOiJIUzI1NiIs...'

// EPG Proxy — se construye automáticamente a partir de SUPABASE_URL
// Si quieres usar otro proxy EPG, sobrescribe esta variable:
window.EPG_PROXY_URL = window.SUPABASE_URL
  ? window.SUPABASE_URL + '/functions/v1/epg-proxy'
  : '';

