export function matchLabel(score: number): { text: string; color: string } {
  if (score >= 90) return { text: 'Excellent match', color: '#2ECC71' };
  if (score >= 75) return { text: 'Great match', color: '#00B4D8' };
  if (score >= 60) return { text: 'Good match', color: '#F39C12' };
  return { text: 'Partial match', color: '#7A8CA0' };
}
