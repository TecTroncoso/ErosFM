const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Lista para guardar a los oyentes conectados
const clients = new Set();

// Configuración de Hugging Face desde variables de entorno
const HF_USER = process.env.HF_USER;
const HF_DATASET = process.env.HF_DATASET;
const HF_TOKEN = process.env.HF_TOKEN;

// Opcional: configurar ruta de FFmpeg local si está definida
if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
    console.log(`🔧 Ruta de FFmpeg local configurada: ${process.env.FFMPEG_PATH}`);
}

// Cargar playlist local como respaldo inicial (caché)
let playlist = [];
let currentSha = null;
let currentTrack = { title: 'Nocturna FM', artist: 'Conectando...' };
let currentFfmpeg = null; // Referencia al proceso FFmpeg activo
const playlistPath = path.join(__dirname, 'playlist.json');

try {
    playlist = require('./playlist.json');
    console.log(`📂 Playlist de respaldo cargada (${playlist.length} canciones).`);
} catch (error) {
    console.log("ℹ️ No se encontró 'playlist.json' local de respaldo. Se generará dinámicamente al sincronizar.");
}

// Validar credenciales al iniciar
if (!HF_USER || !HF_DATASET || !HF_TOKEN) {
    console.warn("⚠️  CONFIGURACIÓN INCOMPLETA: Faltan configurar las variables de entorno de Hugging Face.");
    console.warn("Crea un archivo .env en la raíz del proyecto basándote en .env.example");
}

// FUNCIÓN PARA SINCRONIZAR LA PLAYLIST CON HUGGING FACE DINÁMICAMENTE
async function syncPlaylist() {
    if (!HF_USER || !HF_DATASET || !HF_TOKEN) {
        return;
    }

    try {
        const url = `https://huggingface.co/api/datasets/${HF_USER}/${HF_DATASET}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${HF_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`Hugging Face API respondió con estado ${response.status}`);
        }

        const data = await response.json();
        
        // Evitar reescribir e importar si el repositorio no ha tenido modificaciones (mismo SHA)
        if (currentSha && data.sha === currentSha) {
            return;
        }

        const siblings = data.siblings || [];
        
        // Filtrar archivos de Audio_Sources que tengan formatos de audio comunes
        const newPlaylist = siblings
            .map(s => s.rfilename)
            .filter(name => name.startsWith('Audio_Sources/') && /\.(opus|mp3|wav|m4a|flac)$/i.test(name));

        if (newPlaylist.length === 0) {
            console.warn("⚠️ Sincronización: No se encontraron canciones válidas en 'Audio_Sources/'.");
            return;
        }

        // Actualizar datos
        playlist = newPlaylist;
        currentSha = data.sha;
        
        // Guardar copia local en playlist.json para caché/respaldo en caso de caídas de red
        await fs.writeFile(playlistPath, JSON.stringify(playlist, null, 2), 'utf-8');
        console.log(`🔄 Playlist actualizada dinámicamente desde Hugging Face. Total: ${playlist.length} canciones. (Repo SHA: ${currentSha.substring(0, 7)})`);
        
    } catch (error) {
        console.error("❌ Error al sincronizar playlist desde Hugging Face:", error.message);
    }
}

// 1. RUTA DE TRANSMISIÓN (STREAMING PARA OYENTES)
app.get('/stream', (req, res) => {
    // Cabeceras HTTP estándar para streaming continuo de audio MP3 (tipo Icecast)
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Fundamental para Render: evitar que el proxy (Nginx) retenga los primeros segundos del audio
    res.setHeader('X-Accel-Buffering', 'no');

    // Registrar al nuevo oyente
    clients.add(res);
    console.log(`🎧 Nuevo oyente conectado. Total de oyentes en vivo: ${clients.size}`);

    // Eliminar al oyente cuando cierra la conexión
    req.on('close', () => {
        clients.delete(res);
        console.log(`👋 Oyente desconectado. Total de oyentes: ${clients.size}`);
    });
});

// 2. MOTOR DEL AUTODJ (LEE Y DECODIFICA DESDE HUGGING FACE PRIVADO)
async function playAutoDJ() {
    if (playlist.length === 0) {
        console.log("⚠️ La lista de reproducción (playlist.json) está vacía o aún no se ha sincronizado.");
        // Intentar arrancar en 5 segundos si estaba vacía
        setTimeout(playAutoDJ, 5000);
        return;
    }

    // Elegir una canción al azar de la playlist sincronizada
    const songKey = playlist[Math.floor(Math.random() * playlist.length)];
    
    // NO codificamos con encodeURIComponent porque rompe la API de Hugging Face con caracteres Unicode
    const songUrl = `https://huggingface.co/datasets/${HF_USER}/${HF_DATASET}/resolve/main/${songKey}`;
    
    // Extraer título y artista del nombre del archivo
    // Formato esperado: "Carpeta/Subcarpeta/TITULO - ARTISTA.opus"
    const fileName = path.basename(songKey, path.extname(songKey));
    const parts = fileName.split(' - ');
    currentTrack = {
        title: parts[0] || fileName,
        artist: parts.length > 1 ? parts[parts.length - 1] : 'Nocturna FM'
    };

    console.log(`🎵 AutoDJ Reproduciendo: ${currentTrack.title} — ${currentTrack.artist}`);

    try {
        // Interceptamos la redirección 302 manualmente para que FFmpeg no envíe el header de Auth a Amazon S3
        const headers = {};
        if (HF_TOKEN && HF_TOKEN.trim() !== "") {
            headers['Authorization'] = `Bearer ${HF_TOKEN}`;
        }

        const res = await fetch(songUrl, {
            headers: headers,
            redirect: 'manual' // NO seguir la redirección automáticamente
        });

        let finalUrl = songUrl;
        const inputOptions = []; // Quitamos -re para ver si causa el hang con HTTP remoto

        if (res.status === 302 || res.status === 301) {
            // Es un archivo pesado (LFS) alojado en un CDN externo (S3) pre-firmado
            finalUrl = res.headers.get('location');
            // NO pasamos headers de Authorization a la URL del CDN porque rompería la firma de AWS S3
        } else if (res.status === 200) {
            // Si el archivo no redirige, usamos la original y pasamos el token a FFmpeg
            if (HF_TOKEN && HF_TOKEN.trim() !== "") {
                inputOptions.push('-headers', `Authorization: Bearer ${HF_TOKEN}\r\n`);
            }
        } else {
            throw new Error(`Hugging Face respondió con código HTTP ${res.status}`);
        }

        // Crear y ejecutar comando FFmpeg usando spawn nativo (como en el test validado)
        const { spawn } = require('child_process');
        const ffmpegArgs = [
            '-re', // Vuelve a agregar -re para que sea streaming en tiempo real
            '-i', finalUrl,
            '-vn', // Ignorar el cover art (imagen) porque causa que -re se congele intentando sincronizar los timestamps del video
            '-loglevel', 'error', // Ocultar banner y progreso para mantener la terminal limpia
            '-c:a', 'libmp3lame', // Transcodificar a MP3 (único formato que soporta unirse al stream en cualquier momento sin perder cabeceras)
            '-b:a', '128k',       // Bitrate aceptable
            '-ac', '2',
            '-ar', '44100',
            '-f', 'mp3',          // Contenedor MP3 (headerless)
            'pipe:1'
        ];

        // Añadir el token original si no es CDN
        if (finalUrl === songUrl && HF_TOKEN && HF_TOKEN.trim() !== "") {
            ffmpegArgs.unshift('-headers', `Authorization: Bearer ${HF_TOKEN}\r\n`);
        }
        
        currentFfmpeg = spawn('ffmpeg', ffmpegArgs);
        const ffmpeg = currentFfmpeg;

        ffmpeg.stderr.on('data', (data) => {
            // Solo imprimirá errores reales gracias a -loglevel error
            console.error(`[FFmpeg Error] ${data.toString().trim()}`);
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0 && code !== 255) {
                console.log(`❌ FFmpeg exited with code ${code}.`);
            }
            console.log('⏭️ Canción terminada. AutoDJ pasa al siguiente tema...');
            playAutoDJ(); // Bucle infinito
        });

        ffmpeg.on('error', (err) => {
            console.error(`❌ Error al spawnear FFmpeg:`, err.message);
            setTimeout(playAutoDJ, 3000); 
        });

        // Pipear el audio (stdout de ffmpeg) hacia todos los oyentes
        let firstChunkSent = false;
        ffmpeg.stdout.on('data', (chunk) => {
            if (!firstChunkSent) {
                console.log(`📻 FFmpeg empezó a emitir bytes (Chunk size: ${chunk.length})`);
                firstChunkSent = true;
            }
            clients.forEach(client => {
                if (client.writable) {
                    client.write(chunk);
                } else {
                    clients.delete(client);
                }
            });
        });

    } catch (error) {
        console.error(`❌ Error de red al resolver la URL de "${songKey}":`, error.message);
        setTimeout(playAutoDJ, 3000);
    }
}

// 3. SERVIR FRONTEND ESTÁTICO Y API DE METADATA
app.use(express.static(path.join(__dirname, 'FrontEnd')));

// Endpoint para que el frontend consulte qué canción suena actualmente
app.get('/now-playing', (req, res) => {
    res.json(currentTrack);
});

// 4. INICIAR EL SERVIDOR
const server = app.listen(port, async () => {
    console.log(`🚀 Servidor de radio encendido en http://localhost:${port}`);
    
    if (HF_USER && HF_DATASET && HF_TOKEN) {
        // Primera sincronización con la API de Hugging Face al iniciar
        await syncPlaylist();
        
        // Sincronizar periódicamente cada 5 minutos para buscar nuevos archivos
        setInterval(syncPlaylist, 5 * 60 * 1000);
        
        // Arrancar el motor de música
        playAutoDJ();
    } else {
        console.log("⏸️  AutoDJ en pausa. Configurá las variables de entorno para iniciar la transmisión.");
    }
});

// 5. GRACEFUL SHUTDOWN — Matar FFmpeg y liberar el puerto al reiniciar con nodemon
// En Windows, SIGTERM no funciona. Usamos 'exit' (siempre se dispara) + SIGINT (nodemon con signal: SIGINT).
function killFfmpeg() {
    if (currentFfmpeg) {
        try { currentFfmpeg.kill('SIGKILL'); } catch {}
        currentFfmpeg = null;
    }
}

process.on('exit', killFfmpeg); // Siempre se ejecuta en Windows

process.on('SIGINT', () => {
    killFfmpeg();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
});

// nodemon envía SIGUSR2 antes de reiniciar
process.once('SIGUSR2', () => {
    killFfmpeg();
    process.kill(process.pid, 'SIGUSR2');
});