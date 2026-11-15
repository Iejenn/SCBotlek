-- =====================================================================
-- SC Botlek — aanmeldvenster: pas X dagen voor een wedstrijd kun je ✓ geven
-- Waarom: eerlijk voor spelers met ploegendiensten; niemand claimt weken
-- van tevoren al een plek.
--
-- * team_settings.signup_open_days (leeg = altijd open)
-- * set_attendance: ✓ bij een wedstrijd kan pas vanaf (aanvang - X dagen).
--   Afmelden (✕) en "misschien" kunnen altijd. Wie al een plek had, houdt die.
--   Geldt voor iedereen, ook voor aanvoerders (eerlijk is eerlijk).
-- * set_team_settings krijgt een extra parameter. Omdat de parameters
--   veranderen, wordt de oude versie eerst verwijderd (anders zou Postgres
--   er een tweede functie naast zetten).
--
-- Dry-run: laat ROLLBACK staan, controleer, verander dan in COMMIT.
-- =====================================================================

BEGIN;

ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS signup_open_days int CHECK (signup_open_days BETWEEN 1 AND 60);

-- ---------------------------------------------------------------- aanmelden (zelfde signatuur)
CREATE OR REPLACE FUNCTION public.set_attendance(
  p_event_id  uuid,
  p_status    text,
  p_note      text DEFAULT NULL,
  p_player_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff     boolean := public.is_staff();
  v_own       uuid;
  v_player    uuid;
  v_starts_at timestamptz;
  v_kind      text;
  v_max       int;
  v_days      int;
  v_current   text;
  v_taken     int;
  v_final     text;
  v_position  int;
BEGIN
  IF NOT public.is_team() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  -- 'wachtlijst' kan je niet zelf kiezen; dat bepaalt de server
  IF p_status NOT IN ('aanwezig','afwezig','misschien') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT player_id INTO v_own FROM public.profiles WHERE id = auth.uid();
  v_player := coalesce(p_player_id, v_own);

  IF v_player IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_player_linked');
  END IF;
  IF v_player IS DISTINCT FROM v_own AND NOT v_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;

  -- Wedstrijd op slot zolang we tellen (voorkomt dubbele laatste plek)
  SELECT starts_at, kind INTO v_starts_at, v_kind
    FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF v_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;
  IF v_starts_at < now() AND NOT v_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_started');
  END IF;

  SELECT status INTO v_current FROM public.attendance
   WHERE event_id = p_event_id AND player_id = v_player;
  SELECT max_match_players, signup_open_days INTO v_max, v_days
    FROM public.team_settings WHERE id;

  -- Aanmeldvenster: ✓ voor een wedstrijd pas vanaf (aanvang - X dagen).
  -- Wie al aanwezig of op de wachtlijst staat, houdt zijn plek.
  IF p_status = 'aanwezig' AND v_kind = 'wedstrijd' AND v_days IS NOT NULL
     AND v_current IS DISTINCT FROM 'aanwezig' AND v_current IS DISTINCT FROM 'wachtlijst'
     AND now() < v_starts_at - make_interval(days => v_days) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'signup_not_open',
                              'opens_at', v_starts_at - make_interval(days => v_days));
  END IF;

  v_final := p_status;

  -- Limiet geldt alleen voor wedstrijden
  IF p_status = 'aanwezig' AND v_kind = 'wedstrijd'
     AND v_max IS NOT NULL AND v_current IS DISTINCT FROM 'aanwezig' THEN
    SELECT count(*) INTO v_taken FROM public.attendance
     WHERE event_id = p_event_id AND status = 'aanwezig';
    IF v_taken >= v_max THEN
      v_final := 'wachtlijst';
    END IF;
  END IF;

  INSERT INTO public.attendance AS a (event_id, player_id, status, note, updated_at)
  VALUES (p_event_id, v_player, v_final, left(nullif(trim(p_note), ''), 200), now())
  ON CONFLICT (event_id, player_id)
  DO UPDATE SET status = EXCLUDED.status,
                note = EXCLUDED.note,
                updated_at = CASE WHEN a.status IS DISTINCT FROM EXCLUDED.status THEN now() ELSE a.updated_at END;

  IF v_kind = 'wedstrijd' THEN
    PERFORM public.promote_waitlist(p_event_id);
  END IF;

  SELECT status INTO v_final FROM public.attendance
   WHERE event_id = p_event_id AND player_id = v_player;
  IF v_final = 'wachtlijst' THEN
    SELECT count(*) INTO v_position FROM public.attendance w, public.attendance me
     WHERE me.event_id = p_event_id AND me.player_id = v_player
       AND w.event_id = p_event_id AND w.status = 'wachtlijst'
       AND (w.updated_at, w.player_id) <= (me.updated_at, me.player_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_final, 'position', v_position);
END;
$$;

-- ---------------------------------------------------------------- instellingen (nieuwe signatuur)
DROP FUNCTION IF EXISTS public.set_team_settings(int);

CREATE OR REPLACE FUNCTION public.set_team_settings(
  p_max_match_players int,
  p_signup_open_days  int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_promoted int := 0;
  v_ev       record;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF (p_max_match_players IS NOT NULL AND p_max_match_players NOT BETWEEN 1 AND 50)
  OR (p_signup_open_days  IS NOT NULL AND p_signup_open_days  NOT BETWEEN 1 AND 60) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  UPDATE public.team_settings
     SET max_match_players = p_max_match_players,
         signup_open_days  = p_signup_open_days,
         updated_at = now()
   WHERE id;

  -- Limiet omhoog of weg: wachtenden van komende wedstrijden laten doorschuiven
  FOR v_ev IN SELECT id FROM public.events
               WHERE kind = 'wedstrijd' AND starts_at > now() FOR UPDATE LOOP
    v_promoted := v_promoted + public.promote_waitlist(v_ev.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'promoted', v_promoted);
END;
$$;
GRANT  EXECUTE ON FUNCTION public.set_team_settings(int, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_team_settings(int, int) FROM PUBLIC, anon;

-- Controle: precies één set_team_settings, en de nieuwe kolom
SELECT p.oid::regprocedure AS functie
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'set_team_settings';
SELECT * FROM public.team_settings;

-- Dry-run: ROLLBACK. Geen fouten? Verander in COMMIT en draai opnieuw.
ROLLBACK;
