-- =====================================================================
-- SC Botlek teamdashboard — schema v1
-- Draai dit in een NIEUW, leeg Supabase-project (SQL Editor).
--
-- Dry-run: laat de laatste regel op ROLLBACK staan en draai het.
--   Geen fouten? Verander ROLLBACK in COMMIT en draai opnieuw.
--
-- Beveiligingsmodel (zelfde aanpak als Soccer RPG):
--   * Alle tabellen hebben RLS aan.
--   * Clients mogen alleen LEZEN (SELECT-policies).
--   * Alle schrijfacties lopen via SECURITY DEFINER-functies (RPC's)
--     die zelf de rol controleren. Geen INSERT/UPDATE/DELETE-policies.
--
-- Rollen:
--   supporter  = standaard na registratie, ziet alleen het programma
--   speler     = ziet ook aanwezigheid, mag eigen aanwezigheid doorgeven
--   aanvoerder = mag wedstrijden/trainingen/spelers beheren
--   beheerder  = alles + rollen toewijzen en gebruikers blokkeren
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

-- Selectie: de spelers van het team. Los van accounts, zodat je
-- statistieken kunt bijhouden ook als iemand nooit een account maakt.
CREATE TABLE public.players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  shirt_number  int  CHECK (shirt_number BETWEEN 1 AND 99),
  position      text CHECK (position IN ('keeper','verdediger','middenvelder','aanvaller')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Account-profiel, 1-op-1 met auth.users. Wordt automatisch aangemaakt
-- door de trigger onderaan bij registratie.
CREATE TABLE public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  role          text NOT NULL DEFAULT 'supporter'
                CHECK (role IN ('supporter','speler','aanvoerder','beheerder')),
  blocked       boolean NOT NULL DEFAULT false,
  -- koppeling account -> speler in de selectie (voor aanwezigheid)
  player_id     uuid UNIQUE REFERENCES public.players(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Wedstrijden en trainingen.
CREATE TABLE public.events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('wedstrijd','training')),
  starts_at     timestamptz NOT NULL,
  meet_at       timestamptz,                         -- verzameltijd
  location      text CHECK (char_length(location) <= 100),
  opponent      text CHECK (char_length(opponent) <= 60),
  is_home       boolean,                             -- alleen bij wedstrijden
  competition   text CHECK (competition IN ('competitie','beker','oefen')),
  score_us      int  CHECK (score_us >= 0),
  score_them    int  CHECK (score_them >= 0),
  status        text NOT NULL DEFAULT 'gepland'
                CHECK (status IN ('gepland','gespeeld','afgelast')),
  notes         text CHECK (char_length(notes) <= 500),
  -- voor de latere koppeling met voetbal.nl: voorkomt dubbele wedstrijden
  source        text NOT NULL DEFAULT 'handmatig' CHECK (source IN ('handmatig','voetbalnl')),
  external_id   text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_starts_at_idx ON public.events (starts_at);

-- Aanwezigheid per event per speler.
CREATE TABLE public.attendance (
  event_id    uuid NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('aanwezig','afwezig','misschien')),
  note        text CHECK (char_length(note) <= 200),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);
CREATE INDEX attendance_player_idx ON public.attendance (player_id);

-- Statistieken per wedstrijd per speler (UI komt in fase 2,
-- de tabel staat er alvast zodat we later niets hoeven om te bouwen).
CREATE TABLE public.match_stats (
  event_id      uuid NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  goals         int  NOT NULL DEFAULT 0 CHECK (goals   BETWEEN 0 AND 20),
  assists       int  NOT NULL DEFAULT 0 CHECK (assists BETWEEN 0 AND 20),
  yellow_cards  int  NOT NULL DEFAULT 0 CHECK (yellow_cards BETWEEN 0 AND 2),
  red_card      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (event_id, player_id)
);
CREATE INDEX match_stats_player_idx ON public.match_stats (player_id);

-- ---------------------------------------------------------------------
-- Hulpfuncties voor rolchecks
-- SECURITY DEFINER zodat ze profiles kunnen lezen zonder dat RLS
-- in een cirkel gaat lopen.
-- ---------------------------------------------------------------------

-- Effectieve rol van de ingelogde gebruiker; 'geblokkeerd' als blocked.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN p.blocked THEN 'geblokkeerd' ELSE p.role END
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_team()   -- speler of hoger
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(public.my_role() IN ('speler','aanvoerder','beheerder'), false)
$$;

CREATE OR REPLACE FUNCTION public.is_staff()  -- aanvoerder of beheerder
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(public.my_role() IN ('aanvoerder','beheerder'), false)
$$;

CREATE OR REPLACE FUNCTION public.can_view()  -- ingelogd en niet geblokkeerd
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(public.my_role() <> 'geblokkeerd', false)
$$;

GRANT  EXECUTE ON FUNCTION public.my_role(), public.is_team(), public.is_staff(), public.can_view() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_role(), public.is_team(), public.is_staff(), public.can_view() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- RLS: alleen lezen. (select ...) rond de functie zorgt dat Postgres
-- hem één keer per query uitvoert i.p.v. per rij.
-- ---------------------------------------------------------------------
ALTER TABLE public.players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;

-- Eigen profiel altijd zichtbaar (zodat de app "je bent geblokkeerd" kan tonen),
-- andere profielen alleen voor niet-geblokkeerde gebruikers.
CREATE POLICY profiles_select_visible ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()) OR (select public.can_view()));

CREATE POLICY players_select_visible ON public.players
  FOR SELECT TO authenticated USING ((select public.can_view()));

CREATE POLICY events_select_visible ON public.events
  FOR SELECT TO authenticated USING ((select public.can_view()));

CREATE POLICY match_stats_select_visible ON public.match_stats
  FOR SELECT TO authenticated USING ((select public.can_view()));

-- Aanwezigheid (en afmeldredenen) is teamintern: niet voor supporters.
CREATE POLICY attendance_select_team ON public.attendance
  FOR SELECT TO authenticated USING ((select public.is_team()));

-- ---------------------------------------------------------------------
-- Registratie: profiel aanmaken bij nieuwe gebruiker.
-- Rol wordt NIET uit de metadata gelezen: iedereen start als supporter.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_username text := lower(trim(NEW.raw_user_meta_data->>'username'));
  v_display  text := nullif(trim(NEW.raw_user_meta_data->>'display_name'), '');
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, v_username, left(coalesce(v_display, v_username), 40));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- RPC's (schrijfacties). Allemaal: jsonb {ok, reason, ...}
-- ---------------------------------------------------------------------

-- Aanwezigheid doorgeven.
--  * speler: alleen voor zichzelf (gekoppelde speler), tot aanvang.
--  * staf:   voor iedereen, altijd (ook achteraf corrigeren).
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
BEGIN
  IF NOT public.is_team() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
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

  SELECT starts_at INTO v_starts_at FROM public.events WHERE id = p_event_id;
  IF v_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;
  IF v_starts_at < now() AND NOT v_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_started');
  END IF;

  INSERT INTO public.attendance (event_id, player_id, status, note, updated_at)
  VALUES (p_event_id, v_player, p_status, left(nullif(trim(p_note), ''), 200), now())
  ON CONFLICT (event_id, player_id)
  DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

-- Wedstrijd/training aanmaken (p_id NULL) of bijwerken (staf).
CREATE OR REPLACE FUNCTION public.upsert_event(
  p_id          uuid,
  p_kind        text,
  p_starts_at   timestamptz,
  p_meet_at     timestamptz DEFAULT NULL,
  p_location    text DEFAULT NULL,
  p_opponent    text DEFAULT NULL,
  p_is_home     boolean DEFAULT NULL,
  p_competition text DEFAULT NULL,
  p_status      text DEFAULT 'gepland',
  p_score_us    int DEFAULT NULL,
  p_score_them  int DEFAULT NULL,
  p_notes       text DEFAULT NULL
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
  IF p_kind = 'wedstrijd' AND nullif(trim(p_opponent), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'opponent_required');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.events (kind, starts_at, meet_at, location, opponent, is_home,
                               competition, status, score_us, score_them, notes)
    VALUES (p_kind, p_starts_at, p_meet_at, nullif(trim(p_location), ''),
            nullif(trim(p_opponent), ''), p_is_home, p_competition, p_status,
            p_score_us, p_score_them, nullif(trim(p_notes), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.events SET
      kind = p_kind, starts_at = p_starts_at, meet_at = p_meet_at,
      location = nullif(trim(p_location), ''), opponent = nullif(trim(p_opponent), ''),
      is_home = p_is_home, competition = p_competition, status = p_status,
      score_us = p_score_us, score_them = p_score_them,
      notes = nullif(trim(p_notes), ''), updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  DELETE FROM public.events WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Vaste trainingsavond in één keer inplannen, bijv. elke dinsdag 19:30
-- van 1 sept t/m 31 dec. Tijden in Nederlandse tijd (zomer/winter klopt).
-- p_weekday: 1 = maandag ... 7 = zondag
CREATE OR REPLACE FUNCTION public.create_training_series(
  p_weekday  int,
  p_time     time,
  p_from     date,
  p_to       date,
  p_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF p_weekday NOT BETWEEN 1 AND 7 OR p_to < p_from OR p_to - p_from > 366 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  INSERT INTO public.events (kind, starts_at, location)
  SELECT 'training',
         (d::date + p_time) AT TIME ZONE 'Europe/Amsterdam',
         nullif(trim(p_location), '')
  FROM generate_series(p_from, p_to, interval '1 day') AS d
  WHERE extract(isodow FROM d) = p_weekday;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'created', v_count);
END;
$$;

-- Speler in de selectie aanmaken/bijwerken (staf).
CREATE OR REPLACE FUNCTION public.upsert_player(
  p_id           uuid,
  p_name         text,
  p_shirt_number int DEFAULT NULL,
  p_position     text DEFAULT NULL,
  p_active       boolean DEFAULT true
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
    INSERT INTO public.players (name, shirt_number, position, active)
    VALUES (trim(p_name), p_shirt_number, p_position, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.players
       SET name = trim(p_name), shirt_number = p_shirt_number,
           position = p_position, active = p_active
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

-- Rol toewijzen (alleen beheerder, niet aan jezelf -> je kunt jezelf
-- niet per ongeluk buitensluiten).
CREATE OR REPLACE FUNCTION public.admin_set_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.my_role() IS DISTINCT FROM 'beheerder' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_change_self');
  END IF;
  IF p_role NOT IN ('supporter','speler','aanvoerder','beheerder') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_role');
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'role', p_role);
END;
$$;

-- Gebruiker (de)blokkeren (alleen beheerder, niet jezelf).
CREATE OR REPLACE FUNCTION public.admin_set_blocked(p_user_id uuid, p_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.my_role() IS DISTINCT FROM 'beheerder' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_change_self');
  END IF;

  UPDATE public.profiles SET blocked = p_blocked WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'blocked', p_blocked);
END;
$$;

-- Account koppelen aan speler in de selectie (of ontkoppelen met NULL).
CREATE OR REPLACE FUNCTION public.admin_link_player(p_user_id uuid, p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.my_role() IS DISTINCT FROM 'beheerder' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;

  UPDATE public.profiles SET player_id = p_player_id WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_already_linked');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
END;
$$;

-- Rechten op de RPC's: alleen ingelogde gebruikers
GRANT EXECUTE ON FUNCTION
  public.set_attendance(uuid, text, text, uuid),
  public.upsert_event(uuid, text, timestamptz, timestamptz, text, text, boolean, text, text, int, int, text),
  public.delete_event(uuid),
  public.create_training_series(int, time, date, date, text),
  public.upsert_player(uuid, text, int, text, boolean),
  public.admin_set_role(uuid, text),
  public.admin_set_blocked(uuid, boolean),
  public.admin_link_player(uuid, uuid)
TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.set_attendance(uuid, text, text, uuid),
  public.upsert_event(uuid, text, timestamptz, timestamptz, text, text, boolean, text, text, int, int, text),
  public.delete_event(uuid),
  public.create_training_series(int, time, date, date, text),
  public.upsert_player(uuid, text, int, text, boolean),
  public.admin_set_role(uuid, text),
  public.admin_set_blocked(uuid, boolean),
  public.admin_link_player(uuid, uuid)
FROM PUBLIC, anon;

-- Dry-run: ROLLBACK. Werkt alles? Verander in COMMIT en draai opnieuw.
ROLLBACK;
