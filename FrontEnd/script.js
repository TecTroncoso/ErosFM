document.addEventListener("DOMContentLoaded", () => {
    // Referencias al DOM
    const playBtn = document.getElementById("play-btn");
    const playIcon = document.getElementById("play-icon");
    const audioPlayer = document.getElementById("audio-player");
    const artwork = document.getElementById("artwork");
    const volumeSlider = document.getElementById("volume-slider");
    const trackTitle = document.getElementById("track-title");
    const artistName = document.getElementById("artist-name");
    
    let isPlaying = false;
    let metadataInterval = null;

    // Lógica para reproducir y pausar
    playBtn.addEventListener("click", () => {
        if (isPlaying) {
            pauseRadio();
        } else {
            playRadio();
        }
    });

    function playRadio() {
        audioPlayer.play();
        isPlaying = true;
        // Cambiar ícono a pausa
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
        // Añadir animación de giro al disco/portada
        artwork.classList.add("spin");
        // Iniciar polling de metadata
        fetchNowPlaying();
        metadataInterval = setInterval(fetchNowPlaying, 5000);
    }

    function pauseRadio() {
        audioPlayer.pause();
        isPlaying = false;
        // Cambiar ícono a play
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
        // Detener animación de giro
        artwork.classList.remove("spin");
        // Detener polling de metadata
        if (metadataInterval) {
            clearInterval(metadataInterval);
            metadataInterval = null;
        }
    }

    // Control del Volumen de la radio
    volumeSlider.addEventListener("input", (e) => {
        const volume = e.target.value / 100;
        audioPlayer.volume = volume;
    });

    // En radio en vivo, los botones prev/next no aplican (el backend decide la canción).
    // Dejamos los listeners para que no rompan nada, pero no hacen nada.
    document.getElementById("next-btn").addEventListener("click", () => {});
    document.getElementById("prev-btn").addEventListener("click", () => {});

    // Consultar al backend qué canción suena ahora
    async function fetchNowPlaying() {
        try {
            const res = await fetch('/now-playing');
            if (!res.ok) return;
            const data = await res.json();
            updateTrackInfo(data.title, data.artist);
        } catch {
            // Silenciar errores de red para no molestar al usuario
        }
    }

    // Función para actualizar los textos con una transición suave (efecto fundido)
    let lastTitle = '';
    function updateTrackInfo(title, artist) {
        // Solo animar si cambió la canción
        if (title === lastTitle) return;
        lastTitle = title;

        trackTitle.style.opacity = 0;
        artistName.style.opacity = 0;
        
        setTimeout(() => {
            trackTitle.textContent = title;
            artistName.textContent = artist;
            
            trackTitle.style.opacity = 1;
            artistName.style.opacity = 1;
        }, 300); // 300ms debe coincidir con la transición de CSS
    }
    
    // Aplicamos estilos de transición en JS para la animación de texto
    trackTitle.style.transition = "opacity 0.3s ease";
    artistName.style.transition = "opacity 0.3s ease";
    
    // Configurar el volumen inicial
    audioPlayer.volume = volumeSlider.value / 100;

    // Autoplay: intentar reproducir automáticamente al cargar la página
    // Los navegadores bloquean autoplay con sonido, así que si falla,
    // arrancamos muteado y demuteamos en la primera interacción del usuario.
    audioPlayer.play()
        .then(() => {
            // El navegador permitió autoplay con sonido
            isPlaying = true;
            playIcon.classList.remove("fa-play");
            playIcon.classList.add("fa-pause");
            artwork.classList.add("spin");
            fetchNowPlaying();
            metadataInterval = setInterval(fetchNowPlaying, 5000);
        })
        .catch(() => {
            // Bloqueado por el navegador — arrancamos muteado
            audioPlayer.muted = true;
            audioPlayer.play().then(() => {
                isPlaying = true;
                playIcon.classList.remove("fa-play");
                playIcon.classList.add("fa-pause");
                artwork.classList.add("spin");
                fetchNowPlaying();
                metadataInterval = setInterval(fetchNowPlaying, 5000);
            }).catch(() => {});

            // Demutar en la primera interacción del usuario
            function unmute() {
                audioPlayer.muted = false;
                audioPlayer.volume = volumeSlider.value / 100;
                document.removeEventListener("click", unmute);
                document.removeEventListener("keydown", unmute);
            }
            document.addEventListener("click", unmute, { once: true });
            document.addEventListener("keydown", unmute, { once: true });
        });
});