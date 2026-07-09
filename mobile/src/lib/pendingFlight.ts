// Prefill holder for edit/clone. There's no GET /flight-logs/:id, so the logbook
// row stashes the log object here before navigating to /logbook/edit|clone/[id],
// and the form reads it on mount. Plain module singleton — no store dependency.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: Record<string, any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setPendingFlight(log: Record<string, any>) { pending = log; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPendingFlight(): Record<string, any> | null { return pending; }
export function clearPendingFlight() { pending = null; }
