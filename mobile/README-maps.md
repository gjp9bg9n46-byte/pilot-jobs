# The map, and what Android still needs

The logbook's "Where you flew" card is an SVG thumbnail (`src/components/
logbook/RouteMap.tsx`). Tapping it opens the full map.

- `app/(app)/logbook/map.native.tsx` — the real one, `react-native-maps`.
  On **iOS** this is Apple Maps and needs **no key at all**.
- `app/(app)/logbook/map.tsx` — the fallback expo-router requires beside a
  platform-specific route, and what **web** gets: the same SVG map, given the
  window. `react-native-maps` has no web build, and expo-router imports every
  route, so importing it from `map.tsx` would take the whole web bundle down.

## Android needs a Google Maps API key

`react-native-maps` on Android is Google Maps, and Google Maps renders a
**blank grey square** without a key — no error, no warning, just nothing. Before
the first Android build:

1. Create an API key in Google Cloud with the *Maps SDK for Android* enabled,
   restricted to the app's package name and signing certificate.
2. Put it in `app.json`:

   ```json
   "android": {
     "config": { "googleMaps": { "apiKey": "<key>" } }
   }
   ```

   Keep the real key out of the repo — use an EAS secret and reference it, the
   way the other secrets are handled.
3. Check the map actually draws on a device. A missing or wrongly restricted
   key looks exactly like a working map with no tiles.

iOS needs none of this.
