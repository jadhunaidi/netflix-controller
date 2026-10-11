# Netflix Controller Navigator

A Firefox extension for browsing Netflix and controlling playback with a gamepad, console-style: a D-pad-driven highlight instead of a mouse cursor, a TV-style focus mode, an on-screen keyboard for search, and a controls bar with button icons that match your controller.

## Features

- **Spatial navigation** over Netflix's menus with a highlight ring, row paging and modal handling
- **TV mode**: enlarged focused title, row dimming, title info panel, fixed row position, no hover pop-ups
- **Player controls** through Netflix's own player API: play/pause, seek, volume, mute, skip intro, next episode, fullscreen
- **Controls bar** along the bottom with Xbox / PlayStation / Nintendo / generic button icons, following context; while watching it becomes a small corner chip that shows only while paused or a menu is open
- **On-screen keyboard** for search
- **Settings page** with a live controller tester and a button-remap wizard
- **Focus memory**: pressing B returns to the exact card you came from

## Install (temporary, for testing)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...** and pick `manifest.json`.
3. Open Netflix and press any button on the controller.

A temporary add-on is removed when Firefox closes. For a permanent install, sign it with Mozilla (see below).

## Signing

`sign.ps1` uploads the add-on to Mozilla's unlisted channel and downloads the signed `.xpi`. It needs API credentials from https://addons.mozilla.org/developers/addon/api/key/ and prompts for them with hidden input.

```powershell
powershell -ExecutionPolicy Bypass -File sign.ps1
```

Bump `"version"` in `manifest.json` before signing a new build; Mozilla won't sign the same version twice.

## Controls

| Menus | | Watching | |
|---|---|---|---|
| D-pad / left stick | Move | A / Start | Play / pause |
| A | Select | Left / Right | Seek |
| B | Back / close | LB / RB | Seek (long) |
| X | Search | Up / Down | Volume |
| Y | My List / jump to top | X | Mute |
| LB / RB | Scroll row | Y | Skip intro / recap |
| LT / RT | Page up / down | RT | Next episode |
| Right stick | Scroll page | LT | Audio & subtitles menu |
| View | Home | R3 / L3 | Speed menu / Episodes menu |
| Start | Help | View | Fullscreen |
| | | B | Exit player (closes an open menu first) |

## Files

- `manifest.json` - extension manifest (MV2, Firefox)
- `gamepad-core.js` - shared gamepad layer: bindings, deadzone, repeat, settings
- `glyphs.js` - SVG controller button icons
- `content.js` / `content.css` - navigation, TV mode, player control, controls bar, on-screen keyboard
- `options.html` / `options.js` / `options.css` - settings page, controller tester, remap wizard
- `background.js` - toolbar button opens the settings page
- `sign.ps1` - Mozilla signing helper
- `TODO.md` - roadmap and test checklists

## Status

See `TODO.md`. Tested against mock Netflix pages with a simulated controller; real-site testing is in progress.
