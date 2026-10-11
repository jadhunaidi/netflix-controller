# Netflix Controller – To Do

## Status

- **Version:** 1.2.0 (adds controls bar with button icons). 1.1.0 (TV mode) is waiting for Mozilla approval
- **Tested on:** a mock Netflix page with a simulated controller (menus, row paging, details, My List, search keyboard, player controls, TV mode, controls bar, help screen icons)
- **Not yet tested on:** real netflix.com

---

## Short term

### Release
- [ ] Wait for Mozilla to approve v1.1.0, then download the signed `.xpi` from the developer hub
- [ ] Sign v1.2.0 (`sign.ps1`, run from any folder) once 1.1.0 is through
- [ ] Choose the final name (suggested: **Controller for Netflix**), update `"name"` in `manifest.json` and bump the version
- [ ] Remove the temporary copy from `about:debugging` once the signed version is installed

### Real-world testing on netflix.com
- [ ] Profile picker: highlight lands on a profile and A selects it
- [ ] Home page: rows, moving up/down, LB/RB row scrolling, arrows at the end of rows
- [ ] Title details: opening with A, closing with B, focus returns to the card, Y = My List
- [ ] Search: X opens the search box, on-screen keyboard typing updates results
- [ ] Player: play/pause, seek, volume, mute through Netflix's player API (no playback errors)
- [ ] Player: Y skips intro/recap, RT goes to the next episode, B exits
- [ ] Fullscreen with View/Select. If Firefox blocks it, decide whether to keep the F11 message
- [ ] Hover previews: check that the mouse resting on a card doesn't confuse the highlight

### TV mode on netflix.com
- [ ] Focused card lifts with the right boxart image and lines up with the card underneath
- [ ] Other cards in the row dim; nothing stays dimmed after leaving the row
- [ ] Info panel shows row name and title; check whether year, rating and synopsis appear (they come from Netflix's page data cache and may be missing)
- [ ] If synopsis is missing, find where Netflix keeps it now, or load it when a title is focused
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
- [ ] B on title details closes it and the highlight returns to the same card, not the top of the page
- [ ] B from a genre / My List / search page goes back and lands on the card you came from
- [ ] B from the player returns to the card you launched from
- [ ] Pressing B twice quickly never goes back two steps
- [ ] Opening a title lands on its Play button straight away
- [ ] Row scrolling with LB/RB/edge follows the animation (no early or late focus)

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
- [ ] Replace `innerHTML` with DOM building to clear the three lint warnings
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
- [x] Back navigation rework: waits for the modal/page to actually change instead of fixed delays, per-page focus memory (kept across reloads) so B returns to the exact card, double-press guard, row paging waits for the slide to settle
- [x] Controls bar: console-style button prompts that follow context, auto-detected Xbox / PlayStation / Nintendo / generic icons, press animation, auto-hide in player
- [x] Hand-drawn SVG button icon set (`glyphs.js`), also used on the help screen and settings preview
- [x] Signing script (`sign.ps1`)
- [x] Lint: 0 errors
