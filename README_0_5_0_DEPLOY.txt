SEMANTROPIC TRIVIA — ALPHA 0.5.0 FINAL

CÓMO ACTUALIZAR
1. Descarga y descomprime el ZIP.
2. Reemplaza los archivos de tu repositorio de Semantropic Trivia por los de esta versión.
3. Haz Commit en GitHub.
4. Render hará el deploy automático del mismo Web Service.
5. Cuando termine, abre el juego y usa Ctrl + F5 / recarga sin caché.

NO CREAR UNA BASE NUEVA
- Mantén el mismo DATABASE_URL.
- Mantén el mismo ADMIN_KEY.
- No necesitas variables nuevas.
- Las migraciones/perfiles siguen utilizando profile_meta JSONB; identity se guarda dentro de ese objeto.

PRUEBAS RECOMENDADAS DESPUÉS DEL DEPLOY
- Inicia sesión con tu cuenta habitual.
- Abre Avatar > Expresión, Perfil y Catálogo.
- Equipa 6 emotes y 3 sprays.
- Prueba una partida General para ver las reacciones del personaje.
- Abre una sala online con dos cuentas y usa emotes/sprays.
- Abre un perfil público para revisar fondo, loadout y emotes.
- Usa ADMIN > Desbloquear todo en una cuenta de pruebas para revisar todo el catálogo.

NOTA
Los cosméticos antiguos se conservan para no romper progreso. La 0.5.0 añade el sistema modular encima de ellos y permite ir migrando visualmente el contenido antiguo en futuras versiones.
