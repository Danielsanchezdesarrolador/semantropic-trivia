# SEMANTROPIC TRIVIA — TORNEO CPU 0.2.0
Estado: propuesta de arquitectura. No implementado ni desplegado.
Ámbito: modo Torneo de Unity; trabajo separado del 0.1.9 de Supervivencia.
Fecha de diseño: 2026-10-09.

## 1. Propósito
Torneo será una competencia individual conectada a la cuenta del jugador contra siete adversarios CPU consecutivos. Cada rival responde las MISMAS preguntas durante el MISMO intervalo de tiempo. El jugador ve marcador y estado del oponente, y debe derrotarlo para avanzar. No se necesita LLM ni llamada a servicios de IA.

## 2. Reglas iniciales propuestas (configurables; sujetas a aprobación)
- Siete enfrentamientos consecutivos. Cinco preguntas compartidas por duelo, de quince segundos cada una.
- La ronda se gana por mayor puntuación al terminar las cinco preguntas. En derrota se termina el torneo; las rondas posteriores quedan bloqueadas.
- Acierto: 100 puntos de base + bonificación temporal hasta 50; error o timeout: 0. Mismas reglas para CPU y humano. Esto es puntuación de duelo, no las recompensas económicas existentes.
- Empate: pregunta extra de desempate; si persiste, repetir hasta tres veces y luego resolver por tiempo acumulado de respuestas correctas. Un empate extremo se registra como empate técnico y ofrece revancha, sin conceder victoria o premio injustificado.
- La simulación CPU empieza al mostrar cada pregunta, NO después de la respuesta del jugador. No se adapta a aciertos, errores o marcador del jugador.
- Una partida puede reanudarse al volver a entrar. Registrar victoria final o derrota de forma persistente.
- Si el modo se publica antes de aprobar economía, las recompensas de monedas, XP, gemas y llaves se mantienen DESACTIVADAS. Un registro de resultados no equivale a otorgar recompensas.

## 3. Rivales propuestos (nombres/arte provisional)
1. Lira, Aprendiz: precisión base 55%; respuesta entre 7-11 s; ritmo reflexivo.
2. Bronn, Impulsivo: 59%; 3-7 s; rápido y errático.
3. Nix, Explorador: 65%; 5-9 s; desempeño equilibrado.
4. Vexa, Estratega: 71%; 6-10 s; alta precisión, mayor demora.
5. Arkan, Sabio: 77%; 7-11 s; dificultad elevada.
6. Kora, Prodigio: 83%; 3-6 s; rápida y precisa.
7. Magnus, Campeón: 88%; 4-8 s; rival final exigente.
Estos números son parámetros de diseño, NO resultados garantizados. El simulador los ajustará por la dificultad real de la pregunta (1-3) y especialidades temáticas, dentro de límites de equilibrio. El jugador podrá ganar mediante conocimiento y rapidez. Los nombres y personajes no reemplazan a Auraboy, Helen Girl ni BeniFox.

## 4. Autoridad y simulación
En el backend Node.js:
- Crear torneo y fijar configuración, semilla segura del rival y pregunta activa.
- Seleccionar preguntas del banco actual general_questions.json (id, category, difficulty, question, answers, correct). No enviar correct al cliente antes de cerrar pregunta.
- Simular la respuesta CPU al comenzar cada pregunta mediante una decisión reproducible por sesión y pregunta, generada en servidor con fuente aleatoria segura; guardar choiceIndex, respondedAt y score aunque todavía no sean visibles.
- No permitir que el cliente elija respuesta o tiempo de la CPU. Nunca aceptar puntajes agregados informados por el cliente.
- Los plazos se verifican con reloj del servidor; permitir latencia razonable documentada, sin prórrogas arbitrarias.
- Revelar ambas respuestas y marcador cuando corresponda. Al reconectar, el servidor devuelve el estado actual y no crea preguntas ni respuestas nuevas.
- Una acción con mismo actionId devuelve exactamente el resultado previo (idempotencia).

## 5. Máquina de estados
CREATED -> MATCH_INTRO -> QUESTION_ACTIVE -> QUESTION_RESOLVED -> MATCH_RESULT
MATCH_RESULT -> NEXT_MATCH -> MATCH_INTRO (si gana, aún restan rivales)
MATCH_RESULT -> TOURNAMENT_FINISHED (derrota o victoria tras ronda siete)
Estados excepcionales: ABANDONED, EXPIRED; reconexión recupera estados normales.
No duplicar navegación ni avanzar dos preguntas por doble clic.

## 6. Contrato API propuesto
Prefijo de desarrollo: /api/unity/tournament

POST /start  {token, requestId} -> tournamentId, currentMatch, rival, estado, pregunta pública y deadlineAt.
POST /:id/answer  {token, actionId, questionId, selectedIndex} -> recibo y estado actualizado; el servidor decide puntuación.
POST /:id/advance  {token, actionId} -> siguiente pregunta o ronda válida; nunca adelanta dos veces.
GET /:id/state?token=... -> estado de reconexión (preferir autenticación por cabecera en producción, no token en URL).
GET /:id/result -> resultado final verificado.
GET /records/me -> mejores resultados y torneos completados.
No incluir respuestas correctas, semillas, decisiones secretas o tokens en logs ni respuestas prematuras. Definir claves de idempotencia, manejo de reloj, expiración y códigos de error en implementación.

## 7. Persistencia segura
Preferencia: tablas PostgreSQL de desarrollo aisladas para tournament_runs, tournament_actions y tournament_records, con constraints de identificación y transacciones.
- run: owner playerId, estado, configuración/version, rival actual, pregunta, deadlineAt, CPU sealed outcome, contadores, timestamps, row version.
- actions: clave única (run_id, action_id); contenido validado, respuesta y recibo serializado.
- records: playerId, mejores valores, victorias, historial mínimo.
- Transacción por acción; locks/optimistic version para evitar pérdida de actualizaciones.
- Evitar sobrescrituras de todo profile_meta por concurrencia; no tocar persistRank en producción sin migración probada.
- No escribir tokens de cuenta en almacenamiento de partidas ni telemetría.

## 8. Arquitectura Unity
Reutilizar diseño del Home, tiempo, panel de pregunta, tarjetas, Results y API Client, sin reescribir Normal/Supervivencia.
Módulos a evaluar dentro de Unity018 tras revisar su estructura real:
- TournamentSessionController: estados/flujo y navegación.
- TournamentCpuPresenter: UI de CPU (animación de pensar/responder/revelar; jamás decide aciertos).
- TournamentArenaScreen: jugador VS CPU, vida del torneo, ronda y marcador.
- TournamentResultsScreen: duelo y campeonato.
- TournamentApiClient o extensión segura del cliente existente.
- TournamentConfig/RivalProfiles: parámetros compartidos versionados; servidor autoridad.
Usar escenas, assets y scripts existentes; NO asumir rutas ni tipos hasta auditoría local. Los nombres son propuestos.

## 9. Pruebas mínimas
- CPU programada antes de que el usuario responda, independiente de su acierto.
- Distribución de precisión y latencias dentro de parámetros y sin trampas.
- 7 duelos; victoria, derrota, empate y desempates.
- Doble clic, retry, actionId repetido, solicitudes concurrentes.
- Timeout, abandono, reconexión con pregunta activa, servidor reiniciado.
- Respuestas manipuladas, preguntas ajenas, tiempos alterados y credenciales expiradas.
- No duplicar records ni recompensas; no alterar Normal ni Supervivencia.
- WebGL staging conectado solo a backend/base de staging; CORS y secretos.
- Build validado y recorrido real de Chrome antes de cualquier solicitud de despliegue.

## 10. Plan de integración
A. Codex finaliza Supervivencia 0.1.9 en su copia Unity018, sin tocar esta rama.
B. Revisar cambios locales y del backend 0.1.9 antes de adaptar la API de Torneo.
C. Implementar módulo CPU, APIs y almacenamiento en rama aislada con pruebas; no tocar main.
D. Codex integra pantalla, escenas y recorrido completo en Unity (sin reescribir sistemas).
E. Probar end-to-end en staging; publicar solo tras autorización explícita.
F. Las reglas de recompensas y ranking público requerirán aprobación aparte.

## 11. Decisiones de producto por confirmar
- 5 preguntas por duelo (propuesta) versus 3 para partidas más cortas.
- Estética, nombres y especialidades finales de los siete rivales.
- Si hay vida/reintento del torneo al perder; propuesta inicial: reiniciar torneo.
- Recompensas económicas por victoria; NO establecidas.
