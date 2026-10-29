// What the full-screen map should draw.
//
// The "Where you flew" card follows the logbook list — change page or switch
// Month/Day and it follows — so the full-screen map has to show the same
// sectors, not a fresh fetch of something slightly different. The card stashes
// them here before navigating. Plain module singleton, like pendingFlight.
export type MapSector = { from?: string | null; to?: string | null };

let sectors: MapSector[] = [];
let label = 'Where you flew';
// Whichever scope the card was showing when it was tapped, so the full map
// opens on the same flying rather than silently switching to something else.
let scope: 'all' | 'view' = 'all';

export function setPendingMap(next: MapSector[], title = 'Where you flew', sc: 'all' | 'view' = 'all') {
  sectors = next;
  label = title;
  scope = sc;
}
export function getPendingMap(): { sectors: MapSector[]; label: string; scope: 'all' | 'view' } {
  return { sectors, label, scope };
}
