# Eros FM Backend & Frontend

Radio online sensual 24/7. Este proyecto aloja un backend en Node.js que genera un streaming continuo usando **FFmpeg**, sirviendo audios obtenidos dinámicamente desde un dataset privado en **Hugging Face**. Además, incluye el frontend que consume el stream y muestra la información de la pista en tiempo real.

## Características

- 📻 **Streaming Continuo (Icecast-like)**: Transmisión ininterrumpida de MP3/Opus a través del endpoint `/stream`.
- 🔄 **AutoDJ con Hugging Face**: Obtiene las pistas dinámicamente de un dataset y hace autoplay 24/7 sin bloqueos (anti 302 y 401).
- 🎵 **Metadata en tiempo real**: Endpoint `/now-playing` para leer el Título y Artista actual (parseado desde el nombre del archivo).
- 🎨 **Frontend Integrado**: Interfaz elegante, dark mode, autoplay nativo fallback (con desmuteo al primer clic), y animaciones fluidas.
- 🛡️ **Estabilidad**: Graceful shutdown robusto para matar procesos huérfanos de FFmpeg.

## Requisitos Previos

- [Node.js](https://nodejs.org/) v18+
- [FFmpeg](https://ffmpeg.org/) instalado y accesible globalmente (o configurar ruta en `.env`).

## Configuración Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno copiando el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
   Rellenar las variables en `.env`:
   ```env
   PORT=3000
   HF_USER=tu_usuario_hf
   HF_DATASET=tu_dataset_hf
   HF_TOKEN=hf_XXXXXXXXXXXXXXXXXXXXXXXX
   ```

3. Iniciar el servidor (modo desarrollo):
   ```bash
   npm run dev
   ```

4. Abrir en el navegador: `http://localhost:3000`

## Despliegue en Render

Para desplegar este proyecto en [Render](https://render.com), debes crear un **Web Service**.

1. Conecta tu repositorio de GitHub a Render.
2. Crea un nuevo **Web Service**.
3. Configuración básica:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`

### Importante: FFmpeg en Render
Render no incluye FFmpeg por defecto en los contenedores nativos de Node. Para que funcione el streaming, tenés dos opciones:

**Opción A (Recomendada): Usar Docker**
1. Cambiá el "Environment" en Render a **Docker**.
2. Render automáticamente leerá el `Dockerfile` de tu repositorio, instalará Node + FFmpeg e iniciará el servicio.

**Opción B: Usar apt-get con bash (Render Render.yaml)**
Si prefieres no usar Docker, puedes intentar añadir un build script que instale FFmpeg en el entorno.

### Variables de Entorno en Render
No olvides ir a la pestaña **Environment** en tu Dashboard de Render y agregar las variables secretas de Hugging Face (`HF_USER`, `HF_DATASET`, `HF_TOKEN`). No incluyas `PORT`, Render lo asigna automáticamente.

## Arquitectura del Streaming

- **Paso 1**: Se lista el dataset privado de Hugging Face vía API, generando una playlist.
- **Paso 2**: `server.js` toma la primera canción, limpia los headers de auth para evitar errores de S3 (`401 Unauthorized`), y le pasa la URL real a `FFmpeg`.
- **Paso 3**: `FFmpeg` procesa el audio ignorando video (`-vn`) y transcodifica al vuelo a MP3 a 192kbps.
- **Paso 4**: El stream resultante es emitido a todos los clientes HTTP conectados al endpoint `/stream`.

## Tecnologías

- Node.js + Express
- fluent-ffmpeg
- Frontend: HTML5, Vanilla CSS, Vanilla JS.
