// Een voetbalseizoen loopt van 1 juli t/m 30 juni.
// We rekenen met het startjaar: seizoen 2026 = 2026/27.

export function seasonOf(iso: string | Date): number {
  const d = new Date(iso)
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function seasonRange(startYear: number): { from: string; to: string } {
  return {
    from: new Date(startYear, 6, 1).toISOString(),
    to: new Date(startYear + 1, 6, 1).toISOString(),
  }
}
