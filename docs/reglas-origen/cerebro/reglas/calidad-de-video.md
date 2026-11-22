# Calidad de vídeo — el misterio del 720p, resuelto

**Configuración vigente (2026-09-07): Seedance 2.5 a 480p**, por orden de Emmanuel. Se conserva bitrate high, 9:16 y modo omni_reference. El siguiente diagnóstico es histórico y no impone 720p al modelo 2.5. Kling sigue a 1080p y Seedance 2.0 a 720p.

**Síntoma:** la web de Higgsfield daba mejor calidad que la API «con los mismos parámetros».
**Causa (2026-09-01, medida con ffprobe):** no eran los mismos parámetros. La web envía
`bitrate_mode=high` → **8,1 Mbps**; la API por defecto usa `standard` → **5,1 Mbps**, ambos a 720×1280.
Un 60% menos de datos por segundo = la textura lavada que se veía.

**Regla:** todo Seedance sale con `bitrate_mode=high`. La resolución NO se sube jamás para
«mejorar» ([[sistema/una-sola-puerta-para-video]] lo aplica automáticamente).

**Método que lo encontró:** comparar los `params` de TODAS las generaciones del historial y
buscar el campo que varía — sin generar nada. Vale para el próximo misterio de calidad.

Aplicada por: EDITOR/lanzar.py (añade --bitrate_mode high a todo seedance).
