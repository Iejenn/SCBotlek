// Teamnaam per seizoen (startjaar -> naam).
// Sportlink geeft bij oude wedstrijden de HUIDIGE teamnaam terug, dus vorige
// seizoenen leggen we hier vast. Elk nieuw seizoen met een ander teamnummer: één regel toevoegen.
// Seizoenen die hier niet staan, krijgen de naam uit Sportlink.
export const TEAM_NAME_BY_SEASON: Record<number, string> = {
  2025: 'SC Botlek 6', // seizoen 2025/26
}
