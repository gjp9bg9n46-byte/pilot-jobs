# TestFlight findings, builds 4 and 5 (from Mohamed's iPhone screenshots)

Rules: web and app identical where it applies. Test with the test pilot only. Any change to Mohamed's own data: show before → after and wait for his OK. No amber for questions; calm navy style (#F4F8FD tint, 3 px navy left border, ⓘ icon, question wording). Red only for real problems.

## A. Build 4 findings

1. **Scan review (JED → ALY):** both sectors show "Looks right", but the footer still says "Some sectors still need fixing" in red and Save is blocked. Find what is actually blocking (probably the page-date question, scrolled out of view). Never show a red "needs fixing" line for a question. If anything is still open, the save bar names it and where ("1 quick question: page date"), and tapping it scrolls there. If nothing is open, show no message.
2. **Add a flight sheet:** scan text becomes "Take a photo. We read every sector, and ask you only about anything we're not sure of." (amber wording already removed in d49c677). BETA chip: navy/grey, not amber (AddFlightSheet.tsx:113). The sheet must respect the top safe area and never slide under the Dynamic Island / status bar.
3. **ECAA recency note:** user text becomes "Night currency rules for Egypt (ECAA) aren't set up yet, so we show your total landings only." Use the same pattern for every unmapped authority.
4. **+ button (FAB):** it covers row content (arrival time on flight rows, "+28 more jobs…", "2,000 Next" on the milestone bar). Add enough bottom padding everywhere so nothing sits under the FAB or the tab bar ("+ Add right to work" on Profile is also hidden).
5. **Airlines list:** every logo tile has the same fixed size (e.g. 64×48, logo contained inside, initials centred) so airline names line up on every card. Today Emirates and Air Dolomiti tiles are wider than the initials tiles.
6. **Tab bar on device:** in builds 4 and 5 on the real iPhone, the selected tab is still a square grey block touching the bar edge (it looked right on web). Fix it on the native render: a pill (radius = half its height), inset from the bar edge, badge 18 px with a white ring on the icon's top-right corner, not covering the icon. Verify on a native render, not on web.
7. **Emirates count:** covered by the dedup work (card, fact-file CTA and Jobs list must show the same number).

## B. Second list

1. **Aircraft "NULL":** the MSC 805 row and the "remembered" aircraft in Log a flight show the literal string NULL. Find where null becomes "NULL" (scan save, import or remembered-value logic) and fix it. List affected rows, propose the correct type from the registration (SU-BUJ → A320, using typeFromRegistration), and wait for OK.
2. **Registrations "BUU":** imported SM rows lost the country prefix. Propose SU-BUU etc. for the Egyptian fleet rows, list them, and wait for OK. Fix the importer.
3. **PIC/SIC vs total:** Total 1,564:18, but PIC 0:00 + SIC 1,549:42 leaves 14:36 unexplained. Explain the gap and show it in the card as "Other" (with what it contains), so the parts add up to the total.
4. **Log a flight placeholders:** Flight No "MSC 2926" and From/To "CAI / HRG" are grey placeholders that look like real data. Either pre-fill remembered values as real editable text marked "remembered", or use neutral hints ("e.g. MSC 123", "e.g. CAI"). A disabled Save always says why ("Add OUT and IN times").
5. **Infinite scroll:** in the app logbook, replace page numbers with infinite scroll inside the Month/Day groups. The web may keep pagination.
6. **Duplicate recency:** keep the top strip and remove the duplicate line from the "CURRENCY · LAST 90 DAYS" card.
7. **Job description formatting:** keep the line breaks and lists from the source. Turn known headings ("About the Role", "Key responsibilities", "Essential Requirements", "Desirable") into bold section headings, and never show one wall of text. Same on web.
8. **Profile:** "Cessna 172 rating" → treat C172, PA28 and similar as the class rating "SEP (land)". Show Mohamed's entry as a proposed change and wait for OK. The Medical row shows "Valid until 26 Aug 2027" twice; keep only the status on the right.
9. **Bottom padding:** see A4.

## C. After all of the above
Short report point by point (done / not done / why), with 390 px screenshots, then build 6:
`npm_config_cache=$HOME/.npm-eas npx eas-cli build -p ios --profile production --auto-submit`
