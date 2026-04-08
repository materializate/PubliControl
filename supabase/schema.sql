-- ─────────────────────────────────────────────────────────────────
--  ANUNCIOS.TV — Schema de Supabase
--  Ejecuta esto en el SQL Editor de tu proyecto Supabase:
--  https://app.supabase.com → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────

-- Tabla principal de reportes de publicidad
CREATE TABLE IF NOT EXISTS public.ad_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  TEXT        NOT NULL,
  duration    INTEGER     NULL,                    -- segundos, null = desconocido
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  reporters   INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_ad_reports_active
  ON public.ad_reports (channel_id, is_active, started_at DESC);

-- ─── Row Level Security ────────────────────────────────────────
ALTER TABLE public.ad_reports ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer reportes activos (acceso anónimo)
CREATE POLICY "Public read active reports"
  ON public.ad_reports
  FOR SELECT
  USING (is_active = TRUE);

-- Cualquiera puede insertar un nuevo reporte (anónimo)
CREATE POLICY "Public insert reports"
  ON public.ad_reports
  FOR INSERT
  WITH CHECK (TRUE);

-- Cualquiera puede actualizar (incrementar reporters, marcar como ended)
CREATE POLICY "Public update reports"
  ON public.ad_reports
  FOR UPDATE
  USING (TRUE);

-- ─── Realtime ──────────────────────────────────────────────────
-- Habilita Realtime para la tabla (hazlo también desde
-- Supabase Dashboard → Database → Replication → ad_reports ✓)
ALTER TABLE public.ad_reports REPLICA IDENTITY FULL;

-- ─── Auto-cleanup: desactiva reportes con más de 30 min ────────
-- Crea una función que se puede llamar periódicamente
CREATE OR REPLACE FUNCTION public.cleanup_old_ad_reports()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.ad_reports
  SET is_active = FALSE,
      ended_at  = now()
  WHERE is_active = TRUE
    AND started_at < now() - INTERVAL '30 minutes';
$$;

-- ─────────────────────────────────────────────────────────────────
--  OPCIONAL: Cron job para cleanup automático cada 5 minutos
--  Requiere extensión pg_cron (disponible en Supabase Pro)
-- ─────────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'cleanup-old-ads',
--   '*/5 * * * *',
--   'SELECT public.cleanup_old_ad_reports()'
-- );
-- ─────────────────────────────────────────────────────────────────
