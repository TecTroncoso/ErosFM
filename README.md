<div align="center">
  <h1>🎧 Eros FM</h1>
  <p><strong>Radio online sensual 24/7 impulsada por Node.js y Hugging Face</strong></p>
  
  [![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
  [![FFmpeg](https://img.shields.io/badge/FFmpeg-MP3_Transcoding-blue.svg)](https://ffmpeg.org/)
  [![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
</div>

<br>

Eros FM es un backend ligero y de alto rendimiento diseñado para transmitir audio continuo a múltiples oyentes. Su motor único extrae pistas directamente desde un dataset privado en **Hugging Face** y las transcodifica al vuelo a **MP3**, garantizando que los usuarios puedan conectarse en vivo en cualquier segundo de la transmisión. Ideal para hospedar en tiers gratuitos como Render.

---

## ✨ Características Principales

* **Transmisión Ininterrumpida (Icecast-like)**: Mantiene una única manguera de streaming (`/stream`) a la que los oyentes pueden conectarse y desconectarse en cualquier momento.
* **AutoDJ Inteligente**: Lee tu dataset privado, arma una playlist dinámicamente y empalma las canciones automáticamente.
* **Transcodificación MP3 en vivo**: Utiliza FFmpeg para convertir archivos pesados u Opus a MP3 (`-c:a libmp3lame`), el formato estándar y "headerless" que permite a los oyentes unirse al stream de audio a mitad de una canción sin errores.
* **Anti-Buffering Nginx**: Inyecta la cabecera `X-Accel-Buffering: no` para evitar que los proxies inversos (como los de Render) retengan los primeros segundos del audio, garantizando streaming instantáneo.
* **Sistema Anti-Bloqueos**: Maneja manualmente las redirecciones 302 y purga los headers de autorización para evitar errores `401 Unauthorized` al interactuar con el CDN (S3) de Hugging Face.
* **Frontend Nativo**: Incluye un cliente estático en `/FrontEnd` con *autoplay fallback* (arranca muteado si el navegador lo bloquea, desmutea al primer clic) e interfaz animada.
* **Metadata en Vivo**: Expone un endpoint `/now-playing` para que el frontend sincronice el Título y Artista en tiempo real.
* **Graceful Shutdown**: Prevención de procesos zombies (`EADDRINUSE`) terminando limpiamente los hilos de FFmpeg al reiniciar o apagar el servidor.

---

## 🚀 Despliegue Rápido en Render

Este proyecto está optimizado para el plan gratuito de [Render](https://render.com/). Como Render no incluye FFmpeg en su entorno nativo de Node.js, **debes usar el despliegue mediante Docker**.

1. Haz un fork o conecta este repositorio a tu cuenta de Render.
2. Crea un nuevo **Web Service**.
3. En **Environment**, asegúrate de seleccionar **`Docker`** (Render leerá automáticamente el `Dockerfile` incluido).
4. Configura las siguientes **Environment Variables** en Render:

| Variable | Descripción |
|----------|-------------|
| `HF_USER` | Tu usuario de Hugging Face |
| `HF_DATASET` | El nombre del repositorio/dataset donde están los `.opus` |
| `HF_TOKEN` | Un token de acceso (Access Token) de Hugging Face |

> **Nota:** No es necesario configurar la variable `PORT`. Render inyecta su propio puerto automáticamente.

### ⏰ Mantener el servidor despierto
El plan gratuito de Render "duerme" tu servidor tras 15 minutos sin visitas. Para evitar silencios o tiempos de carga largos para los oyentes, puedes usar servicios como [cron-job.org](https://cron-job.org/) o [UptimeRobot](https://uptimerobot.com/) apuntando a `https://tu-url.onrender.com/now-playing` cada 10 minutos. Ten en cuenta que esto consumirá tus 750 horas gratuitas mensuales.

---

## 💻 Desarrollo Local

### Requisitos
* [Node.js](https://nodejs.org/) (v18 o superior recomendado)
* [FFmpeg](https://ffmpeg.org/) instalado y agregado al PATH de tu sistema operativo.

### Instalación

1. Clona el repositorio e instala las dependencias:
   ```bash
   git clone https://github.com/TuUsuario/ErosFM.git
   cd ErosFMBackend
   npm install
   ```

2. Configura tu entorno:
   ```bash
   cp .env.example .env
   ```
   Rellena el `.env` con tus credenciales de Hugging Face.

3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Abre tu navegador en [http://localhost:3000](http://localhost:3000) para ver la radio en acción.

---

## 🏗️ Arquitectura del Motor de Audio

El corazón de Eros FM reside en cómo manipula los buffers de red:

1. **Resolución**: Contacta a Hugging Face para buscar la URL real del archivo `.opus`.
2. **Intercepción**: Lee los headers y detecta si es una redirección hacia un bucket de S3.
3. **Piping (Tubería)**: Utiliza la API nativa de `child_process.spawn` para iniciar FFmpeg, pasándole la URL cruda.
4. **Transcodificación Icecast-style**: FFmpeg procesa el audio a MP3 de forma ultra eficiente (1-2% CPU), permitiendo un flujo de bits (bitstream) robusto que no requiere cabeceras globales.
5. **Broadcasting Instantáneo**: Node.js captura el `stdout` de FFmpeg y hace `res.write(chunk)` hacia todos los clientes HTTP conectados, bypasseando los buffers del proxy.

---

<div align="center">
  <small>Hecho con ❤️ para noches largas.</small>
</div>
