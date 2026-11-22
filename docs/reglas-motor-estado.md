# Reglas del motor: qué está aplicado y qué falta (23/11/2026)

Contra `docs/reglas-motor-del-dueno.md`.

| § | Regla | Estado en PRINCIPAL |
|---|---|---|
| 2 | Referencia de generación ≠ referencia de edición; vacía hereda | Hecho (por vídeo y por grupo del lote) |
| 2 | Dudas juntas, presupuesto una vez, ronda completa de imágenes, luego clips y montaje sin más rondas | Hecho (lote automático) |
| 3 | Variante de destino por ID de catálogo, artículo y embalaje de esa variante, orden de adjuntos = números del prompt | Hecho (manifiesto). Regla de prompt «original → destino» añadida el 22/11 |
| 3 | Bloquear la tarjeta si falta el archivo de la variante | Parcial: sin foto de artículo no se desglosa; falta comprobar el embalaje cuando la toma lo enseña |
| 4 | Varias referencias por tarjeta con papel (fondo, composición, realismo…) | Falta (hoy: una foto de entorno) |
| 4 | Fondos de Pinterest por toma | Falta |
| 5 | Fotograma original como ancla, qué cambia / qué se conserva, estética de iPhone 17 Pro Max | Hecho el 22/11 (`reglas/imagen-nano-banana.md`, `analysis.ts`) |
| 5 | Revisar cada resultado antes de presentarlo (variante, caja, avatar, fondo, acción) | Falta (revisión automática con visión) |
| 5 | Un frame por clip (aperturas de cada toma) | Falta (hoy: una imagen por vídeo) |
| 6 | Elegir modelo en la tarjeta: Genjutsu Motion Transfer, Object Swap, Wan 3.0 Prime, Seedance, automático | Falta (hoy: solo Seedance 2.5) |
| 7 | Canción de biblioteca con drop; «Audio original» = audio de la referencia | Hecho |
| 7 | Elegir canción sola comparando el audio de la referencia con la biblioteca | Falta |
| 7 | Textos solo en montaje, alemán, CTA | Hecho (montador v1) |
| 7 | Topaz 1080p para 480p; descripciones por cuenta e idioma | Falta |
| 8 | Envío único, reconciliación por ID, inciertos sin reenviar | Hecho (núcleo de gasto) |
| 8 | Cola con concurrencia por etapa, reutilizar subidas por hash | Hecho (pg-boss, `ensureMedia`) |
| 8 | Métricas: tiempo a frames, créditos por vídeo, tasa de regeneración | Falta |

Orden de trabajo: 1) modelos en la tarjeta (Genjutsu / Wan) con un frame por toma; 2) revisión automática de frames; 3) referencias múltiples y Pinterest; 4) upscale y descripciones; 5) métricas.
