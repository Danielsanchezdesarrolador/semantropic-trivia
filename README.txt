SEMANTROPIC TRIVIA — ALPHA 0.2.6

NOVEDADES
- Ranking persistente con PostgreSQL.
- Perfiles online persistentes.
- Victorias y derrotas.
- Rating conservado aunque el Web Service de Render se reinicie.
- Recursos online: monedas, diamantes y llaves.
- Cooldown de ruleta sincronizable con el perfil online.
- Panel del propietario protegido por ADMIN_KEY del servidor.
- Administración de recursos, rating, estadísticas y ruletas.
- Sesión de administrador temporal; la clave no está incluida en el código del navegador.
- Si DATABASE_URL no está configurada, el servidor mantiene un modo fallback no persistente para no impedir el arranque.

VERIFICACIÓN
Visita /api/status. Para persistencia real debe decir storage: postgres.


HOTFIX DE SALAS (Alpha 0.2.6)
- El anfitrión puede expulsar jugadores del lobby.
- El anfitrión puede cerrar su sala.
- El propietario puede ver todas las salas activas desde ADMIN.
- El propietario puede expulsar jugadores de cualquier sala.
- El propietario puede cerrar cualquier sala.
- Salas terminadas se eliminan automáticamente tras 5 minutos.
- Lobbies sin nadie conectado se eliminan automáticamente tras 10 minutos.
- Salas no activas expiran como máximo después de 1 hora.
