-- =====================================================================
-- SC Botlek — openbaar meekijken zonder account
--
-- Bezoekers zonder account (rol "anon") mogen LEZEN:
--   * events       (agenda, uitslagen)
--   * players      (namen + rugnummers, voor topscorers/wedstrijdverslag)
--   * match_stats  (doelpunten, assists, kaarten)
--   * team_settings(max spelers / aanmeldvenster, alleen getallen)
-- NIET openbaar: attendance (wie komt + afmeldredenen), profiles (accounts),
-- sync_runs (logboek).
-- Schrijven blijft onmogelijk: er zijn geen INSERT/UPDATE/DELETE-policies en
-- alle RPC's zijn alleen voor ingelogde gebruikers (anon heeft geen EXECUTE).
--
-- Laag risico (alleen leesregels erbij), daarom direct COMMIT.
-- Terugdraaien kan met de DROP POLICY-regels onderaan dit bestand.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS events_select_public      ON public.events;
DROP POLICY IF EXISTS players_select_public     ON public.players;
DROP POLICY IF EXISTS match_stats_select_public ON public.match_stats;
DROP POLICY IF EXISTS team_settings_select_public ON public.team_settings;

CREATE POLICY events_select_public ON public.events
  FOR SELECT TO anon USING (true);
CREATE POLICY players_select_public ON public.players
  FOR SELECT TO anon USING (true);
CREATE POLICY match_stats_select_public ON public.match_stats
  FOR SELECT TO anon USING (true);
CREATE POLICY team_settings_select_public ON public.team_settings
  FOR SELECT TO anon USING (true);

-- Leesrecht op tabelniveau voor anon (staat in Supabase meestal al aan; voor de zekerheid)
GRANT SELECT ON public.events, public.players, public.match_stats, public.team_settings TO anon;

-- Controle: welke tabellen zijn openbaar leesbaar?
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public' AND 'anon' = ANY (roles)
 ORDER BY tablename;

COMMIT;

-- ---------------------------------------------------------------------
-- Terugdraaien (alleen als je het openbaar meekijken weer uit wilt zetten):
-- DROP POLICY events_select_public ON public.events;
-- DROP POLICY players_select_public ON public.players;
-- DROP POLICY match_stats_select_public ON public.match_stats;
-- DROP POLICY team_settings_select_public ON public.team_settings;
