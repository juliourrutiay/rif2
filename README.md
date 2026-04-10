# Rifa Verde Root

Versión preparada para que en GitHub tengas los archivos web en la raíz del repositorio.

## Archivos web en root
- `index.html`
- `styles.css`
- `app.js`
- `admin.html`
- `admin.js`

## Backend en el mismo root del repo
- `server.js`
- `package.json`
- `.env.example`
- `supabase-schema.sql`

## Qué trae esta versión
- sección de premios con imágenes y texto
- selección múltiple de números
- recuadro para escribir números manualmente
- checkout con nombre, celular, mail y RUT opcional
- pago total en una sola operación
- panel admin simple
- exportación CSV
- asignación manual desde endpoint backend

## Qué cambiar antes de publicar
### Frontend
En `app.js` y `admin.js` cambia:
```js
const API_BASE = 'https://TU-BACKEND.onrender.com';
```
por la URL real de tu backend.

### Premios
En `index.html` cambia las imágenes y textos del bloque `#premios`.

## GitHub Pages
Como los archivos web están en root, GitHub Pages puede publicar directamente desde la raíz del repositorio.

## Backend
El backend no corre en GitHub Pages. Debes desplegar `server.js` en Render o Railway.

## Supabase
Ejecuta `supabase-schema.sql` y luego levanta el backend.
