# Registro de riesgos

Fecha: 2026-07-10

Escala: Critico, Alto, Medio, Bajo.

| ID | Severidad | Fase recomendada | Riesgo confirmado | Evidencia | Mitigacion propuesta |
| --- | --- | --- | --- | --- | --- |
| R-SEC-001 | Critico | 7/8 | Clientes online pueden escribir estado canonico completo. | `PlayCardUseCase.execute` acepta `currentState` y llama `repository.updateGame`; `firestore.rules` permite `allow update` a participantes. | Introducir comandos versionados con `expectedVersion`/`commandId`; mover validacion a servidor autoritativo o coleccion de comandos. |
| R-SEC-002 | Critico | 7/8 | Informacion privada en snapshot compartido. | `GameStateMapper.toData` serializa `players.hand`, `deck.cards` y `deckSeed`. | Separar `PublicGameView`, `PrivatePlayerView` y `ServerGameState`. |
| R-SEC-003 | Alto | 8 | Reglas Firestore no limitan campos sensibles. | `games/{gameId}` permite update si `isParticipant(gameId)`. | Reglas por coleccion/campo, Emulator Suite y tests de reglas. |
| R-SEC-004 | Alto | 7 | Falta idempotencia y control de version en comandos. | DTOs actuales no incluyen `commandId` ni `expectedVersion`. | Contrato de comandos versionado y rechazo de comandos obsoletos. |
| R-ONLINE-001 | Alto | 7 | Presencia y partida comparten documento. | Heartbeat actualiza players dentro del snapshot de juego. | Separar presencia con `lastSeen`, grace period y abandono explicito. |
| R-ONLINE-002 | Alto | 7 | Abandono depende de temporizadores de cliente. | `useGameController` detecta stale desde snapshots y llama `markAbandoned`. | Autoridad server-side o Cloud Function para abandono. |
| R-FUNC-001 | Alto | 1 | Resultado de ronda ambiguo para empate. | `ScoringService.scoreRound` calcula `isDraw`, pero `GameState` solo persiste `winnerIds`. | Introducir `RoundOutcome` discriminado y migrar UI/tests. |
| R-FUNC-002 | Alto | 1 | Doble fuente de verdad de puntuacion. | `Player.score` existe junto a `GameState.scores`. | Deprecar/eliminar `Player.score` con migracion explicita. |
| R-FUNC-003 | Alto | 1 | Reinicio/revancha sin autorizacion. | `ResetGameUseCase` no valida `playerId`; `GameEngine.resetGame` no revisa estado/host. | Politica de host o voto de revancha protegida por version. |
| R-FUNC-004 | Medio | 1 | `localStorage` corrupto rompe carga. | `loadLocalPlayer` hace `JSON.parse` sin try/catch. | Lectura segura, validacion minima y fallback. |
| R-FUNC-005 | Alto | 1 | No hay `schemaVersion` ni migraciones. | `SerializedGameState` se mapea directo sin versionado. | Versionar snapshot, validar campos y migrar estados antiguos. |
| R-FUNC-006 | Medio | 1 | Codigos de sala sin evidencia de deteccion de colisiones. | Fase 0 no encontro prueba especifica de colision de `gameId`. | Generador con reintento transaccional y test. |
| R-AI-001 | Medio | 6 | IA acoplada a presentacion. | `chooseBotCardId` vive en `useGameController`. | Extraer `BotStrategy` y contexto sin informacion secreta. |
| R-AI-002 | Medio | 6 | IA sin niveles, memoria, intercambio ni coordinacion de equipo. | Heuristica actual solo elige carta valida/conservadora. | Estrategias facil/intermedia/dificil con tests por semilla. |
| R-UI-001 | Alto | 2/3 | Componentes y CSS monoliticos. | `GameBoard.tsx` 1557 lineas; `global.css` 3106 lineas. | Extraer BoardShell, layouts, hooks y CSS por capas. |
| R-UI-002 | Alto | 3 | Falla geometrica en iPhone grande. | Playwright falla en 430x932: notificacion no queda encima de cartas. | Recalcular capa/notificacion y agregar prueba Chromium/WebKit. |
| R-UI-003 | Medio | 3 | Falta `viewport-fit=cover`. | `index.html` usa `width=device-width, initial-scale=1.0`. | Actualizar meta viewport y variables safe-area. |
| R-UI-004 | Medio | 3 | Riesgo de `white-space: nowrap` en textos largos. | CSS contiene multiples `white-space: nowrap`, incluidas notificaciones/labels. | Permitir wrap donde haya textos dinamicos y probar nombres largos. |
| R-ASSET-001 | Alto | 4 | Precarga de cartas usa rutas incorrectas. | `preloadCardImages` crea `/cards/${cardId}.png`; Vite emite URLs hash mediante import glob. | Reutilizar `CardImageRegistry` o manifest real. |
| R-ASSET-002 | Alto | 4 | Imagen faltante tumba render. | `CardImageRegistry.getImage` lanza error si no encuentra asset. | Fallback visual, error boundary y auditoria build-time. |
| R-ASSET-003 | Medio | 4 | Assets pesados e inconsistentes. | 105 MB en cartas; `basto-6.PNG` ratio distinto; 4 `.PNG` son JPEG. | Auditoria automatica, normalizacion reproducible y formatos web. |
| R-PERF-001 | Alto | 4/18 | Bundle y assets grandes. | Build: `index` JS 906 KB minificado; carta `oro-1` 4.3 MB. | Code splitting, lazy load, WebP/AVIF y budget CI. |
| R-ANIM-001 | Medio | 5 | Riesgo de animar geometria. | `GameBoard` usa GSAP y CSS complejo; se debe confirmar separacion transform/orientacion. | FLIP con transform/opacity y pruebas reduced-motion. |
| R-TEST-001 | Alto | 17 | CI no ejecuta Playwright ni WebKit. | `.github/workflows/pages.yml` solo lint, test y build/docs. | Proyectos Chromium/WebKit, artifacts y traces en Actions. |
| R-TEST-002 | Alto | 8/17 | No hay pruebas Firestore Emulator/reglas. | `firebase.json` solo apunta reglas; no hay tests de seguridad. | Agregar emulator tests y gates de seguridad. |
| R-TEST-003 | Medio | 16 | Multiusuario real incompleto. | Solo lobby 4P con cuatro contextos; no jugadas/reconexion/revancha. | E2E 2P/4P con contextos simultaneos y comandos conflictivos. |
| R-CI-001 | Medio | 17 | Workflow usa `npm install`. | Pages step `Install dependencies` ejecuta `npm install`. | Cambiar a `npm ci` tras aprobacion de Fase CI. |
| R-DEPLOY-001 | Medio | 17 | Deploy puede publicar con E2E roto. | Pages no ejecuta Playwright; Fase 0 detecto 1 fallo local. | Bloquear deploy con E2E y auditoria de cartas. |

## Prioridades para la siguiente aprobacion

1. Fase 1 debe resolver R-FUNC-001, R-FUNC-002, R-FUNC-003, R-FUNC-004 y R-FUNC-005 sin redisenar UI.
2. Fase 3 debe cerrar R-UI-002 antes de considerar estable la experiencia movil.
3. Fase 7/8 debe cerrar R-SEC-001, R-SEC-002 y R-SEC-003 antes de producto comercial/ranking.
4. Fase 17 debe impedir que GitHub Pages despliegue si Playwright o auditorias criticas fallan.
