# Fase 0 - Auditoria del estado actual

Fecha: 2026-07-10

Rama auditada: `main` en `302ba4a` (`Fix Pages lint failures`).

Alcance: Fase 0 del prompt maestro. No se modifico codigo productivo y no se inicio Fase 1.

## Puerta de fase

El prompt maestro ordena empezar unicamente con Fase 0, documentar la linea base y esperar aprobacion antes de Fase 1. Esta auditoria deja evidencia ejecutable, riesgos y plan por PRs para que la siguiente fase sea aprobable y reversible.

## Skills disponibles y seleccionadas

| Skill | Estado | Uso en Fase 0 |
| --- | --- | --- |
| `card-game` | Instalada en `skills-lock.json` | Auditar reglas, baraja, zonas, reparto, baza, puntuacion e intercambio de triunfo. |
| `frontend-design` | Instalada en `skills-lock.json` | Auditar layout, responsive, modales, accesibilidad y deuda visual. |
| `playwright-visual-testing` | Instalada en `skills-lock.json` | Auditar pruebas E2E, capturas, geometria y viewports. |

Sustituciones documentadas: no hay skills exactas instaladas para React/TypeScript, accesibilidad, rendimiento, GSAP, Firebase, reglas Firestore, seguridad, CI, Vite, Capacitor o iOS. En Fase 0 se auditaron esas areas con inspeccion directa de codigo, configuracion y ejecucion de comandos. No se instalaron skills nuevas.

## Fuentes consultadas

1. Codigo de la rama `main`.
2. Pruebas existentes en `src/tests` y `tests/e2e`.
3. Documentacion existente en `README.md` y `docs/`.
4. Especificacion tecnica y guia de arte disponibles como DOCX locales, no versionadas por `.gitignore`.
5. Comportamiento observado mediante `npm run test:run`, `npm run build` y `npx playwright test`.

## Arbol de modulos

```text
src/
  application/
    ports/               Puertos de auth y repositorio.
    services/            Clock e IdGenerator.
    use-cases/           Casos de uso transaccionales de partida.
    onlineConfig.ts      Tiempos de heartbeat y abandono.
  domain/
    cards/               Card, Deck, Hand, Rank, Suit.
    game/                GameState, GameEngine, Player, Trick, Score, Team.
    rules/               BriscasRules, TrickResolver, validaciones.
    scoring/             ScoringService.
    errors/              Errores de dominio.
  infrastructure/
    config/              Config Firebase desde entorno.
    firebase/            Firebase app, auth y FirestoreGameRepository.
    mappers/             GameStateMapper y serializacion.
    repositories/        InMemoryGameRepository.
  presentation/
    assets/              CardImageRegistry.
    audio/               SoundEffects.
    components/          App UI, menu, lobby, board, cards, scoreboard.
    hooks/               useGameController.
    styles/              global.css monolitico.
  tests/                 Unit/integration Vitest.
tests/e2e/               Playwright E2E/geometria.
```

## Responsabilidades por capa

| Capa | Responsabilidad actual | Observacion |
| --- | --- | --- |
| Dominio | Reglas de cartas, reparto, turnos, baza, puntuacion, abandono y reinicio. | Es mayormente puro. Mantiene `Player.score` y `GameState.scores` al mismo tiempo. |
| Aplicacion | Orquesta casos de uso y persistencia a traves de `GameRepository`. | `PlayCardUseCase` puede escribir estado optimista completo sin transaccion cuando recibe `currentState`. |
| Infraestructura | Mapea `GameState` a Firestore/in-memory, auth anonima y suscripciones. | Firestore conserva estado privado y publico en el mismo documento. No hay `schemaVersion` ni validacion de esquema. |
| Presentacion | Menu, lobby, tablero, sonido, bots locales, notificaciones, geometria y E2E hooks. | `GameBoard.tsx`, `useGameController.ts` y `global.css` concentran demasiadas responsabilidades. |

## Dependencias indebidas y acoplamientos

- `useGameController.ts` instancia repositorios, auth, use cases, sonido, bots y persistencia local. Tambien contiene heuristica IA (`chooseBotCardId`) y precarga de cartas.
- `GameBoard.tsx` mezcla render, calculo de geometria, modales, notificaciones, fases visuales, GSAP y reglas de intercambio.
- `global.css` contiene tokens, base, lobby, tablero 2P/4P, modales, graficas, accesibilidad, responsive y animaciones en una sola hoja de 3106 lineas.
- `FirestoreGameRepository` serializa `players`, `deck`, `deckSeed`, `scores`, `winnerIds` y `loserIds` en el snapshot compartido.
- `firestore.rules` permite `update` amplio a participantes del documento `games/{gameId}` y de subdocumentos `players/{playerId}`.

## Tamano de archivos principales

| Archivo | Lineas |
| --- | ---: |
| `src/presentation/styles/global.css` | 3106 |
| `src/presentation/components/GameBoard.tsx` | 1557 |
| `src/presentation/hooks/useGameController.ts` | 694 |
| `src/domain/game/GameEngine.ts` | 439 |
| `src/infrastructure/firebase/FirestoreGameRepository.ts` | 320 |
| `src/infrastructure/mappers/GameStateMapper.ts` | 227 |
| `tests/e2e/*.ts` | 2226 total |
| `src/tests/*.test.ts` | 490 total |

## Estado de los cuatro modos

| Modo | Estado observado | Cobertura actual | Riesgo |
| --- | --- | --- | --- |
| 2P local IA | Arranca por menu local y aparece en pruebas de grafica final. | Vitest dominio/aplicacion y Playwright de grafica en viewports. | No hay E2E de partida completa ni IA modular. |
| 2P online | Simulado como modo de presentacion en pruebas de grafica. | Playwright no prueba dos clientes jugando una partida completa. | Estado privado y canonico siguen en cliente/Firestore. |
| 4P local bots | Arranca y es foco principal de geometria/responsive. | Amplia cobertura Chromium por viewports. | IA de equipo no es modular y un fallo geometrico persiste en 430x932. |
| 4P online equipos | `four-player-join.spec.ts` crea una sala online y verifica cuatro contextos en lobby. | No usa Firebase Emulator; no prueba jugadas alternas, reconexion, abandono ni revancha. | Puede tocar Firebase configurado localmente/prod y no valida seguridad. |

## Flujo de jugada local

1. `MainMenu` llama `startLocal` en `useGameController`.
2. Se crea `InMemoryGameRepository` y casos de uso locales.
3. `CreateGameUseCase`, `JoinGameUseCase` para bots y `StartGameUseCase` preparan `GameState`.
4. `GameBoard` renderiza la mano sur y llama `onPlayCard`.
5. `PlayCardUseCase` usa transaccion in-memory y `GameEngine.playCard` valida turno/mano.
6. Si la baza se completa, `GameEngine.finishTrick` resuelve ganador, suma puntos, roba cartas y termina ronda si aplica.
7. En turno de bot, `chooseBotCardId` en `useGameController` elige carta valida con heuristica conservadora.

## Flujo de jugada online

1. `createOnline` o `joinOnline` autentica anonimamente con Firebase.
2. `FirestoreGameRepository` crea o lee `games/{gameId}`.
3. La UI se suscribe a `onSnapshot` del documento de juego.
4. En `playCard`, el cliente calcula `optimisticPlayCard` y pasa ese estado a `PlayCardUseCase`.
5. Con `currentState`, `PlayCardUseCase` ejecuta `repository.updateGame({ state: stamped })`, no `runTransaction`.
6. Firestore escribe el snapshot completo serializado por `GameStateMapper`.

Riesgo: el cliente puede sobrescribir estado canonico y el comando no incluye `expectedVersion` ni `commandId` idempotente.

## Flujo de baza terminada

1. `GameEngine.playCard` agrega la carta a `currentTrick`.
2. Si `currentTrick.isComplete(playerCount)`, llama `finishTrick`.
3. `StandardTrickResolver.resolveWinner` determina ganador por triunfo/palo/fuerza.
4. `StandardScoringService.scoreTrick` suma puntos de cartas jugadas.
5. El ganador recibe `capturedTricks`, `scores` y entrada de `scoreHistory`.
6. Roban cartas en orden desde el ganador.
7. `lastCompletedTrick` conserva la baza anterior y `currentTrick` se reinicia con el ganador como lider.
8. Si no quedan cartas ni manos, se marca `Ended` y se llena `winnerIds`.

Riesgo: la presentacion final depende de estados visuales dentro de `GameBoard`, no de una maquina compartida y probada para 2P/4P.

## Flujo de reconexion y abandono

- Heartbeat cliente cada 12s mediante `HeartbeatUseCase`.
- Deteccion cliente de jugadores stale con gracia de 45s.
- Cualquier cliente puede invocar `MarkPlayerAbandonedUseCase` si detecta stale.
- `GameEngine.markPlayerAbandoned` termina la ronda, marca `abandonedPlayerIds`, `loserIds` y `winnerIds`.
- `leaveGame` solo desuscribe y vuelve al menu; no emite abandono explicito.

Riesgo: temporizadores de cliente movil suspendidos pueden disparar abandono falso. La presencia comparte documento con partida.

## Flujo de resultado y nueva ronda

- Resultado final se representa con `winnerIds`, `loserIds` y `abandonedPlayerIds`.
- Empate se calcula en `StandardScoringService.scoreRound` con `isDraw`, pero `GameState` no conserva un `RoundOutcome` explicito.
- `ResetGameUseCase` no valida que el solicitante sea host ni que la partida haya terminado.
- `GameEngine.resetGame` devuelve sala a `Waiting`, rota `dealerSeatIndex` y limpia manos/estado visual.

Riesgo: empate puede inferirse por longitud de `winnerIds`; reinicio/revancha no tiene politica de autorizacion.

## Modelo de persistencia

Colecciones actuales documentadas y confirmadas:

```text
games/{gameId}
  snapshot serializado de GameState, incluyendo players, manos, mazo, deckSeed,
  currentTrick, scores, scoreHistory, winnerIds, loserIds, version.

games/{gameId}/players/{playerId}
  subdocumentos conservados para compatibilidad y reglas.

games/{gameId}/moves/{moveId}
  solo se escriben CreateGame, JoinGame, StartGame y ResetGame.
```

No hay `schemaVersion`, migraciones ni validacion formal de snapshots persistidos.

## Modelo de amenazas resumido

| Amenaza | Evidencia | Impacto |
| --- | --- | --- |
| Cliente malicioso escribe estado oficial | `firestore.rules` permite `allow update` a participantes; `PlayCardUseCase` puede `updateGame` con estado optimista. | Trampa, saltos de turno, alteracion de puntuacion o mazo. |
| Filtracion de informacion privada | `GameStateMapper.toData` serializa `players.hand`, `deck.cards` y `deckSeed`. | Participantes pueden inspeccionar manos ajenas/mazo en Firestore. |
| Repeticion/concurrencia de comandos | Comandos no exponen `commandId` ni `expectedVersion`. | Doble aplicacion, carreras, rollback visual incorrecto. |
| Abandono inducido | Heartbeats y stale detection viven en clientes. | Un cliente lento o movil en background puede perder injustamente. |
| Reglas Firestore insuficientes | No hay pruebas de reglas ni Emulator Suite en CI. | Regresiones de seguridad no bloqueadas. |

## Inventario de assets de cartas

- Se encontraron 40 archivos en `src/assets/cards`, cubriendo 4 palos y 10 rangos nominales.
- Tamano total: 105 MB.
- La mayoria reporta 992 x 1586, ratio aproximado 0.6255.
- `basto-6.PNG` reporta 1024 x 1536, ratio 0.6667.
- Algunos archivos con extension `.PNG` son JPEG segun `file`: `basto-11.PNG`, `basto-6.PNG`, `copa-10.PNG`, `espada-10.PNG`.
- Build emitio assets individuales entre 256 KB y 4.3 MB, con advertencia de chunk JS grande.
- `CardImageRegistry.getImage` lanza error si falta una imagen; no hay fallback visual ni boundary.
- `preloadCardImages` construye rutas manuales `/cards/${cardId}.png`, distintas del registro real de Vite.

## Pruebas existentes y huecos

| Area | Existe | Huecos confirmados |
| --- | --- | --- |
| Dominio | 20 tests Vitest pasan. | Faltan invariantes completas de 40 cartas, zonas unicas, resultado explicito y escenarios IA. |
| E2E Chromium | 410 tests configurados en Playwright default. | 1 falla en 430x932; no hay proyectos Chromium/WebKit separados. |
| Multiusuario | Un test de 4 contextos valida lobby online 4P. | No hay juego completo 2P/4P online, reconexion, abandono, reintento, conflicto de version ni revancha. |
| Firestore | App usa Firebase real si esta configurado. | No hay Emulator Suite ni pruebas de reglas. |
| Accesibilidad | Algunas pruebas de aria-label, dialog/foco y tap regions. | Falta auditoria sistematica de teclado, contraste, screen reader y `aria-live`. |
| Rendimiento | Build reporta tamano de assets/chunk. | No hay presupuestos, Lighthouse, bundle budget ni conteo de renders/reads/writes. |
| Cartas | Assets presentes manualmente. | No hay auditoria automatica que bloquee baraja incompleta, ratio inconsistente o assets demasiado pesados. |

## Linea base ejecutada

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `npm ci` | Pasa con advertencias. | Peer conflict Vite/VitePress, Node v23.11.0 fuera de engines esperados, 3 vulnerabilidades, scripts pendientes de aprobacion. |
| `npm run lint` | Pasa con 4 warnings. | Warnings `react-hooks/exhaustive-deps` en `GameBoard.tsx` lineas 432, 453, 688 y 762. |
| `npm run test:run` | Pasa. | 3 archivos, 20 tests. |
| `npm run build` | Pasa con warnings. | JS `906.41 kB` minificado, `277.30 kB` gzip; assets de cartas hasta `4,305.38 kB`; warning de chunk > 500 kB. |
| `npx playwright test` | Falla. | Primer intento corto por timeout de herramienta tras 62/410. Segundo intento: 409 passed, 1 failed, 16.2m. |

Fallo Playwright reproducible:

```text
tests/e2e/4p-mobile-viewport.spec.ts:239
4P layout at 430x932 - notifications are above cards and fully readable
Expected analysis.notifications.above to be true; received false.
```

Artifacts locales generados por Playwright, no versionados por `.gitignore`:

```text
test-results/4p-mobile-viewport-4P-layo-6688c-ve-cards-and-fully-readable/test-failed-1.png
test-results/4p-mobile-viewport-4P-layo-6688c-ve-cards-and-fully-readable/error-context.md
test-results/4p-mobile-viewport-4P-layo-6688c-ve-cards-and-fully-readable/trace.zip
```

## Defectos confirmados antes de Fase 1

1. Estado online compartido contiene manos, mazo y semilla.
2. Cliente puede escribir snapshot oficial completo en online.
3. Reglas Firestore permiten updates amplios a participantes.
4. No existe `RoundOutcome` explicito en `GameState`.
5. `Player.score` duplica `GameState.scores`.
6. Reinicio no valida autorizacion del solicitante.
7. `localStorage` puede romper por JSON corrupto en `loadLocalPlayer`.
8. No hay `schemaVersion`, migraciones ni validacion de snapshots persistidos.
9. IA esta dentro del hook de presentacion y no tiene niveles, memoria, intercambio ni coordinacion de equipo.
10. Preload de cartas usa rutas incorrectas para Vite.
11. Imagen faltante lanza error durante render.
12. `viewport-fit=cover` no esta en `index.html`.
13. Playwright falla en 430x932 por notificacion debajo/no encima de cartas.
14. CI de Pages usa `npm install` y no ejecuta Playwright, WebKit, reglas Firestore ni auditoria de cartas.

## Plan dividido en PRs

| PR/Fase | Objetivo | Puerta de salida |
| --- | --- | --- |
| PR-0 | Auditoria y linea base. | Docs creados, comandos registrados, aprobacion humana. |
| PR-1 | Resultado explicito, fuente unica de puntuacion, reinicio/revancha y robustez localStorage/schema. | Unit tests nuevos, Playwright afectado pasando. |
| PR-2 | Presentacion compartida y extraccion de hooks/servicios. | No regresion 2P/4P, snapshots geometricos. |
| PR-3 | Geometria, UX, safe areas, accesibilidad y notificaciones. | Chromium/WebKit en viewports iPhone, fallo 430x932 cerrado. |
| PR-4 | Pipeline de cartas, auditoria de assets, fallback y preload Vite. | Auditoria 40/40 en CI, build sin assets faltantes. |
| PR-5 | Animaciones eficientes y reduced motion. | Pruebas de movimiento reducido y no layout-thrashing. |
| PR-6 | IA modular por niveles y equipos. | Tests deterministas por semilla, sin informacion secreta. |
| PR-7 | Contratos para servidor autoritativo y ADR backend. | DTOs versionados, idempotencia/expectedVersion documentados. |
| PR-8 | Seguridad Firestore y migracion. | Emulator y reglas con tests automatizados. |
| PR-9 | Producto: salas, historial, perfiles. | Depende de autoridad y seguridad. |
| PR-10 | ADR iOS/App Store y ruta Capacitor. | Sin acoplar dominio a iOS. |

## Criterio de rollback

Fase 0 solo agrega documentacion bajo `docs/audits/` y `docs/adr/`. Rollback: revertir el commit de Fase 0 sin impacto en runtime.

## Decision de parada

No se debe iniciar Fase 1 hasta aprobar esta auditoria, especialmente porque la puerta Playwright actual falla 1/410 y hay riesgos de seguridad online confirmados.
