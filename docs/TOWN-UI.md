# Town screens: functional reference slice

The shop now presents six stock slots (two columns × three rows), a central original scene, four monetary actions, a hero portrait, and ten pack slots (five columns × two rows). Paging preserves all12 simulation stock slots and all24 inventory slots; no economy/map/save format changed. The shop rolls stock through the existing enter command on every visit.

Undo tracks the exact chronological purchase slot or inventory slot/count. Identical gear copies can be selected independently across pages. Buy and Sell settle their own lists through town commands. Exit discards uncommitted selections and displays current gold; the ledger separately projects the balance if both lists are settled. Capacity-limited partial buys retain unbought selections and show explicit feedback. Selecting an already fully selected item still updates its visible details.

The tavern presents selected mercenary stats and a separate Hire action, original host/hero imagery, available work and current quests. A non-caster archer uses an explicitly labelled bow-company emblem until a dedicated portrait exists, rather than a misleading plate-warrior portrait.

Town dialogs isolate background controls with restored `inert` states, own keyboard shortcuts, cycle Tab, close on Escape, preserve scroll after action rerenders and restore previous focus on exit. Rebuilt controls return focus to the dialog rather than the corresponding individual control; this remains a keyboard usability improvement for later work. Landscape and narrow screens scroll vertically without reducing targets below44px.

Art is original and reproducible from `tools/render-town.py`; item SVGs are authored in `src/townicons.ts`. Background and transparent merchant layers share the same4:3 camera bounds. Current reactions move one rendered cutout with CSS; they are not articulated/facial animation. See TOWN-ART.md.

Validation of this slice:209 unit tests,38 Chrome Playwright scenarios, build/typecheck/repository guard passed locally. Town scenarios include restock, prices, Undo chronology, duplicate inventory identities, partial capacity, refusal, keyboard isolation, portrait/layer loading and390px/844px reachability. Controlled duplicate/capacity tests explicitly construct inventory fixtures and do not claim those inventories were earned through gameplay. Real Android/iPhone checks remain open.

Independent critic: functional fixes pass; final visual quality does NOT pass. Current procedural characters/materials/portrait occupancy and cutout reactions remain below the requested modern RTS quality bar. This is a functional/composition pilot, not completion of final shop/trader art or all merchant types.
