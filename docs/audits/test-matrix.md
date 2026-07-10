# Matriz de pruebas y linea base

Fecha: 2026-07-10

## Configuracion actual

| Area | Estado |
| --- | --- |
| Unit/integration | Vitest, `src/tests/**/*.test.ts`, entorno node. |
| E2E | Playwright, `tests/e2e`, sin proyectos por navegador. |
| Navegador E2E efectivo | Default Playwright, Chromium. No hay proyecto WebKit. |
| Servidor E2E | `npx vite --port 5173`, `reuseExistingServer: true`. |
| CI Pages | Lint, Vitest, build app, build docs, deploy Pages. |
| Firebase Emulator | No configurado en scripts ni CI. |
| Rules tests | No existen. |

## Resultado de comandos obligatorios

| Comando | Resultado | Duracion/volumen | Observaciones |
| --- | --- | --- | --- |
| `npm ci` | Pasa | 512 paquetes | Warnings de engines por Node v23.11.0, peer conflict Vite/VitePress, 3 vulnerabilidades, install scripts pendientes. |
| `npm run lint` | Pasa con warnings | 4 warnings | Todos `react-hooks/exhaustive-deps` en `GameBoard.tsx`. |
| `npm run test:run` | Pasa | 3 archivos, 20 tests, 860ms | `abandonment`, `application`, `domain`. |
| `npm run build` | Pasa con warnings | 121 modulos, 827ms | JS 906.41 KB minificado; warning chunk > 500 KB; assets de cartas hasta 4.3 MB. |
| `npx playwright test` | Falla | 409 passed, 1 failed, 16.2m | Fallo geometrico en 4P 430x932. |

## Fallo E2E activo

| Archivo | Viewport | Prueba | Sintoma | Artifacts locales |
| --- | --- | --- | --- | --- |
| `tests/e2e/4p-mobile-viewport.spec.ts:239` | 430 x 932 | `notifications are above cards and fully readable` | `analysis.notifications.above` es `false` cuando hay notificacion visible. | Screenshot, `error-context.md` y `trace.zip` bajo `test-results/4p-mobile-viewport-4P-layo-6688c-ve-cards-and-fully-readable/`. |

## Viewports requeridos vs existentes

| Viewport requerido | Evidencia actual | Estado |
| --- | --- | --- |
| 320 x 568 | `game-board`, `final-results`, `4p-mobile`, `score-evolution`, `south-hand`. | Cubierto en Chromium. |
| 360 x 640 | `4p-mobile`, `score-evolution`, `south-hand`. | Cubierto en Chromium. |
| 375 x 667 | Multiples specs de geometria, notificaciones, south hand y grafica. | Cubierto en Chromium. |
| 375 x 812 | `4p-mobile`, `score-evolution`, `south-hand`. | Cubierto en Chromium. |
| 390 x 844 | Multiples specs. | Cubierto en Chromium. |
| 393 x 852 | `final-results`, `4p-mobile`, `score-evolution`, `south-hand`. | Cubierto en Chromium. |
| 414 x 896 | `final-results`, `4p-mobile`, `score-evolution`, `south-hand`. | Cubierto en Chromium. |
| 430 x 932 | Multiples specs. | Cubierto en Chromium, 1 fallo activo. |
| 768 x 1024 | No confirmado en specs leidas. | Hueco a cubrir. |
| 1024 x 768 | `responsive-trick-cards`, `score-evolution`. | Cubierto parcial en Chromium. |
| 1280 x 720 | Multiples specs. | Cubierto en Chromium. |
| 1366 x 768 | `responsive-trick-cards`, `score-evolution`. | Cubierto parcial en Chromium. |
| 1440 x 900 | `gameboard-geometry`, `responsive-trick-cards`, `score-evolution`. | Cubierto en Chromium. |
| 1920 x 1080 | Multiples specs. | Cubierto en Chromium. |

## Modos requeridos vs pruebas existentes

| Modo | Unit | E2E local | E2E multi-contexto | Estado |
| --- | --- | --- | --- | --- |
| 2P local IA | Dominio/aplicacion cubren reglas basicas. | `score-evolution-modal` fuerza resultado 2P local. | No. | Parcial. |
| 2P online | No especifico. | `score-evolution-modal` usa presentationMode `online` via evento E2E. | No hay dos contextos. | Simulado, no real. |
| 4P local bots | Dominio cubre equipos parcialmente. | Amplia cobertura layout/geometria/grafica. | No aplica. | Parcial, 1 fallo movil. |
| 4P online equipos | No especifico. | `score-evolution-modal` simula modo online. | `four-player-join.spec.ts` usa 4 contextos para lobby. | Lobby real, sin partida completa. |

## Navegadores

| Navegador | Configurado | Resultado |
| --- | --- | --- |
| Chromium | Si, default Playwright. | 409/410 pasan. |
| WebKit | No hay proyecto. | No ejecutado. |
| Firefox | No hay proyecto. | No ejecutado. |

## Geometria cubierta

| Criterio del prompt | Evidencia existente | Hueco |
| --- | --- | --- |
| Etiquetas dentro del viewport | `4p-mobile-viewport`, `gameboard-geometry`. | Cubrir WebKit. |
| Cero interseccion nombres/cartas | `gameboard-geometry`, `4p-mobile-viewport`. | Consolidar 2P/4P. |
| Nombres laterales verticales | `4p-mobile-viewport`. | Validar accesibilidad textual. |
| Notificacion fuera de cartas | Varias specs. | Falla en 430x932. |
| Mano sur segura | `south-hand-accessibility`. | WebKit y zoom texto. |
| Carta de baza con dimensiones reales | `responsive-trick-cards`. | Auditar ratio unico y assets. |
| Mazo/triunfo sin colisiones | `responsive-trick-cards`, `4p-mobile-viewport`. | WebKit. |
| Dialogo final dentro viewport | `final-results-dialog`, `score-evolution-modal`. | Restauracion de foco mas completa. |
| Controles 44 x 44 | `final-results-dialog`, `south-hand-accessibility`. | Inventario de todos los controles. |
| Cero overflow horizontal | Multiples specs. | WebKit y docs de threshold. |

## Accesibilidad cubierta

| Criterio | Estado |
| --- | --- |
| Foco en modal de grafica | Probado en `score-evolution-modal`. |
| `role="dialog"` | Probado para score modal; final result requiere consolidacion. |
| Nombres accesibles de cartas | Probado parcialmente por locators y south hand. |
| `aria-live` | Status aparece en snapshot; falta prueba especifica de anuncios. |
| Movimiento reducido | Probado para pulse de intercambio. |
| Teclado completo | No cubierto. |
| Contraste | No cubierto automaticamente. |
| Zoom de texto | No cubierto. |

## Seguridad y Firestore

| Criterio | Estado |
| --- | --- |
| Usuario ajeno no lee partida privada | No probado. |
| Jugador no modifica mano ajena | No probado; reglas actuales no lo impiden por campo. |
| Jugador no cambia puntuacion | No probado; reglas actuales no lo impiden por campo. |
| Jugador no fuerza turno | No probado; cliente puede escribir snapshot si participante. |
| Jugador no reinicia sin autorizacion | No probado; use case no valida host. |
| Usuario no entra a sala llena | Regla de dominio existe; falta rules/emulator. |
| Comando duplicado no se aplica dos veces | No probado; no hay command id. |

## Matriz minima propuesta para fases siguientes

| Gate | Comandos/proyectos | Requisito |
| --- | --- | --- |
| Unit dominio | `npm run test:run` | 100% pass, agregar invariantes de baraja/zonas/puntuacion. |
| Lint/typecheck | `npm run lint`, `npm run build` o script dedicado | 0 errores y warning budget acordado. |
| E2E Chromium | `npx playwright test --project=chromium` | 2P/4P local y online simulado, todos viewports. |
| E2E WebKit | `npx playwright test --project=webkit` | Viewports iPhone criticos y modales. |
| Multiusuario | Specs con 2 y 4 contexts | Crear, unir, iniciar, jugar turnos, reconectar, abandonar, revancha. |
| Firestore emulator | `firebase emulators:exec ...` | Reglas y flujos online sin tocar produccion. |
| Auditoria cartas | Script dedicado | 40 cartas, sin duplicados, ratio/tamano/formato validos. |
| A11y | Playwright + axe o checks propios | Teclado, foco, dialog, aria-live, contraste. |
| Performance | Build budget + Lighthouse/trace opcional | JS/assets bajo presupuesto acordado. |

## Bloqueadores antes de declarar estable

1. Resolver el fallo Playwright 430x932 o aprobar una excepcion temporal explicita.
2. Agregar proyectos WebKit/Chromium en Playwright y CI.
3. Agregar pruebas con Emulator Suite antes de endurecer Firestore.
4. Automatizar auditoria de la baraja antes de tocar pipeline de assets.
