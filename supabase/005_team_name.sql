-- =====================================================================
-- SC Botlek — teamnaam per wedstrijd bewaren
-- Waarom: het team heet niet elk seizoen hetzelfde (vorig seizoen SC Botlek 6,
-- nu SC Botlek 7). Sportlink geeft per wedstrijd de naam van dat moment mee;
-- die slaan we nu op in events.team_name, zodat de app per seizoen de juiste naam toont.
--
-- Niet destructief: één nieuwe (lege) kolom + nieuwe versie van de sync.
-- De sync draait meteen en vult de kolom voor alle Sportlink-wedstrijden.
-- Onderaan zie je per seizoen welke naam er gevonden is.
-- =====================================================================

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS team_name text CHECK (char_length(team_name) <= 60);

CREATE OR REPLACE FUNCTION public.sync_sportlink()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  -- Codes van SC Botlek (teamcode blijft gelijk, ook als het teamnummer wisselt)
  c_base   constant text := 'https://data.sportlink.com';
  c_client constant text := 'Uwi8A1u9lK';
  c_team   constant text := '119436';

  v_resp   extensions.http_response;
  v_prog   jsonb;
  v_uits   jsonb;
  v_count  int;
BEGIN
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');

  SELECT * INTO v_resp FROM extensions.http_get(
    c_base || '/programma?client_id=' || c_client || '&teamcode=' || c_team
           || '&lokaleteamcode=-1&aantaldagen=250');
  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'programma gaf HTTP %', v_resp.status;
  END IF;
  v_prog := v_resp.content::jsonb;

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

  WITH raw AS (
    SELECT m, false AS from_results FROM jsonb_array_elements(v_prog) m
    UNION ALL
    SELECT m, true FROM jsonb_array_elements(v_uits) m
  ),
  parsed AS (
    SELECT DISTINCT ON (m->>'wedstrijdcode')
      m->>'wedstrijdcode'                                       AS code,
      (m->>'wedstrijddatum')::timestamptz                       AS starts_at,
      (m->>'thuisteamid') = c_team                              AS is_home,
      CASE WHEN (m->>'thuisteamid') = c_team
           THEN m->>'uitteam' ELSE m->>'thuisteam' END          AS opponent,
      -- onze eigen teamnaam op dat moment, bijv. "Botlek, SC 6"
      CASE WHEN (m->>'thuisteamid') = c_team
           THEN m->>'thuisteam' ELSE m->>'uitteam' END          AS team_name,
      concat_ws(' · ', nullif(m->>'accommodatie', ''), nullif(m->>'veld', '')) AS location,
      lower(coalesce(m->>'competitiesoort', ''))                AS soort,
      lower(coalesce(m->>'status', ''))                         AS sl_status,
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
      left(team_name, 60) AS team_name,
      left(location, 100) AS location,
      CASE WHEN soort LIKE '%beker%' THEN 'beker'
           WHEN soort LIKE '%oefen%' OR soort LIKE '%vriendschap%' THEN 'oefen'
           ELSE 'competitie' END AS competition,
      CASE WHEN sc IS NOT NULL THEN 'gespeeld'
           WHEN sl_status LIKE '%afgelast%' OR sl_status LIKE '%gestaakt%' THEN 'afgelast'
           ELSE 'gepland' END AS status,
      CASE WHEN sc IS NULL THEN NULL
           WHEN is_home THEN sc[1]::int ELSE sc[2]::int END AS score_us,
      CASE WHEN sc IS NULL THEN NULL
           WHEN is_home THEN sc[2]::int ELSE sc[1]::int END AS score_them
    FROM parsed
  )
  INSERT INTO public.events
    (kind, starts_at, location, opponent, team_name, is_home, competition, status,
     score_us, score_them, source, external_id)
  SELECT 'wedstrijd', starts_at, location, opponent, team_name, is_home, competition, status,
         score_us, score_them, 'voetbalnl', code
  FROM final
  ON CONFLICT (external_id) DO UPDATE SET
    starts_at   = EXCLUDED.starts_at,
    location    = EXCLUDED.location,
    opponent    = EXCLUDED.opponent,
    team_name   = EXCLUDED.team_name,
    is_home     = EXCLUDED.is_home,
    competition = EXCLUDED.competition,
    status      = EXCLUDED.status,
    score_us    = EXCLUDED.score_us,
    score_them  = EXCLUDED.score_them,
    updated_at  = now()
  WHERE (events.starts_at, events.location, events.opponent, events.team_name, events.is_home,
         events.competition, events.status, events.score_us, events.score_them)
        IS DISTINCT FROM
        (EXCLUDED.starts_at, EXCLUDED.location, EXCLUDED.opponent, EXCLUDED.team_name, EXCLUDED.is_home,
         EXCLUDED.competition, EXCLUDED.status, EXCLUDED.score_us, EXCLUDED.score_them);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.sync_runs (ok, imported, message)
  VALUES (true, v_count, format('%s in programma, %s uitslagen',
                                jsonb_array_length(v_prog), jsonb_array_length(v_uits)));
  DELETE FROM public.sync_runs WHERE ran_at < now() - interval '30 days';

  RETURN jsonb_build_object('ok', true, 'changed', v_count);
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.sync_runs (ok, message) VALUES (false, left(SQLERRM, 300));
    RETURN jsonb_build_object('ok', false, 'reason', 'sync_failed', 'message', SQLERRM);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_sportlink() FROM PUBLIC, anon, authenticated;

-- Meteen draaien zodat team_name gevuld wordt
SELECT public.sync_sportlink() AS resultaat;

COMMIT;

-- Controle: welke teamnaam per seizoen (seizoen start 1 juli)
SELECT CASE WHEN extract(month FROM starts_at AT TIME ZONE 'Europe/Amsterdam') >= 7
            THEN extract(year FROM starts_at AT TIME ZONE 'Europe/Amsterdam')
            ELSE extract(year FROM starts_at AT TIME ZONE 'Europe/Amsterdam') - 1 END AS seizoen_start,
       team_name, count(*) AS wedstrijden
FROM public.events
WHERE source = 'voetbalnl'
GROUP BY 1, 2
ORDER BY 1, 2;
