# Música: referencia R2 aprobada por Emmanuel — 25/10/2026

Referencia aprobada: V7 Nailuna, lote63, versión R2. Identidad del MP4 y receta en aprobacion.json. Política estructurada en politica.json.

- Mantener exactamente la canción elegida. El drop guardado en Canciones es un ANCLA, no el comienzo de la pista.
- Alinear ese punto con el primer fotograma del cuerpo real, excluyendo el gancho antiguo. Recortar solo los extremos izquierdo y derecho al inicio y final del vídeo. La música suena desde el primer fotograma, continua, sin saltos ni reinicios.
- No separar, limpiar ruido ni atenuar automáticamente la canción seleccionada durante el gancho. Mantener nivel constante a lo largo de la pista; solo ajuste global constante para evitar saturación si hace falta.
- Separar únicamente el audio del clip original: retirar su música y conservar voz y ambiente en cuanto sea técnicamente posible. No afirmar que el ambiente está preservado sin comprobarlo.
- Esta orden posterior sustituye la reducción automática de música bajo la voz y la rampa automática posterior como COMPORTAMIENTO PREDETERMINADO. Una nueva petición explícita de ducking puede prevalecer; si se solicita, usar transiciones suaves.
- Conservar textos, cortes, producto y demás reglas. No aplicar retrospectivamente a otros vídeos sin encargo.
- Antes de cada edición musical leer esta regla y consultar la receta aprobada; no copiar ciegamente tiempos de V7 a otros vídeos. Cada canción tiene su marcador y cada montaje su entrada real de cuerpo.

La aprobación humana corresponde a la sincronización y mezcla R2. No inventa una revisión independiente ni certifica separación perfecta de ambiente. Esta actualización documental/estructurada no demuestra que todos los montadores históricos consuman la política. La app ya guarda el drop por hash y lo adjunta a nuevas preparaciones; la aplicación del nivel constante debe verificarse en cada render.


## Precisión posterior: voz conservada, música original eliminada — 25/10/2026
Emmanuel aprueba V8 R3 como ejemplo de ausencia de música original. En próximas ediciones, si existe voz, conservarla y eliminar la música del clip; añadir únicamente la canción elegida, continua desde el primer fotograma y con el drop guardado alineado al primer frame real del cuerpo. No basta usar un archivo llamado «voz»: comprobar que no arrastra música residual. No borrar voces por defecto para resolver una separación defectuosa. V8 R3 sin audio original fue una corrección concreta, no una autorización general para silenciar el habla. Si no puede conservarse la voz sin música residual, registrar el problema y no presentar el resultado como verificado. Mantener la política R2 de canción sin cortes internos ni atenuación automática. La aprobación y documentación no acreditan integración global ni escucha independiente. Evidencia: REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion-v8-r3.json en SSD.
