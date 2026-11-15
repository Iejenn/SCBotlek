-- =====================================================================
-- SC Botlek — fase 2: statistieken per wedstrijd opslaan
-- Vereist: 001 en 002 zijn gedraaid.
--
-- Nieuwe RPC save_match_stats: staf slaat in één keer alle doelpunten,
-- assists en kaarten van een wedstrijd op (vervangt wat er stond).
-- De tabel match_stats bestond al sinds 001; er verandert niets aan data.
--
-- Laag risico (alleen een nieuwe functie), daarom direct COMMIT.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.save_match_stats(p_event_id uuid, p_stats jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event   public.events%ROWTYPE;
  v_goals   int;
  v_assists int;
  v_rows    int;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;
  IF v_event.kind <> 'wedstrijd' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_match');
  END IF;
  IF v_event.starts_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'match_not_started');
  END IF;
  IF jsonb_typeof(p_stats) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- Negatieve getallen expliciet weigeren (anders zouden ze stil wegvallen)
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stats) s
    WHERE coalesce((s->>'goals')::int, 0) < 0
       OR coalesce((s->>'assists')::int, 0) < 0
       OR coalesce((s->>'yellow_cards')::int, 0) < 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- Meer doelpunten/assists dan de uitslag kan niet
  -- (minder wel: eigen doelpunten van de tegenstander tellen niet mee)
  SELECT coalesce(sum((s->>'goals')::int), 0),
         coalesce(sum((s->>'assists')::int), 0)
    INTO v_goals, v_assists
    FROM jsonb_array_elements(p_stats) s;
  IF v_event.score_us IS NOT NULL AND (v_goals > v_event.score_us OR v_assists > v_event.score_us) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_goals');
  END IF;

  -- Vervangen: oude regels weg, nieuwe erin (alleen spelers met iets ingevuld)
  DELETE FROM public.match_stats WHERE event_id = p_event_id;

  INSERT INTO public.match_stats (event_id, player_id, goals, assists, yellow_cards, red_card)
  SELECT p_event_id,
         (s->>'player_id')::uuid,
         coalesce((s->>'goals')::int, 0),
         coalesce((s->>'assists')::int, 0),
         coalesce((s->>'yellow_cards')::int, 0),
         coalesce((s->>'red_card')::boolean, false)
  FROM jsonb_array_elements(p_stats) s
  WHERE s->>'player_id' IS NOT NULL
    AND (coalesce((s->>'goals')::int, 0) > 0
      OR coalesce((s->>'assists')::int, 0) > 0
      OR coalesce((s->>'yellow_cards')::int, 0) > 0
      OR coalesce((s->>'red_card')::boolean, false));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
EXCEPTION
  -- Negatieve getallen, onbekende speler, dubbele speler of rare invoer:
  -- alles wordt teruggedraaid (ook de DELETE hierboven)
  WHEN check_violation OR foreign_key_violation OR unique_violation
    OR invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
END;
$$;

GRANT  EXECUTE ON FUNCTION public.save_match_stats(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_match_stats(uuid, jsonb) FROM PUBLIC, anon;

COMMIT;
