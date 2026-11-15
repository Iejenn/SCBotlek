-- =====================================================================
-- SC Botlek — maximaal aantal spelers per wedstrijd + wachtlijst
--
-- * team_settings: één rij met teaminstellingen (max_match_players, leeg = geen limiet)
-- * attendance.status krijgt een extra waarde: 'wachtlijst'
-- * set_attendance: ✓ bij een volle wedstrijd -> automatisch wachtlijst;
--   meldt iemand zich af -> eerste van de wachtlijst schuift door
-- * set_team_settings: staf past de limiet aan (bij verhogen schuiven
--   wachtenden van komende wedstrijden direct door)
--
-- Volgorde op de wachtlijst = moment van aanmelden (updated_at). Daarom
-- verandert updated_at voortaan alleen als de status echt verandert.
-- Een rij per wedstrijd wordt even op slot gezet (FOR UPDATE), zodat twee
-- spelers die tegelijk drukken nooit samen de laatste plek krijgen.
--
-- Niet destructief. Dry-run: laat ROLLBACK staan, controleer de uitkomst
-- onderaan, verander dan in COMMIT.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- instellingen
CREATE TABLE IF NOT EXISTS public.team_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),  -- altijd precies één rij
  max_match_players  int CHECK (max_match_players BETWEEN 1 AND 50),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.team_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_settings_select_visible ON public.team_settings;
CREATE POLICY team_settings_select_visible ON public.team_settings
  FOR SELECT TO authenticated USING ((select public.can_view()));

-- ---------------------------------------------------------------- nieuwe status
ALTER TABLE public.attendance DROP CONSTRAINT attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('aanwezig','afwezig','misschien','wachtlijst'));

-- Snel tellen per wedstrijd + status
CREATE INDEX IF NOT EXISTS attendance_event_status_idx ON public.attendance (event_id, status, updated_at);

-- ---------------------------------------------------------------- doorschuiven
-- Vult vrije plekken met de wachtlijst (oudste aanmelding eerst). Intern:
-- alleen aangeroepen door de functies hieronder, niet door clients.
CREATE OR REPLACE FUNCTION public.promote_waitlist(p_event_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max  int;
  v_free int;
  v_n    int;
BEGIN
  SELECT max_match_players INTO v_max FROM public.team_settings WHERE id;

  IF v_max IS NULL THEN
    -- Geen limiet (meer): iedereen van de wachtlijst erbij
    UPDATE public.attendance SET status = 'aanwezig', updated_at = now()
     WHERE event_id = p_event_id AND status = 'wachtlijst';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
  END IF;

  SELECT v_max - count(*) INTO v_free
    FROM public.attendance WHERE event_id = p_event_id AND status = 'aanwezig';
  IF v_free <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.attendance a
     SET status = 'aanwezig', updated_at = now()
    FROM (SELECT player_id FROM public.attendance
           WHERE event_id = p_event_id AND status = 'wachtlijst'
           ORDER BY updated_at, player_id
           LIMIT v_free) w
   WHERE a.event_id = p_event_id AND a.player_id = w.player_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promote_waitlist(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- aanmelden (zelfde signatuur als in 001)
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

  -- Wedstrijd op slot zetten zolang we tellen (voorkomt dubbele laatste plek)
  SELECT starts_at, kind INTO v_starts_at, v_kind
    FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF v_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;
  IF v_starts_at < now() AND NOT v_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_started');
  END IF;

  v_final := p_status;
  SELECT status INTO v_current FROM public.attendance
   WHERE event_id = p_event_id AND player_id = v_player;

  -- Limiet geldt alleen voor wedstrijden
  IF p_status = 'aanwezig' AND v_kind = 'wedstrijd' THEN
    SELECT max_match_players INTO v_max FROM public.team_settings WHERE id;
    IF v_max IS NOT NULL AND v_current IS DISTINCT FROM 'aanwezig' THEN
      SELECT count(*) INTO v_taken FROM public.attendance
       WHERE event_id = p_event_id AND status = 'aanwezig';
      IF v_taken >= v_max THEN
        v_final := 'wachtlijst';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.attendance AS a (event_id, player_id, status, note, updated_at)
  VALUES (p_event_id, v_player, v_final, left(nullif(trim(p_note), ''), 200), now())
  ON CONFLICT (event_id, player_id)
  DO UPDATE SET status = EXCLUDED.status,
                note = EXCLUDED.note,
                -- tijdstip alleen verversen bij een echte statuswijziging (= plek op de wachtlijst)
                updated_at = CASE WHEN a.status IS DISTINCT FROM EXCLUDED.status THEN now() ELSE a.updated_at END;

  -- Plek vrijgekomen? Wachtlijst laten doorschuiven
  IF v_kind = 'wedstrijd' THEN
    PERFORM public.promote_waitlist(p_event_id);
  END IF;

  -- Actuele status + eventuele plek op de wachtlijst teruggeven
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
-- Rechten van set_attendance blijven zoals ze waren (CREATE OR REPLACE behoudt ze)

-- ---------------------------------------------------------------- instellingen opslaan
CREATE OR REPLACE FUNCTION public.set_team_settings(p_max_match_players int)
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
  IF p_max_match_players IS NOT NULL AND p_max_match_players NOT BETWEEN 1 AND 50 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  UPDATE public.team_settings
     SET max_match_players = p_max_match_players, updated_at = now()
   WHERE id;

  -- Limiet omhoog of weg: wachtenden van komende wedstrijden direct laten doorschuiven.
  -- (Limiet omlaag: wie al een plek heeft, houdt die.)
  FOR v_ev IN SELECT id FROM public.events
               WHERE kind = 'wedstrijd' AND starts_at > now() FOR UPDATE LOOP
    v_promoted := v_promoted + public.promote_waitlist(v_ev.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'max_match_players', p_max_match_players, 'promoted', v_promoted);
END;
$$;
GRANT  EXECUTE ON FUNCTION public.set_team_settings(int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_team_settings(int) FROM PUBLIC, anon;

-- ---------------------------------------------------------------- controle
SELECT * FROM public.team_settings;
SELECT pg_get_constraintdef(oid) AS nieuwe_statussen
  FROM pg_constraint WHERE conname = 'attendance_status_check';

-- Dry-run: ROLLBACK. Geen fouten? Verander in COMMIT en draai opnieuw.
ROLLBACK;
