# DUSKVALE — Battle Royale Demo

Prototipo jugable de un battle royale **original** con estética low-poly de
juegos móviles de ~2018–2019. Todo (mapa, personaje, armas, loot, UI y
sonidos) se genera por código: no hay assets externos.

## Ejecutar

Requisitos: Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre **http://localhost:5173** en el navegador (Chrome, Edge o Firefox).

Build de producción: `npm run build`, luego `npm run preview` (puerto 4173).

## Controles

| Tecla | Acción |
|---|---|
| WASD | Moverse |
| Shift | Correr |
| Espacio | Saltar |
| Mouse | Apuntar (clic en el juego para capturar el mouse) |
| Clic izquierdo | Disparar |
| Clic derecho | Apuntar con mira (ADS) |
| Rueda | Zoom de cámara |
| E | Recoger loot |
| R | Recargar |
| 1 / 2 / Q | Cambiar de arma |
| H | Usar botiquín |
| Esc / P | Pausa |

## Estructura

```
src/
  main.js                 arranque y flujo menú → carga → partida
  core/       Game.js     loop, estados de partida, orquestación
              Input.js    teclado, mouse y pointer lock
  world/      mapLayout   layout del mapa (POIs, caminos, spawns, zona)
              Terrain     heightfield procedural + malla low-poly
              Structures  casas, granero, almacén, ruinas, torre, contenedores
              Vegetation  árboles, arbustos, rocas y pasto (InstancedMesh)
              Sky         cielo con gradiente, sol, nubes y montañas
              World       compone todo, luces, sombras, fusión de mallas
  entities/   CharacterModel  humanoide low-poly con IK de brazos
  player/     Player, ThirdPersonCamera
  weapons/    weaponData, WeaponModels, PlayerWeapons (hitscan)
  enemies/    Enemy       IA simple: patrulla → detecta → se acerca → dispara
  loot/       Loot        objetos, prompt y efectos en el inventario
  systems/    Physics     colisiones (cajas orientadas, cilindros, terreno) y raycasts
              SafeZone    zona segura con daño progresivo
              Effects     fogonazo, trazadoras, partículas de impacto
  audio/      Sfx         sonidos procedurales con Web Audio
  ui/         HUD, Menu, styles.css
```

En la consola del navegador, `window.__duskvale` expone el objeto del juego
para depurar.
