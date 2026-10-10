# TORNEO CPU 0.2.0 — CONTRATO PARA UNITY / CODEX
Estado: rama de desarrollo, NO publicado ni conectado a producción.
Rama: `feature/tournament-cpu-020-backend`. Punto de partida: Supervivencia 0.1.9 staging; `main` intacto.

## Comportamiento
- 7 duelos contra CPU, 5 preguntas por duelo y hasta 3 desempates. Cada pregunta dura 15 segundos.
- Solo el backend decide aciertos, resultados CPU y puntuación.
- CPU responde de forma predecidida al presentar la pregunta; Unity muestra THINKING / ANSWERED / REVEALED.
- Los resultados se registran por cuenta, separados de Supervivencia. Recompensas económicas DESACTIVADAS.
- Al abandonar o expirar (75 minutos), termina la sesión; volver a iniciar abre una nueva.
- Reintentos del mismo actionId son idempotentes; no generar actionId nuevo al repetir una petición con error de red.

## Endpoints (TODOS POST, application/json)
Prefijo: `/api/unity/tournament/v1`

- `/start`: `{"token":"<token>","requestId":"uuid-o-id-unico-12+"}`
- `/<runId>/state`: `{"token":"<token>"}`
- `/<runId>/answer`: `{"token":"<token>","actionId":"uuid-o-id-12+","questionId":"id-de-la-pregunta","selectedIndex":0}`
- `/<runId>/advance`: `{"token":"<token>","actionId":"uuid-o-id-12+"}`
- `/<runId>/abandon`: `{"token":"<token>","actionId":"uuid-o-id-12+"}`
- `/<runId>/result`: `{"token":"<token>"}`
- `/records/me`: `{"token":"<token>"}`

Respuesta: `{"ok":true,"state":{...},"duplicate":false}`. `start` puede responder `resumed:true` si hay una sesión activa. `state` incluye `runId`, `phase`, `match`, `totalMatches`, `rival`, `questionNumber`, `question`, `deadlineAt`, `player`, `cpu`, `scoreboard`, `matches` y `finishReason`.

Fases: `QUESTION_ACTIVE`, `PLAYER_LOCKED`, `QUESTION_RESOLVED`, `MATCH_RESULT`, `TOURNAMENT_FINISHED`. No se entrega el índice correcto antes de `QUESTION_RESOLVED`. Resultados finales: CHAMPION, ELIMINATED, TECHNICAL_DRAW, ABANDONED, EXPIRED.

UI: Pantalla de arena VS, estado pensando, rival respondió, revelación de respuesta, marcador, siguiente enfrentamiento y ceremonia de campeón. Nunca simular CPU con una segunda fuente de verdad dentro de Unity.

## Activación solo en staging
Requiere `SEMANTROPIC_ENV=staging`, `SURVIVAL019_ENABLED=1` y `TOURNAMENT020_ENABLED=1` en el backend de DESARROLLO. Además `TOURNAMENT020_SECRET` debe tener longitud >=32, generado de forma criptográficamente segura y guardado exclusivamente en secretos de Render/desarrollo. NO configurar ahora en el staging activo de Supervivencia mientras Codex realiza sus pruebas.

No subir contraseñas a GitHub. No desplegar ni hacer merge a `main`.

## Antes de conectar el nuevo cliente Unity
Ejecutar desde la raíz de la rama (Node.js >= 20):
`node tournament/test-cpu.js`
`node tournament/test-engine.js`
`node tournament/test-router.js`
`node --check server.js`

Además realizar pruebas HTTP reales y persistencia PostgreSQL **con una base aislada autorizada**: inicio/autenticación, respuesta inválida, reconexión, timeout, empate, campeonato, derrota, abandono, expire, acciones duplicadas y concurrentes, CORS, regresión Normal y Supervivencia. No usar cuentas reales ni registrar tokens.

## Advertencias técnicas
- Esta API está integrada detrás de bandera en el `server.js` de ESTA rama únicamente; no está en el backend de staging ni en producción.
- Las pruebas ejecutadas desde ChatGPT fueron simulaciones de JavaScript aisladas, no reemplazan las suites reales Node.js / PostgreSQL / WebGL.
- Verificar tiempos del servidor frente a latencia real, retención de partidas, límites anti-abuso y recarga de página antes de activar el modo.
- No asignar monedas/diamantes/XP al terminar Torneo: reglas económicas pendientes de aprobación.
