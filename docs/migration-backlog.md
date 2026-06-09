# Design-migration backlog

Tickets surfaced during the editorial-light migration. These are **not** bugs
introduced by the migration — they are pre-existing issues or follow-ups
deferred so each phase stays presentation-only and tightly scoped.

## Primitives / follow-ups

- **`<Modal>` `size` prop.** The primitive `<Modal>` is fixed at `maxWidth: 480`.
  Wide forms still use a bespoke recolored overlay (Logbook `AddFlightModal` at
  680px; `ImportModal` at 820px). When the next wide-form modal lands, add a
  `size` prop (`sm=480` / `md=680` / `lg=960`) to `<Modal>` and migrate these
  bespoke overlays onto it. Phase 9.

- **Collapse `AircraftCombobox` `light` prop.** Additive `light` prop (Phase 8)
  is still theme-split because `EmployerJobForm.jsx` remains dark. Once the
  employer job form migrates, remove the `light` prop + the `t` dark/light
  branch, collapse to a single light style, and drop `light` from all callers
  (Profile, Logbook). As of Phase 9, Logbook passes `light` and renders correctly.

## Latent backend (log only — do not fix during migration)

- **`DELETE /api/auth/account` returns 500 when `password` is missing.**
  `authController.deleteAccount` calls `bcrypt.compare(undefined, hash)` before
  validating that `password` was supplied, throwing instead of returning a 400.
  Works correctly when `{ password }` is provided. Input-validation gap only.
  (Observed Phase 9 verification; pre-existing, unrelated to migration.)
