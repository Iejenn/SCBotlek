-- =====================================================================
-- SC Botlek — positie vervangen door vinkje "leenspeler"
--
-- * players.is_guest (true = leenspeler van een ander team)
-- * Wie nu positie 'leenspeler' heeft, krijgt automatisch het vinkje
-- * De kolom position blijft bestaan maar wordt niet meer gebruikt
--   (niets weggooien; kan later nog opgeruimd worden)
-- * upsert_player krijgt andere parameters (geen positie, wel leenspeler).
--   De oude versie wordt eerst verwijderd, anders zet Postgres er een
--   tweede functie naast.
--
-- Dry-run: laat ROLLBACK staan, controleer, verander dan in COMMIT.
-- =====================================================================

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- Bestaande leenspelers overnemen
UPDATE public.players SET is_guest = true WHERE position = 'leenspeler';

DROP FUNCTION IF EXISTS public.upsert_player(uuid, text, int, text, boolean);

CREATE OR REPLACE FUNCTION public.upsert_player(
  p_id           uuid,
  p_name         text,
  p_shirt_number int DEFAULT NULL,
  p_active       boolean DEFAULT true,
  p_is_guest     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.players (name, shirt_number, active, is_guest)
    VALUES (trim(p_name), p_shirt_number, coalesce(p_active, true), coalesce(p_is_guest, false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.players
       SET name = trim(p_name),
           shirt_number = p_shirt_number,
           active = coalesce(p_active, true),
           is_guest = coalesce(p_is_guest, false)
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
END;
$$;
GRANT  EXECUTE ON FUNCTION public.upsert_player(uuid, text, int, boolean, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_player(uuid, text, int, boolean, boolean) FROM PUBLIC, anon;

-- Controle 1: precies één upsert_player, met de nieuwe parameters
SELECT p.oid::regprocedure AS functie
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'upsert_player';

-- Controle 2: wie is leenspeler?
SELECT name, is_guest FROM public.players WHERE is_guest;

-- Dry-run: ROLLBACK. Klopt het? Verander in COMMIT en draai opnieuw.
ROLLBACK;
