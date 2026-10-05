# Semantropic Trivia — arquitectura 0.6.0

## Decisión técnica
Se mantiene **HTML + CSS + JavaScript + Node.js + PostgreSQL**. Para un juego de trivia con menús, perfiles, tienda, ranking, preguntas y multijugador, el DOM es más apropiado que migrar toda la aplicación a Canvas. No se añadió React, Phaser ni un bundler pesado porque implicaría reescribir una parte grande del juego sin una mejora proporcional para este tipo de gameplay.

## Frontend modular
- `index.html`: estructura de pantallas y componentes.
- `assets/css/01-base.css`: tema, layout y componentes base.
- `assets/css/02-avatar.css`: renderer CSS del avatar.
- `assets/css/03-systems.css`: perfiles, online, campaña, economía y sistemas heredados.
- `assets/css/04-identity.css`: identidad 0.5+, editor unificado y Avatar Core 0.5.1.2.
- `assets/css/05-effects.css`: capa del motor de efectos.
- `assets/js/00-fx-engine.js`: partículas y anillos con Web Animations API.
- `assets/js/01-core.js`: datos y lógica central.
- `assets/js/02-question-engine.js`: memoria procedural y antirrepetición.
- `assets/js/03-profile-cloud.js`: cuenta, perfil persistente y administración.
- `assets/js/04-multiplayer.js`: multijugador y flujo principal de interfaz.
- `assets/js/05-world-tour.js`: World Tour.
- `assets/js/06-economy-bootstrap.js`: economía, colecciones y arranque final.

Los archivos JavaScript se cargan como scripts clásicos y en el mismo orden lógico del monolito original. Esto permite separar el código sin introducir una migración riesgosa de módulos en una sola versión.

## FX Engine
Los efectos de respuestas ahora tienen un motor aislado basado en Web Animations API. No usa dependencias externas, no necesita compilación y respeta `prefers-reduced-motion` además del ajuste de animaciones del propio juego.

## Deploy
No hay pasos de build. Render sigue ejecutando `npm start`. El servidor puede servir carpetas anidadas como `assets/`. Los assets llevan `?v=0.6.0` y JS/CSS/JSON usan `no-cache` durante Alpha para evitar mezclar archivos de versiones diferentes.
