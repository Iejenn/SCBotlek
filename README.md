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

### 3. Netlify
- Koppel de GitHub-repo, build command `npm run build`, publish directory `dist` (staat ook in `netlify.toml`).
- Zet bij **Site configuration → Environment variables**: `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`.

### 4. Jezelf beheerder maken
Registreer je in de app. Draai daarna in de Supabase SQL Editor (vervang `jouwnaam`):
```sql
UPDATE public.profiles SET role = 'beheerder' WHERE username = 'jouwnaam';
```
Vanaf dan doe je alles in de app via **Beheer → Gebruikers**.

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
- [ ] Fase 2: uitslag + doelpunten/assists/kaarten invoeren, statistiekenpagina (topscorer, aanwezigheid %)
- [ ] Koppeling voetbal.nl (automatisch wedstrijdschema)
