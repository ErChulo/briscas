# ADR backlog y plan por fases

Este directorio queda creado en Fase 0 para registrar decisiones arquitectonicas antes de cambios irreversibles. No hay ADR aprobados todavia; las decisiones siguientes deben redactarse como ADRs separados durante las fases correspondientes.

## ADRs pendientes

| ADR | Fase | Decision a tomar | Estado |
| --- | --- | --- | --- |
| ADR-001 | 1 | Modelo `RoundOutcome`, fuente unica de puntuacion y migracion de estados existentes. | Pendiente de aprobacion de Fase 1. |
| ADR-002 | 1/2 | Maquina de presentacion para ultima baza y resultado final compartida por 2P/4P. | Pendiente. |
| ADR-003 | 2 | Componentes compartidos y limites entre hooks de sesion, vista y dominio. | Pendiente. |
| ADR-004 | 3 | Politica de geometria, safe areas, visual viewport y accesibilidad movil. | Pendiente. |
| ADR-005 | 4 | Pipeline de cartas, formatos web, fallback y auditoria build-time. | Pendiente. |
| ADR-006 | 5 | Estrategia de animaciones GSAP/FLIP y reduced motion. | Pendiente. |
| ADR-007 | 6 | Arquitectura `BotStrategy`, niveles de IA y contexto sin informacion secreta. | Pendiente. |
| ADR-008 | 7 | Backend autoritativo: Firebase Cloud Functions, Cloud Run, WebSocket u otra opcion. | Pendiente. |
| ADR-009 | 8 | Migracion Firestore: public/private/server state, comandos y reglas. | Pendiente. |
| ADR-010 | 10 | Estrategia iOS: Capacitor, React Native o SwiftUI. | Pendiente. |

## Plan de PRs con puertas

| PR | Contenido permitido | No mezclar con | Puerta de aprobacion |
| --- | --- | --- | --- |
| PR-0 | Auditoria, matriz de riesgos, matriz de pruebas y ADR backlog. | Codigo productivo. | Revision humana de Fase 0. |
| PR-1 | Correcciones funcionales de alto riesgo. | Redisenos visuales o seguridad backend profunda. | Unit tests nuevos y E2E afectados pasando. |
| PR-2 | Refactor de presentacion compartida. | Cambios de reglas. | No regresion 2P/4P y diff visual aceptado. |
| PR-3 | Geometria, UX, accesibilidad, notificaciones y safe areas. | IA o backend autoritativo. | Chromium/WebKit y viewports iPhone pasando. |
| PR-4 | Auditoria/pipeline de cartas y preload/fallback. | Redisenos amplios de tablero. | Auditoria 40 cartas como gate CI. |
| PR-5 | Animaciones eficientes y reduced motion. | Reglas del juego. | Pruebas de ciclo visual y reduced motion. |
| PR-6 | IA modular por niveles/equipos. | Persistencia online o seguridad Firestore. | Escenarios deterministas por semilla. |
| PR-7 | Contratos y ADR de servidor autoritativo. | Aprovisionamiento comercial. | ADR aprobado y DTOs versionados. |
| PR-8 | Firestore security rules, emulator tests y migracion. | Ranking/perfiles. | Reglas pasan en Emulator Suite. |
| PR-9 | Salas, historial, perfiles y producto. | iOS/App Store. | Autoridad, seguridad y reconexion estables. |
| PR-10 | ADR iOS/App Store y plan Capacitor. | Cambios de dominio. | Plataforma aprobada y sin acoplar motor. |

## Criterios generales de decision

- Cada ADR debe incluir contexto, opciones consideradas, decision, consecuencias, riesgos y plan de rollback.
- Ninguna fase debe avanzar si falla una puerta obligatoria sin excepcion escrita.
- No se debe aprovisionar infraestructura comercial ni iniciar iOS antes de estabilizar motor, UI movil, autoridad, reconexion y seguridad.
