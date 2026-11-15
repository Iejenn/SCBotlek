-- =====================================================================
-- SC Botlek — automatische sync van wedstrijden uit Sportlink
-- Vereist: 001_schema.sql is al gedraaid (met COMMIT).
--
-- Wat dit doet:
--   * Postgres haalt zelf programma + uitslagen op bij data.sportlink.com
--     (http-extensie), elke 3 uur via pg_cron.
--   * Wedstrijden worden toegevoegd/bijgewerkt op wedstrijdcode
--     (events.external_id), dus nooit dubbel.
--   * Sportlink is leidend voor: datum/tijd, tegenstander, thuis/uit,
--     locatie, soort, status en uitslag.
--   * Handmatige velden blijven staan: verzameltijd en opmerkingen.
--
-- Dry-run: dit bestand eindigt op ROLLBACK, maar haalt WEL echt de data op
-- en laat onderaan zien wat er geïmporteerd zou worden. Ziet het er goed
-- uit? Verander ROLLBACK in COMMIT en draai opnieuw.
-- =====================================================================

BEGIN;

-- Extensies (op Supabase kun je deze ook aanzetten via Database > Extensions)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ---------------------------------------------------------------------
-- Logboek van sync-runs, zodat je ziet wanneer het laatst gelukt is
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at     timestamptz NOT NULL DEFAULT now(),
  ok         boolean NOT NULL,
  imported   int,
  message    text
);
CREATE INDEX IF NOT EXISTS sync_runs_ran_at_idx ON public.sync_runs (ran_at DESC);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_runs_select_staff ON public.sync_runs;
CREATE POLICY sync_runs_select_staff ON public.sync_runs
  FOR SELECT TO authenticated USING ((select public.is_staff()));

-- ---------------------------------------------------------------------
-- De sync zelf. Draait als eigenaar (postgres), wordt aangeroepen door
-- pg_cron of via sync_now() hieronder. Niet direct aanroepbaar door clients.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_sportlink()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  -- Codes van SC Botlek 7. client_id = de Dataservice-sleutel van de club.
  c_base   constant text := 'https://data.sportlink.com';
  c_client constant text := 'Uwi8A1u9lK';
  c_team   constant text := '119436';

  v_resp   extensions.http_response;
  v_prog   jsonb;
  v_uits   jsonb;
  v_count  int;
BEGIN
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');

  -- 1) Programma (komende ~8 maanden)
  SELECT * INTO v_resp FROM extensions.http_get(
    c_base || '/programma?client_id=' || c_client || '&teamcode=' || c_team
           || '&lokaleteamcode=-1&aantaldagen=250');
  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'programma gaf HTTP %', v_resp.status;
  END IF;
  v_prog := v_resp.content::jsonb;

  -- 2) Uitslagen (afgelopen jaar)
  SELECT * INTO v_resp FROM extensions.http_get(
    c_base || '/uitslagen?client_id=' || c_client || '&teamcode=' || c_team
           || '&lokaleteamcode=-1&aantaldagen=365&weekoffset=-52');
  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'uitslagen gaf HTTP %', v_resp.status;
  END IF;
  v_uits := v_resp.content::jsonb;

  IF jsonb_typeof(v_prog) <> 'array' OR jsonb_typeof(v_uits) <> 'array' THEN
    RAISE EXCEPTION 'onverwacht antwoord van Sportlink (geen lijst)';
  END IF;

  -- 3) Omzetten en upserten
  WITH raw AS (
    SELECT m, false AS from_results FROM jsonb_array_elements(v_prog) m
    UNION ALL
    SELECT m, true FROM jsonb_array_elements(v_uits) m
  ),
  parsed AS (
    -- Staat een wedstrijd in beide lijsten, dan wint de uitslagen-versie
    SELECT DISTINCT ON (m->>'wedstrijdcode')
      m->>'wedstrijdcode'                                       AS code,
      (m->>'wedstrijddatum')::timestamptz                       AS starts_at,
      (m->>'thuisteamid') = c_team                              AS is_home,
      CASE WHEN (m->>'thuisteamid') = c_team
           THEN m->>'uitteam' ELSE m->>'thuisteam' END          AS opponent,
      -- veldnummer erbij, bijv. "Sportpark De Brug · veld 3"
      concat_ws(' · ', nullif(m->>'accommodatie', ''), nullif(m->>'veld', '')) AS location,
      lower(coalesce(m->>'competitiesoort', ''))                AS soort,
      lower(coalesce(m->>'status', ''))                         AS sl_status,
      -- "1 - 2" -> {1,2}; uitslag-regulier = zonder verlenging/penalty's
      regexp_match(coalesce(m->>'uitslag-regulier', m->>'uitslag', ''),
                   '^\s*(\d+)\s*-\s*(\d+)')                     AS sc
    FROM raw
    WHERE m ? 'wedstrijdcode' AND m ? 'wedstrijddatum'
    ORDER BY m->>'wedstrijdcode', from_results DESC
  ),
  final AS (
    SELECT
      code, starts_at, is_home,
      left(opponent, 60)  AS opponent,
      left(location, 100) AS location,
      CASE WHEN soort LIKE '%beker%' THEN 'beker'
           WHEN soort LIKE '%oefen%' OR soort LIKE '%vriendschap%' THEN 'oefen'
           ELSE 'competitie' END AS competition,
      CASE WHEN sc IS NOT NULL THEN 'gespeeld'
           -- Sportlink gebruikt "Gestaakt" voor wedstrijden die niet (uit)gespeeld zijn
           WHEN sl_status LIKE '%afgelast%' OR sl_status LIKE '%gestaakt%' THEN 'afgelast'
           ELSE 'gepland' END AS status,
      CASE WHEN sc IS NULL THEN NULL
           WHEN is_home THEN sc[1]::int ELSE sc[2]::int END AS score_us,
      CASE WHEN sc IS NULL THEN NULL
           WHEN is_home THEN sc[2]::int ELSE sc[1]::int END AS score_them
    FROM parsed
  )
  INSERT INTO public.events
    (kind, starts_at, location, opponent, is_home, competition, status,
     score_us, score_them, source, external_id)
  SELECT 'wedstrijd', starts_at, location, opponent, is_home, competition, status,
         score_us, score_them, 'voetbalnl', code
  FROM final
  ON CONFLICT (external_id) DO UPDATE SET
    starts_at   = EXCLUDED.starts_at,
    location    = EXCLUDED.location,
    opponent    = EXCLUDED.opponent,
    is_home     = EXCLUDED.is_home,
    competition = EXCLUDED.competition,
    status      = EXCLUDED.status,
    score_us    = EXCLUDED.score_us,
    score_them  = EXCLUDED.score_them,
    updated_at  = now()
  -- alleen bijwerken als er echt iets veranderd is
  WHERE (events.starts_at, events.location, events.opponent, events.is_home,
         events.competition, events.status, events.score_us, events.score_them)
        IS DISTINCT FROM
        (EXCLUDED.starts_at, EXCLUDED.location, EXCLUDED.opponent, EXCLUDED.is_home,
         EXCLUDED.competition, EXCLUDED.status, EXCLUDED.score_us, EXCLUDED.score_them);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.sync_runs (ok, imported, message)
  VALUES (true, v_count, format('%s in programma, %s uitslagen',
                                jsonb_array_length(v_prog), jsonb_array_length(v_uits)));
  -- logboek klein houden
  DELETE FROM public.sync_runs WHERE ran_at < now() - interval '30 days';

  RETURN jsonb_build_object('ok', true, 'changed', v_count);
EXCEPTION
  WHEN OTHERS THEN
    -- Fout? Niets aan de events veranderd; wel loggen.
    INSERT INTO public.sync_runs (ok, message) VALUES (false, left(SQLERRM, 300));
    RETURN jsonb_build_object('ok', false, 'reason', 'sync_failed', 'message', SQLERRM);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_sportlink() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- "Nu bijwerken"-knop voor staf. Max 1x per 5 minuten, zodat niemand
-- Sportlink kan bestoken.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_now()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sync_runs WHERE ran_at > now() - interval '5 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_soon');
  END IF;
  RETURN public.sync_sportlink();
END;
$$;
GRANT  EXECUTE ON FUNCTION public.sync_now() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_now() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- Elke 3 uur draaien (tijden in UTC, op minuut 7 om de drukte te mijden).
-- Opnieuw draaien van dit bestand overschrijft de bestaande job.
-- ---------------------------------------------------------------------
SELECT cron.schedule('sportlink-sync', '7 */3 * * *', 'SELECT public.sync_sportlink()');

-- ---------------------------------------------------------------------
-- Proefrun: echt ophalen en laten zien wat er binnenkomt
-- ---------------------------------------------------------------------
SELECT public.sync_sportlink() AS resultaat;

SELECT starts_at AT TIME ZONE 'Europe/Amsterdam' AS aanvang,
       CASE WHEN is_home THEN 'thuis' ELSE 'uit' END AS waar,
       opponent, competition, status, score_us, score_them
FROM public.events
WHERE source = 'voetbalnl'
ORDER BY starts_at;

-- Dry-run: ROLLBACK. Ziet de lijst er goed uit? Verander in COMMIT.
ROLLBACK;
