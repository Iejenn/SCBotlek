-- =====================================================================
-- SC Botlek — wachtlijst na afloop van een wedstrijd
--
-- Waarom: soms spelen wachtlijstspelers toch mee (iemand ziek, of met meer).
-- * De limiet (max spelers) geldt alleen VÓÓR de wedstrijd. Achteraf kan de
--   aanvoerder iedereen op aanwezig zetten, ook boven de limiet.
-- * Na afloop schuift de wachtlijst niet meer automatisch door; wie er niet
--   was op ✕ zetten maakt dus niet vanzelf een ander 'aanwezig'.
-- Alleen set_attendance verandert (zelfde signatuur). Geen data wijzigt.
--
-- Laag risico, daarom direct COMMIT.
-- =====================================================================

BEGIN;

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
  -- Alleen vóór de wedstrijd; achteraf legt de aanvoerder vast wie er écht was
  IF p_status = 'aanwezig' AND v_kind = 'wedstrijd' AND v_starts_at > now()
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

  -- Doorschuiven alleen vóór de wedstrijd (na afloop niemand automatisch 'aanwezig' maken)
  IF v_kind = 'wedstrijd' AND v_starts_at > now() THEN
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

COMMIT;
