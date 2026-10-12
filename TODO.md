# Netflix Controller - To Do

## Status

- **Version:** 1.2.0 (adds controls bar with button icons). 1.1.0 (TV mode) is waiting for Mozilla approval
- **Tested on:** a mock Netflix page with a simulated controller (menus, row paging, details, My List, search keyboard, player controls, TV mode, controls bar, help screen icons)
- **Tested on real netflix.com (2026-10-12, new "Hawkins" UI):** home rows, row paging, title details open/close, search keyboard, focus memory, back navigation. Player **not** testable in the test browser (DRM error M7701-1003) - needs checking in Firefox

---

## Short term

### Release
- [ ] Wait for Mozilla to approve v1.1.0, then download the signed `.xpi` from the developer hub
- [ ] Sign v1.2.0 (`sign.ps1`, run from any folder) once 1.1.0 is through
- [ ] Choose the final name (suggested: **Controller for Netflix**), update `"name"` in `manifest.json` and bump the version
- [ ] Remove the temporary copy from `about:debugging` once the signed version is installed

### Real-world testing on netflix.com
- [ ] Profile picker: highlight lands on a profile and A selects it (not reached in testing - session already had a profile)
- [x] Home page: rows, moving up/down, LB/RB row scrolling, arrows at the end of rows
- [x] Title details: opening with A, closing with B, focus returns to the card
- [ ] Y = My List in title details (button found: `add-to-my-list` / `add-to-my-list-added`; not pressed in testing)
- [x] Search: X opens the search box, on-screen keyboard typing updates results
- [ ] Player: play/pause, seek, volume, mute through Netflix's player API (no playback errors)
- [ ] Player: Y skips intro/recap, B exits
- [ ] Player menus: LT opens audio & subtitles, R3 playback speed, L3 episodes; D-pad moves inside the menu, A picks (menu closes), B closes; menu stays open while choosing
- [x] Title details: Resume/Play highlighted on open (~0.3s), Left/Right along the button row, Down into episodes, season picker (A opens, D-pad, A picks, B closes menu only), A on an episode starts playback, B closes back to the same card - verified live 2026-10-12
- [ ] Title details on a movie (no episodes): Down should reach "More like this" cards and the trailer/about sections sensibly
- [ ] Long episode lists: "section-expand" (show more) button reachable and works
- [ ] Fullscreen with View/Select. If Firefox blocks it, decide whether to keep the F11 message
- [ ] Hover previews: check that the mouse resting on a card doesn't confuse the highlight

### Netflix UI notes (Oct 2026)
- Rows: `[data-uia^="carousel-row-section"]`, cards: `[data-uia="standard-card"]` / `progress-card` (links `/browse?jbv=ID`), arrows: `carousel-hawkins-left/right-button` (left is opacity 0 until hover), slide ~0.8s
- Billboard: `play-video-button`, `billboard-more-info`
- Title details: `[role=dialog]` `modal-motion-container-DETAIL_MODAL`; Play `play-button` (a plain `<button>` nested inside), close `previewModal-closebtn` (span; fade ~2s), My List `add-to-my-list(-added)`
- Search: nav input `navigation+actions+search+input` always present; typing navigates to `/search?q=`
- No `falcorCache` any more: synopsis / year / rating for the info panel are not available on the page (title comes from `aria-label`)

### TV mode on netflix.com
- [x] Focused card lifts with the right boxart image and lines up with the card underneath
- [ ] Other cards in the row dim; nothing stays dimmed after leaving the row
- [x] Info panel shows row name and title (year, rating and synopsis are not available on the new UI)
- [ ] Synopsis is missing on the new UI: look at Netflix's GraphQL/`reactContext` data, or fetch title metadata when a card is focused
- [ ] Focused row stays at the same height when moving up and down; first and last rows behave sensibly
- [ ] Info panel doesn't cover anything important (adjust position or row height if it does)
- [ ] Netflix hover pop-ups never appear while using the controller; moving the mouse restores normal behaviour
- [ ] Pressing the left stick (L3) turns TV mode on and off, and the setting is remembered
- [ ] Text and hints are readable from the couch on a TV-connected PC

### Controls bar on netflix.com
- [ ] Button icons match the 8BitDo (should auto-detect as Xbox); try other styles in settings
- [ ] Bar changes with context: home, title details, search keyboard, player, help screen
- [ ] Labels follow what's highlighted ("Open" on titles, "Play" on play buttons, "Choose" on profiles, "More" on row arrows)
- [ ] "Scroll row" appears only when the row can scroll; "Back" hidden on Home
- [ ] Title details: "My List" / "Remove from My List" label matches the real state
- [ ] Player: bar fades after 3.5s while playing, stays while paused, "Pause"/"Play" label is right
- [ ] Player: Y label shows Netflix's own text when Skip Intro / Skip Recap / Next Episode appear
- [ ] Bar doesn't clash with Netflix's own player controls at the bottom
- [ ] Pressed button icon flashes on each press

### Back navigation on netflix.com (v1.2.0 rework)
- [x] B on title details closes it and the highlight returns to the same card, not the top of the page
- [ ] B from a genre / My List / search page goes back and lands on the card you came from
- [ ] B from the player returns to the card you launched from
- [x] Pressing B twice quickly never goes back two steps
- [x] Opening a title lands on its Play button straight away
- [x] Row scrolling with LB/RB/edge follows the animation (no early or late focus)

### Fixes likely after testing
- [ ] Update any Netflix element selectors (`data-uia=...`) that don't match the current site
- [ ] Tune the navigation scoring if the highlight jumps to the wrong row or card
- [ ] Check the settings page with the 8BitDo controller (live test and remap)

---

## Long term

### Features
- [ ] Toolbar popup with an on/off switch and controller status
- [ ] Controls bar: show the right stick (scroll) and triggers (page up/down) when there's room
- [ ] Controls bar: option to place it bottom-left or centred instead of bottom-right
- [ ] Subtitle and audio-language picker from the controller
- [ ] Hold a button for continuous fast-forward/rewind at increasing speed
- [ ] Optional controller rumble on actions (Firefox support permitting)
- [ ] Remember the last position in each row when moving back up or down
- [ ] TV mode: auto-play the focused title's preview in the info panel (like the TV app)
- [ ] TV mode: optional page zoom for Netflix itself on large screens
- [ ] Support other streaming sites (Disney+, Prime Video, YouTube) with a per-site config

### Quality
- [ ] Turn the mock-page test into a repeatable automated test
- [x] Replace `innerHTML` with DOM building to clear the lint warnings (AMO validator flagged them)
- [ ] Add a README with install, controls and troubleshooting
- [ ] Put the project under git

### Distribution
- [ ] Publish a listed version on addons.mozilla.org (needs screenshots, description, privacy notes)
- [ ] Look into a Chrome/Edge port (Manifest V3; no `wrappedJSObject`, so the player API needs a page-script bridge)

---

## Done

- [x] Spatial navigation, focus ring, row paging, modal handling
- [x] Player controls through Netflix's player API, with keyboard and video-element fallbacks
- [x] On-screen keyboard for search
- [x] Settings page with live controller test and button-remap wizard
- [x] TV mode: lifted focus card, row dimming, title info panel, fixed focus row, no hover pop-ups, larger UI; L3 toggle and settings checkbox
- [x] Review fixes (2026-10-12): no repeat-fire of RT/LT in the player, menu detection is structural and only active in a menu we opened, popup/skip lookups cached, seek safe before duration is known, shorter playback lock, X closes a title dialog before searching, shared nested-focusable dedupe, one open-menu routine, quiet control-lookup logging
- [x] Title dialog fixes: use the outermost dialog (a nested details section used to swallow the Play button), skip cast/genre/rating text links, horizontal moves stay on one line, B closes an open season menu first, Loading state after pressing A on an episode
- [x] Ported to Netflix's new UI (carousel-row-section / standard-card / hawkins arrows / nav search input) and verified on the live site
- [x] Back navigation rework: waits for the modal/page to actually change instead of fixed delays, per-page focus memory (kept across reloads) so B returns to the exact card, double-press guard, row paging waits for the slide to settle
- [x] Controls bar: console-style button prompts that follow context, auto-detected Xbox / PlayStation / Nintendo / generic icons, press animation, auto-hide in player
- [x] Hand-drawn SVG button icon set (`glyphs.js`), also used on the help screen and settings preview
- [x] Signing script (`sign.ps1`)
- [x] Lint: 0 errors
