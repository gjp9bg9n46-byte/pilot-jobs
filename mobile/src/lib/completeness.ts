// Profile-completeness model — ported 1:1 from frontend/src/components/CompletenessWidget.jsx.
// Two tiers: `core` drives the headline % (7 items); `recommended` is shown but
// excluded from the number. All computed client-side from GET /profile + GET /cv
// (which returns .cv and .totals). Same inputs as web ⇒ same percentage.
//
// `to` values are the MOBILE routes (web used /profile, /logbook, /cv): personal
// → the profile edit screen, other profile items → the Profile tab, logbook →
// Logbook, cv → the CV Builder.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

export type CompletenessItem = { key: string; label: string; hint: string; done: boolean; to: string };

export function buildCompleteness(profile: Any | null, cv: Any | null, totals: Any | null): {
  core: CompletenessItem[]; recommended: CompletenessItem[]; pct: number; doneCount: number;
} {
  const certs = profile?.certificates || [];
  const nonElp = certs.filter((c: Any) => c.type !== 'ELP');
  const elp = certs.filter((c: Any) => c.type === 'ELP');
  const medicals = profile?.medicals || [];
  const rtw = profile?.rightToWork || [];
  const ratings = profile?.ratings || [];
  const training = profile?.trainingRecords || [];
  const totalTime = totals?.totalTime || 0;

  const c = cv || {};
  const cvBuilt =
    !!(c.summary && String(c.summary).trim()) ||
    ['education', 'languages', 'skills', 'typeRatings', 'licenses'].some(
      (k) => Array.isArray(c[k]) && c[k].length > 0,
    );

  const core: CompletenessItem[] = [
    { key: 'personal', label: 'Personal info', to: '/profile/edit',
      done: !!(profile?.role && profile?.nationality),
      hint: (profile?.role && profile?.nationality) ? 'Role + nationality set' : 'Add your role and nationality' },
    { key: 'licences', label: 'Licences', to: '/profile',
      done: nonElp.length > 0,
      hint: nonElp.length > 0 ? `${nonElp.length} on file` : 'No licences yet' },
    { key: 'medical', label: 'Medical', to: '/profile',
      done: medicals.length > 0,
      hint: medicals.length > 0 ? `${medicals.length} on file` : 'No medical on file' },
    { key: 'elp', label: 'English proficiency', to: '/profile',
      done: elp.length > 0,
      hint: elp.length > 0 ? 'On file' : 'No ELP record yet' },
    { key: 'rtw', label: 'Right to work', to: '/profile',
      done: rtw.length > 0,
      hint: rtw.length > 0 ? `${rtw.length} ${rtw.length === 1 ? 'entry' : 'entries'}` : 'No entries yet' },
    { key: 'logbook', label: 'Logbook', to: '/logbook',
      done: totalTime > 0,
      hint: totalTime > 0 ? `${Math.round(totalTime).toLocaleString()} h logged` : 'No hours logged yet' },
    { key: 'cv', label: 'CV', to: '/cv-builder',
      done: cvBuilt,
      hint: cvBuilt ? 'Built' : 'Not built yet' },
  ];

  const recommended: CompletenessItem[] = [
    { key: 'ratings', label: 'Type ratings', to: '/profile',
      done: ratings.length > 0,
      hint: ratings.length > 0 ? `${ratings.length} on file` : 'Add your type ratings' },
    { key: 'recurrent', label: 'Recurrent training', to: '/profile',
      done: training.length > 0,
      hint: training.length > 0 ? `${training.length} on file` : 'None logged yet' },
  ];

  const doneCount = core.filter((x) => x.done).length;
  const pct = Math.round((doneCount / core.length) * 100);
  return { core, recommended, pct, doneCount };
}

export function completenessSubtitle(pct: number): string {
  if (pct === 0) return "Let's get you set up — finish these to start matching.";
  if (pct === 100) return 'All set — every section is complete.';
  return 'Finish these to improve your match quality.';
}
