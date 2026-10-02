SEMANTROPIC TRIVIA — ALPHA 0.2.7

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


HOTFIX DE PERFIL ONLINE (Alpha 0.2.6)
- Corrige el error "Perfil online no verificado" al migrar desde versiones anteriores.
- Recupera automáticamente perfiles creados por el bug inicial de 0.2.6.
- No borra monedas, diamantes, ranking ni estadísticas.
- Crear/entrar a salas verifica primero que el perfil online esté listo.


HOTFIX DE CREDENCIALES ONLINE (Alpha 0.2.6)
- Corrige perfiles con 0 partidas que quedaron pendientes de verificación por la migración.
- Ya no depende del número interno de revisión del perfil.
- El Panel del Propietario incluye "REPARAR ACCESO".
- Reparar acceso NO borra monedas, diamantes, llaves, rating ni estadísticas.
- Después de usar REPARAR ACCESO, el jugador solo debe recargar la página.


SOCIAL / PROFILES / ACHIEVEMENTS PATCH — ALPHA 0.2.7
- Sistema de logros ampliado con categorías y progreso.
- Logros online persistentes: partidas, victorias, rating, modos y 2v2.
- Avatar inicial masculino o femenino.
- Perfil online personalizable: nombre, avatar, bio, marco y logro exhibido.
- Los perfiles de otros jugadores se pueden abrir desde lobby, marcador, resultados y ranking.
- El logro exhibido aparece bajo el avatar/perfil para presumirlo.
- Nuevo modo online Equipos 2 vs 2 para exactamente 4 jugadores.
- Equipos A/B editables antes de comenzar.
- Nuevos marcos desbloqueables por logros online.
- Migración automática de columnas nuevas en PostgreSQL: no hay que recrear la base.

VALIDACIÓN DEL PARCHE SOCIAL
- JavaScript del juego validado con node --check.
- server.js validado con node --check.
- Probado localmente: creación y personalización de perfiles, perfil público, sala 2v2, 4 jugadores, cambio de equipos, inicio de partida y partida completa 12/12.
- Verificado: victorias/derrotas 2v2 y logros online se actualizan al terminar la partida.
- La bio del perfil es pública: la interfaz recomienda no incluir datos personales.


ALPHA 0.2.7
- Cuenta Semantropic con usuario/contraseña y login multidispositivo.
- Tienda depurada de nombres duplicados.
- Ruleta configurable en vivo desde ADMIN.
- Migración automática de PostgreSQL; no crear una base nueva.


PASSWORD RECOVERY HOTFIX — 0.2.7
- Admin puede generar/fijar contraseñas temporales.
- Admin puede cerrar todas las sesiones de una cuenta.
- Los jugadores pueden cambiar su propia contraseña.
- Una contraseña temporal obliga a crear una contraseña nueva antes de jugar online.
- Las contraseñas originales nunca son visibles.


ALPHA 0.2.7 — UNIFIED LOGIN HOTFIX
- Login obligatorio al abrir Semantropic.
- Cuenta y perfil unificados.
- Registro nuevo crea automáticamente el perfil.
- Multijugador ya no crea cuentas ni usa un nombre separado.
- Recuperación por solicitud al administrador + contraseña temporal.
- ADMIN muestra solicitudes de recuperación.
