-- =====================================================================
-- SC Botlek — speler verwijderen (bijv. per ongeluk dubbel aangemaakt)
--
-- Veilig: verwijdert ALLEEN spelers zonder geschiedenis:
--   * niet gekoppeld aan een account
--   * geen aanmeldingen (attendance)
--   * geen statistieken (match_stats)
-- Spelers met geschiedenis zet je op "niet actief" in plaats van verwijderen.
--
-- Laag risico (alleen een nieuwe functie), daarom direct COMMIT.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_player(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE player_id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_linked');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance  WHERE player_id = p_id)
  OR EXISTS (SELECT 1 FROM public.match_stats WHERE player_id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_has_history');
  END IF;

  DELETE FROM public.players WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT  EXECUTE ON FUNCTION public.delete_player(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_player(uuid) FROM PUBLIC, anon;

COMMIT;
