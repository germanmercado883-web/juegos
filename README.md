# DUSKVALE — Battle Royale Demo

Prototipo jugable de un battle royale **original** con estética low-poly de
juegos móviles de ~2018–2019. El mapa, las armas, el loot, la UI y los sonidos
se generan por código. El único asset externo es el esqueleto animado de los
personajes (ver Créditos), vestido con ropa táctica original.

## Novedades v4

- Granadas (G / botón G): caen donde apunta la mira, rebotan y explotan.
- Los rivales pelean entre sí y se cubren detrás de árboles y rocas al quedar heridos.
- Música procedural en el menú.
- Despliegue automático a Cloudflare Pages con GitHub Actions
  (`.github/workflows/deploy-cloudflare.yml`, requiere el secreto `CLOUDFLARE_API_TOKEN`).

## Novedades v3

- Lobby 3D en el menú con tu personaje animado.
- Escopeta M-12 Thunder y francotirador LR-5 Longshot (con mira telescópica);
  al recoger un arma nueva sueltas la que tenías.
- Cajas de suministros con paracaídas y humo rojo, marcadas en el minimapa.
- Móvil: asistencia de apuntado, pantalla completa, resolución adaptativa,
  vibración y botones que aparecen según el contexto.
- Eco en los disparos y rivales que reaccionan a los impactos.

## Novedades v2

- Personajes con esqueleto y animaciones reales (idle, caminar, trotar, sprint,
  agacharse, saltar, caída libre, muerte) + IK para sostener el arma.
- Inicio desde avión: salto, caída libre, paracaídas y aterrizaje.
- Zona segura que se cierra en 4 fases con temporizador y próximo círculo.
- Kill feed, rivales con nombre y 3 equipos de colores.
- Post-procesado (bloom suave, saturación, viñeta) en calidad HIGH.

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
| Espacio | Saltar · en el avión: lanzarse · en caída: abrir paracaídas |
| C | Agacharse |
| Clic derecho con francotirador | Mira telescópica |
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

## Créditos

- Esqueleto y animaciones de personaje: **Universal Animation Library** de
  [Quaternius](https://quaternius.com) — licencia CC0 1.0
  (`public/models/LICENSE-survivor-CC0.txt`), obtenido del espejo
  [J-Ponzo/gltf-universal-animation-library](https://github.com/J-Ponzo/gltf-universal-animation-library).
  Se recortó a 15 animaciones con glTF-Transform.
- Motor: [three.js](https://threejs.org) (MIT). Herramienta: [Vite](https://vitejs.dev) (MIT).
