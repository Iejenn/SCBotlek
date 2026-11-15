# SC Botlek — teamdashboard

Agenda, aanwezigheid en (later) statistieken voor ons team.
React + TypeScript + Vite, Supabase als database, Netlify voor hosting.

## Eenmalig opzetten

### 1. Supabase-project
1. Maak een nieuw project aan op supabase.com. Let op: gratis organisaties mogen maar 2 projecten hebben,
   dus maak eventueel een aparte organisatie "SC Botlek" aan.
2. **Authentication → Sign In / Providers → Email**:
   - **Confirm email: UIT** (we gebruiken geen echte e-mailadressen, alleen gebruikersnamen)
   - Allow new users to sign up: AAN
3. **SQL Editor**: plak `supabase/001_schema.sql` en draai het.
   - Het bestand eindigt met `ROLLBACK;` → dit is een proefrun, er wordt niets opgeslagen.
   - Geen fouten? Verander de laatste regel in `COMMIT;` en draai opnieuw.

### 2. Lokaal draaien
```bash
cp .env.example .env.local   # vul URL + anon/publishable key in (Project Settings → API)
npm install
npm run dev
```

### 3. GitHub Pages
De site staat op **https://iejenn.github.io/SCBotlek/** en wordt automatisch gebouwd door
`.github/workflows/pages.yml` bij elke push naar `main` of de feature-branch.

Eenmalig instellen:
- **Settings → Pages → Build and deployment → Source: GitHub Actions**
- **Settings → Environments → github-pages → Deployment branches**: voeg de feature-branch toe
  (standaard mag alleen `main` deployen).

Supabase-URL en publishable key staan in de workflow; die zijn publiek, de beveiliging zit in de database.

### 4. Jezelf beheerder maken
Registreer je in de app. Draai daarna in de Supabase SQL Editor (vervang `jouwnaam`):
```sql
UPDATE public.profiles SET role = 'beheerder' WHERE username = 'jouwnaam';
```
Vanaf dan doe je alles in de app via **Beheer → Gebruikers**.

### 5. Automatische wedstrijden uit Sportlink
Draai `supabase/002_sportlink_sync.sql` in de SQL Editor (ook weer eerst met `ROLLBACK;`).
De proefrun haalt echt de data op en toont onderaan de lijst met wedstrijden die erin zouden komen.
Klopt het? Verander de laatste regel in `COMMIT;`.

- Bron: Sportlink Club.Dataservice (dezelfde data als voetbal.nl), team SC Botlek 7 (teamcode `119436`).
- Draait elke 3 uur via `pg_cron`; staf kan ook op **Beheer → Sportlink → Nu bijwerken** drukken.
- Sportlink is leidend voor datum, tegenstander, locatie, status en uitslag. Verzameltijd en opmerkingen vul je zelf in.
- De `client_id` is de sleutel van de club (staat openbaar op scbotlek.nl). Wordt die vernieuwd, pas dan de
  constante `c_client` aan in de functie `sync_sportlink` en draai het bestand opnieuw.

### 6. Statistieken (fase 2)
Draai `supabase/003_match_stats.sql` in de SQL Editor (eindigt direct op `COMMIT;`, voegt alleen een functie toe).

### 7. Speler verwijderen
Draai `supabase/004_delete_player.sql` (direct `COMMIT;`). Daarna staat er een 🗑️-knop in **Beheer → Selectie**.
Werkt alleen bij spelers zonder koppeling, aanmeldingen of statistieken.

### 8. Teamnaam per seizoen
Draai `supabase/005_team_name.sql` (direct `COMMIT;`). Voegt `events.team_name` toe en vult die via de sync,
zodat vorig seizoen als "SC Botlek 6" en dit seizoen als "SC Botlek 7" wordt getoond.

### 9. Maximaal aantal spelers + wachtlijst
Draai `supabase/006_waitlist.sql` (eerst met `ROLLBACK;`, dan `COMMIT;`). Stel daarna in
**Beheer → Instellingen** het maximum in. Volle wedstrijd = automatisch wachtlijst; bij afmelden schuift de eerste door.

## Rollen

| Rol | Kan |
|---|---|
| Supporter | Agenda en uitslagen bekijken (standaard na registratie) |
| Speler | + aanwezigheid zien en zichzelf aan/afmelden (account moet gekoppeld zijn aan een speler in de selectie) |
| Aanvoerder | + wedstrijden/trainingen en selectie beheren, aanwezigheid voor anderen invullen |
| Beheerder | + rollen toewijzen, gebruikers blokkeren, accounts aan spelers koppelen |

Alle wijzigingen lopen via database-functies (RPC's) die de rol controleren; de app kan zelf niets direct schrijven.

## Wachtwoord vergeten?
Er is geen e-mail, dus de beheerder zet een tijdelijk wachtwoord via de SQL Editor (vervang naam en wachtwoord):
```sql
UPDATE auth.users
SET encrypted_password = extensions.crypt('TijdelijkWachtwoord123', extensions.gen_salt('bf'))
WHERE email = 'gebruikersnaam@users.scbotlek.app';
```

## Planning
- [x] Fase 1: agenda, trainingsreeksen, aan/afmelden, rollen
- [x] Fase 2: doelpunten/assists/kaarten invoeren, statistiekenpagina per seizoen (topscorer, aanwezigheid %)
- [x] Koppeling Sportlink (automatisch wedstrijdschema + uitslagen)
- [x] Competitiestand (live uit Sportlink, op de pagina Statistieken)
