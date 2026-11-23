# Textos de origen para la paridad (23/11/2026)

Copias literales de los textos fijos del motor antiguo que PRINCIPAL tiene que portar tal cual. Se generaron con un guion a partir de los archivos del Mac del dueño (solo lectura): las cadenas salen del código con `ast`, no se teclearon. La única excepción es el prompt «TEXT REMOVAL ONLY» de `video-genjutsu-plantillas.md` §5, copiado del volcado del pedido 46. No hay secretos ni rutas de credenciales.

| Archivo | Qué contiene | Origen |
|---|---|---|
| `imagen-parrafos-fijos.md` | Los párrafos fijos del prompt de imagen: frase de público, política de luz, párrafo de realismo, perfiles de las fotos de realismo y la plantilla de identidad / producto / cierre de los pedidos 54 y 81 | `EDITOR/frame_realism.py`, `EDITOR/order6852_frame_preparation.py`, `ORD81/prepare-openings.py` |
| `imagen-puerta-reglas.md` | Modelo y parámetros de imagen, lista negra de palabras, expresiones de «sin texto encima» y «producto oculto», mensajes de las comprobaciones | `EDITOR/frame.py`, `EDITOR/frame_model.py` |
| `video-genjutsu-plantillas.md` | Compilador estándar de Genjutsu, plantilla real de Motion Transfer y Object Swap de los pedidos 81 y 54, y la pasada de eliminación de textos | `EDITOR/genjutsu.py`, `ORD81/production_common.py`, `EDITOR/order6852_motion.py`, `EDITOR/order6852_object.py` |
| `video-wan-plantilla.md` | Prompt corto de Wan 3.0 / Prime, frase de audio, parámetros y argumentos | `EDITOR/video_edit_policy.py`, `video_audio_policy.py`, `genjutsu.py`, `genjutsu_cli.py` |
| `video-seedance-y-ganchos.md` | Los nueve ganchos validados con su prompt íntegro, duraciones, frases por idioma, comando de Seedance, política de resolución | `EDITOR/hook_library.py`, `hook_durations.json`, `lanzar.py`, `calidad_seedance.py`, `hook_scene_defaults.py`, `BIBLIOTECA_PROMPTS.md` |
| `encargo-instrucciones-al-agente.md` | El texto fijo que acompañaba a cada lote enviado: cabecera, edición posterior, calidad, idioma del audio, música automática, y el plan de edición que se congela | `EDITOR/lote_app.py`, `video_edit_policy.py`, `video_resolution.py`, `video_audio_policy.py`, `music_auto_policy.py` |
| `musica-reglas.md` | `reference_music_match.py` íntegro, plan de música automática, contrato de mezcla R2, drop | paquete vivo de SEGATOM y `EDITOR/` |
| `textos-06b-reglas.md` | Estilo 06B, CTA por cuenta, textos reales de los 18 vídeos del pedido 81, guion de render, descripciones | `EDITOR/` y `ORD81/` |
| `upscale-y-entrega.md` | Perfil de Topaz y guion de empaquetado de la entrega | `EDITOR/upscale.py`, `ORD81/package-edits.py` |

`ORD81` = `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/`. `EDITOR/` = `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/`.

## Lo que ya estaba copiado y no se repite aquí

Las reglas en prosa que gobernaban al agente están, literales, en `docs/reglas-origen/` (442 archivos, 22/11/2026). Las que más pesan en el resultado:

| Tema | Archivo en `docs/reglas-origen/` |
|---|---|
| Reglas generales del agente | `raiz/AGENTS.md`, `raiz/LOGICA_SISTEMA_NANO_BANANA.md`, `raiz/PROMPT_MAESTRO_NANO_BANANA.md` |
| Prompt de imagen | `skills-codex/nanobanana-pro-imagenes/SKILL.md` y `references/` (ejemplos del dueño, realismo) |
| Fondos de Pinterest | `skills-codex/fondos-pinterest-por-toma/SKILL.md`, `references/criterios-seleccion-manual.md`, `memory-context/pinterest-*.md`, `memory-context/fondos-organicos-tiendas-reales-20261105.md`, `memory-context/tiendas-alemania-pinterest-logo-20261109.md` |
| Genjutsu | `skills-codex/higgsfield-genjutsu/SKILL.md`, `references/prompts.md`, `references/object-swap-producto.md`, `reglas-edicion-t7/GENJUTSU_*.md`, `reglas-edicion-t7/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md`, `memory-context/object-swap-textos-fondos-20261117.md` |
| Wan | `memory-context/wan-prime-cambios-minimos.md`, `wan-prime-solo-video.md`, `edicion-opcional-y-wan-simple.md` |
| Seedance | `reglas-edicion-t7/SEEDANCE_ESCALA_MANO_20261105.md`, `cerebro/reglas/seedance-largo-referencia-contextual.md` |
| Edición, música y textos | `reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.md`, `TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md`, `CORRECCION_FUNCION_DROP_GANCHOS_20261115.md`, `memory-context/texto-edicion-default-06b.md`, `ritmo-musica-voz-edicion.md`, `cuentas-cuerpos-emojis-20261114.md` |
| Variantes y embalajes | `memory-context/variantes-embalajes-y-cierre-lotes-20261116.md`, `eiswerk-variante-*.md` |
| Avatares e identidad | `memory-context/identidad-avatar-realismo-20261114.md`, `referencias-identidad-y-lotes-mixtos-20261029.md`, `replicas-vestuario-diferente-20261031.md` |
| Upscale y entrega | `memory-context/upscale-theia-1080p.md`, `videos-editados-por-fecha-20261029.md`, `entrega-agrupada-frames.md` |
| Aprendizajes del último lote entregado | `memory-context/aprendizajes-lote81-20261120.md` |

## Lo que queda en el Mac sin copiar

- `BIBLIOTECA_PROMPTS.md` entero (754 KB): aquí solo los nueve ganchos validados.
- Los documentos `EDITOR/*.md` del motor (`PRODUCTION_ENGINE.md`, `GENJUTSU_ENGINE.md`, `CONTRATO_GENJUTSU_REFS.md`, `COUNTDOWN_CAPTURA_USUARIO.md`, `COUNTDOWN_REVEAL_HOLD.md`, `FRAME_COMPOSITION_TRANSPORT.md`, `VERIFICACION_POR_CAPAS.md`, `LIBRARY_PROMPT_REUSE.md`, `GENJUTSU_RETRY_ENGINE.md`, `GENJUTSU_CAST.md`): leídos para el mapa, no copiados porque describen puertas y recibos, no textos que se envían.
- `EDITOR/order43_text06b.swift` (el dibujante de rótulos): PRINCIPAL ya tiene su versión en `montador/texto06b.swift`.
