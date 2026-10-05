# INKFALL: Stick Legions

Original 2D stickman strategy battler for mobile and desktop browsers (Vite + Canvas 2D, no external assets). Every unit, sound, map and name is original.

## Run

```bash
cd inkfall
npm install
npm run dev      # http://localhost:5174
npm run build    # static build in dist/
```

## Features

- **Economy:** Diggers mine gold and Essence, with a population cap.
- **Seven units, each with a role:** Digger, Blade, Ranger, Phalanx, Mender, Sage, Colossus.
- **Army commands:** Attack, Defend, Garrison. Garrisoned units hide behind the statue and the statue fires arrows.
- **Control mode:** take over any soldier with on-screen controls. A controlled soldier deals +50% damage.
- **Forge:** in-battle research (fury, fire arrows, shield wall, aegis, inferno, quake stomp, stone towers).
- **Campaign:** 12 battles over 9 themes (day, dusk, night, volcano, snow, desert, eclipse, swamp), with weather. The final battle ends in a boss fight.
- **Endless Night:** undead waves with a titan every 5 nights.
- **Skirmish:** pick the faction, map and difficulty.
- **Armory:** permanent upgrades bought with crowns earned from stars.
- **Presentation:**
  - A live AI battle plays behind the menu.
  - Speed toggle (x1 / x2) and a minimap.
  - Procedural music and sound effects.
  - Ragdoll deaths, particles and ink decals.
- **Saves:** progress is stored in `localStorage`.

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Train units | Bottom buttons | `1`–`7` |
| Attack / Defend / Garrison | Right-hand buttons | `Z` / `X` / `V` |
| Control mode | CONTROL | `C` |
| Move and strike while controlling | ◀ ▶ HIT | `A` / `D` / `Space` |
| Forge | FORGE | `F` |
| Pause | ‖ | `P` / `Esc` |
