# Game data tables

Items and spells live in `public/data/items.json` and `public/data/spells.json`. The game fetches them at start
(`src/loaddata.ts`), the service worker precaches them for offline play, and the tests read the same files in Node
(`tests/setup.ts`). `src/sim/data.ts` parses them and throws with the entry name on any unknown word.

Both files are `{ "version": 1, "<items|spells>": [ ... ] }`. The position in the list is the id, so append new
entries at the end: saves, maps and quick slots refer to ids.

## spells.json

| Field | Meaning |
|-------|---------|
| `name` | Unique name; scrolls and tomes refer to it |
| `school` | `fire`, `water`, `air`, `earth`, `astral` |
| `target` | `foe`, `ally`, `ground`, `multi`, `self`, `corpse` |
| `cost`, `cd`, `reach` | Mana, cooldown in ticks (max 255), reach in tiles |
| `min`, `max` | Damage or healing (optional) |
| `radius`, `count` | Area radius in tiles, targets of a multi spell (optional) |
| `heal` | `true` for healing spells |
| `status`, `dur`, `val` | `bless`, `shield`, `haste`, `slow`, `poison`, `burn`, `stone`, `weaken`; seconds; strength |

At most 32 spells (known spells are one bit each).

## items.json

| Field | Meaning |
|-------|---------|
| `name` | Unique name |
| `kind` | `gear`, `potion`, `learn` |
| `slot` | Gear only: `weapon`, `shield`, `helm`, `armor`, `boots`, `ring`, `amulet`, `gloves` |
| `cls` | `warrior`, `mage`, `both` (default) |
| `tier`, `w` | Item level 1-5, weight |
| `need`, `needv` | Attribute (`body`, `agility`, `mind`, `spirit`) and value needed |
| `min`, `max`, `acc` | Blow damage and hit bonus |
| `cover`, `def`, `abs` | Body parts protected (`head`, `torso`, `arms`, `legs`) and the defence and absorption on each |
| `res` | Five resistances in percent: fire, water, air, earth, astral |
| `attr` | Four attribute bonuses |
| `hp`, `mana`, `pow` | Hit points, mana, spell power percent |
| `heal`, `restore`, `grow` | Potions: hit points, mana, attribute raised by one for good |
| `spell` | Learn items: name of the spell taught |

## Body-part armour

A physical blow first picks a part: torso 45%, arms 20%, legs 20%, head 15%. A head blow deals 150% damage. The hit
chance is `70 + 3 x (accuracy - defence of that part)`, clamped to 15-95%. Defence of a part = dodge (unit kind,
Agility / 2 for the hero) + natural armour of the kind + armour worn on that part. Damage taken = damage minus the
absorption of that part (Guard skill counts on every part), at least 1. School damage ignores armour and uses
resistance.

## F3 debug overlay

F3 toggles a tile grid (blocked tiles red, higher ground lighter), the A* path of the selected units, and a panel
with the tile under the mouse (coordinates, height, terrain, light), the selected units' goals, and the newest hits:
`tick attacker > target part chance roll raw-cut=taken`. The hit log is recorded only while the overlay is on.
