# Sky Courier — Ring Run over Alder Valley

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/robiyal/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/robiyal/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A complete, original 3D flight game for the [make.fun best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057). Fly the Kestrel K-2 prop plane through 12 glowing rings over the procedurally built Alder Valley — rolling hills, a river, a lake, the town of Alderfield and snow-capped mountains — then land on the runway. Fuel, throttle discipline and gentle landings turn each sortie into decisions.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

- **Arrow keys / A D** — pitch and roll; **W / S** — throttle; **mouse drag** — steer; **Space** — brake; **R** — restart; **P** — pause; **M** — mute.
- Fly through all 12 rings (the next one pulses orange with a beacon beam), then land gently on the runway. Landing refuels you; running out of fuel mid-valley means gliding home.
- Synthesised WebAudio engine hum, wind, ring chimes and landing fanfare — no audio files.

## Layout

- `game/index.html` + `game/style.css` — page and HUD (altitude, speed, heading, vertical speed, fuel, throttle, score, rings, timer).
- `game/src/world.js` — procedural terrain, river, lake, town, runway, sky, clouds, mountains.
- `game/src/flight.js` — arcade flight model: throttle, lift, stall, banked turns, landings, crashes.
- `game/src/aircraft.js` — the low-poly Kestrel K-2, built from Three.js primitives.
- `game/src/rings.js` — the 12-ring course, beacons and particle bursts.
- `game/src/hud.js` — instruments and screens. `game/src/audio.js` — synthesised sound. `game/src/shots.js` — deterministic screenshot framings.
- `game/vendor/three.min.js` — Three.js r160, vendored.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

## License

MIT — see [LICENSE](LICENSE).
