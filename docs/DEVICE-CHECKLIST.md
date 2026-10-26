# Device checklist (exit gate for every phase)

Run on the deployed URL (https://ivaylozhivkov88.github.io/thornvael/) on a real iPhone (Safari) and a real Android phone (Chrome). Record the result and date below.

1. Open the URL. The map appears, nothing is cut off by the notch or the browser bar.
2. Tap a few tiles: the hero walks there and goes around water and trees.
3. Rotate the phone: the layout adapts; in portrait a "rotate" hint shows.
4. Tap Install. Android: the install prompt appears. iPhone: the Add to Home Screen instructions appear. Install it.
5. Launch from the home screen icon: it opens fullscreen with the Thornvael icon and name.
6. Switch on airplane mode, close the app completely, launch it again: the map loads and the hero still walks.
7. Open Credits: the text shows and closes.
8. (Every phase after this one) the newest feature of the phase works by touch only.

## Results

| Date | Device and OS | Build | Pass or fail | Notes |
|------|---------------|-------|--------------|-------|
| | | | | |

## Phase 2 additions (touch squad, stress scene, audio)

Run on the live URL, on a real iPhone and a real Android phone. Add `?debug` to the address to see the overlay.

| # | Check | iPhone | Android |
|---|-------|--------|---------|
| 1 | Tap a blue unit: green ring appears. Tap the ground: the squad walks there (ping circle). | | |
| 2 | One-finger drag pans the map. Two-finger pinch zooms in whole steps (1x to 3x). | | |
| 3 | Tap "Box", drag a rectangle: units inside are selected. Tap "Add", tap more units: they are added or toggled. | | |
| 4 | Buttons are easy to hit; nothing sits under the notch or home bar. | | |
| 5 | Tap "Sound": a blip plays. Tap "Music": a looping tune plays. Flip the iPhone mute switch: does sound still play? Write the answer. | | |
| 6 | Switch to another app and back: game is paused while away, resumes, sound resumes. | | |
| 7 | Open `?stress` (300 units). Write the fps and "draw" ms from the overlay after 1 minute, and again after 10 minutes. | | |
| 8 | Overlay line "persisted": write true or false and the quota shown. | | |
| 9 | Install to home screen, go offline, relaunch: select and move still work. | | |

## Phase 3 additions (paths, formations, fog, day and night, minimap, groups)

Run on the live URL on a real iPhone and a real Android phone. `?debug` shows the overlay; `?crowd` puts all 300 units on your side; `?time=night` starts at night.

| # | Check | iPhone | Android |
|---|-------|--------|---------|
| 1 | Select all, tap far across the map: the group walks around trees and water, keeps a block formation, no unit walks through another. | | |
| 2 | Order the group through a narrow gap between trees: it squeezes through without freezing. | | |
| 3 | Unexplored ground is black, visited ground is dim, near the squad it is clear. Enemy units only show in the clear area. | | |
| 4 | Clock in the top bar runs; the screen darkens at dusk and view range shrinks at night (`?time=night`). | | |
| 5 | Minimap: tap and drag on it moves the camera; units and the white camera frame show. | | |
| 6 | Select some units, tap "Set", tap group button 1, tap "Set" again to leave. Tap another selection, tap button 1: the first selection returns. Tap 1 twice quickly: the camera jumps to the group. "Set" + "Add" + button adds to the group. | | |
| 7 | Tap "Pause", give an order, tap "Pause" again: the order runs after resume. Tap "Speed": x1, x1/2, x1/4. | | |
| 8 | Open `?crowd`, select all, send the 300-unit group across the map: write the lowest fps seen and whether any hitch is visible. | | |
