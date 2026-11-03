// When "Your year in the sky" is offered on Home.
//
// 1 December to 31 January, and no other time. A year in review in June is
// not a year in review; the card would be permanent furniture nobody reads.
// December shows the year that is ending; January shows the year just gone.
export function yearInReviewWindow(now: Date = new Date()): { open: boolean; year: number | null } {
  const m = now.getUTCMonth(); // 0 = January
  if (m === 11) return { open: true, year: now.getUTCFullYear() };
  if (m === 0) return { open: true, year: now.getUTCFullYear() - 1 };
  return { open: false, year: null };
}
