# Spacing pass — before / after, 390 × 844 (iPhone logical size)

Shot on the web target with stubbed API data. Two caveats worth knowing before
reading the pictures:

- **The grey band under the navy header does not appear in these shots.** It is
  caused by the safe-area top inset being applied twice, and on the web target
  that inset is 0, so the bug is invisible here. It was found and fixed by
  reading the code (see below) and will be visible on the device in build 5.
- `jobs`, `airlines` and `profile` are byte-identical before and after: they
  were already on the scale. They are kept here as evidence of that, not as
  changes.

| screen | before | after |
| --- | --- | --- |
| Home | `home-before.png` | `home-after.png` |
| Jobs | `jobs-before.png` | `jobs-after.png` (unchanged) |
| Airlines | `airlines-before.png` | `airlines-after.png` (unchanged) |
| CV Builder | `cv-before.png` | `cv-after.png` |
| Logbook | `logbook-before.png` | `logbook-after.png` |
| Log a flight | `log-a-flight-before.png` | `log-a-flight-after.png` |
| Profile | `profile-before.png` | `profile-after.png` (unchanged) |
| Settings | `settings-before.png` | `settings-after.png` |
| Logbook map (new) | — | `logbook-map-after.png` |

Not capturable on the web target, and checked on the device instead: the scan
review (its picker is native) and the add-a-flight sheet (a modal the harness
cannot open).
