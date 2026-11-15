// Uitleg van de rollen: wie ziet en mag wat. Houd dit gelijk met de
// databasefuncties (is_team / is_staff / beheerder-checks).
const ROWS: { what: string; supporter: boolean; speler: boolean; aanvoerder: boolean; beheerder: boolean }[] = [
  { what: 'Agenda, uitslagen en wedstrijdverslagen bekijken', supporter: true, speler: true, aanvoerder: true, beheerder: true },
  { what: 'Statistieken: stand, resultaten, topscorers, kaarten', supporter: true, speler: true, aanvoerder: true, beheerder: true },
  { what: 'Zien wie er komt + aanwezigheidsstatistieken', supporter: false, speler: true, aanvoerder: true, beheerder: true },
  { what: 'Zelf aan- en afmelden (✓ ? ✕), wachtlijst', supporter: false, speler: true, aanvoerder: true, beheerder: true },
  { what: 'Aanwezigheid van anderen invullen (ook achteraf)', supporter: false, speler: false, aanvoerder: true, beheerder: true },
  { what: 'Doelpunten, assists en kaarten invullen', supporter: false, speler: false, aanvoerder: true, beheerder: true },
  { what: 'Wedstrijden/trainingen toevoegen en wijzigen', supporter: false, speler: false, aanvoerder: true, beheerder: true },
  { what: 'Selectie beheren (spelers, rugnummers, leenspelers)', supporter: false, speler: false, aanvoerder: true, beheerder: true },
  { what: 'Instellingen (max. spelers, aanmeldvenster) en Sportlink', supporter: false, speler: false, aanvoerder: true, beheerder: true },
  { what: 'Rollen geven, accounts koppelen en blokkeren', supporter: false, speler: false, aanvoerder: false, beheerder: true },
]

const Mark = ({ ok }: { ok: boolean }) => (
  <td className="center">{ok ? <span className="role-yes">✓</span> : <span className="role-no">–</span>}</td>
)

export default function RolesHelp() {
  return (
    <details className="card roles-help">
      <summary>
        <h2>Wie kan wat? (uitleg rollen)</h2>
      </summary>
      <ul className="roles-intro">
        <li><b>Supporter</b>: standaard na registreren. Kijkt mee, geen aanmeldingen.</li>
        <li><b>Speler</b>: teamlid. Meldt zich aan en ziet wie er komt. Moet gekoppeld zijn aan een naam in de selectie.</li>
        <li><b>Aanvoerder</b>: regelt het team: aanwezigheid, statistieken, selectie en instellingen.</li>
        <li><b>Beheerder</b>: alles van de aanvoerder, plus accounts: rollen, koppelen en blokkeren.</li>
      </ul>
      <div className="table-wrap">
        <table className="table roles-table">
          <thead>
            <tr>
              <th></th>
              <th className="center">Supp.</th>
              <th className="center">Speler</th>
              <th className="center">Aanv.</th>
              <th className="center">Beh.</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.what}>
                <td>{r.what}</td>
                <Mark ok={r.supporter} />
                <Mark ok={r.speler} />
                <Mark ok={r.aanvoerder} />
                <Mark ok={r.beheerder} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Goed om te weten: aanvoerders en beheerders kunnen zich ook zelf aanmelden, als hun account aan een speler
        gekoppeld is. Niemand kan zijn eigen rol wijzigen of zichzelf blokkeren. Een <b>geblokkeerd</b> account ziet
        niets meer. De regels gelden ook voor aanvoerders: de limiet van spelers en het aanmeldvenster gelden voor
        iedereen.
      </p>
    </details>
  )
}
