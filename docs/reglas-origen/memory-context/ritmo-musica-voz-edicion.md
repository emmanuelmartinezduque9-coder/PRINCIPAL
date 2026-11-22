# Ritmo, entrada de voz y producto — 20/10/2026

## Orden posterior: cajas visibles solo un segundo — 22/10/2026

En los ganchos de cuenta atrás que destapan cajas, cortar la permanencia posterior
al revelado a un segundo como máximo. A 24fps son24frames, a30fps son30frames;
usar la tasa real y un marcador visual revisado ligado al hash. Conservar la
cuenta atrás y el destape, no la espera posterior mostrando cajas. No extender
un clip que ya termine antes. Encadenar el cuerpo seleccionado y recalcular sus
textos/música. No truncar palabras: conservar voz completa mediante una solución
de edición revisada, sin prolongar el relleno visual ni regenerar clips.
Emmanuel autoriza ahora corregir V1/V3 EisWerk del lote83 y las ediciones
defectuosas/faltantes del mismo lote. Los demás históricos permanecen intactos.
La integración y las pruebas ejecutables deben constar aparte; esta nota sola
no acredita despliegue en todas las rutas.

Implementación22/10: `rhythm_edit.validate_countdown_reveal_hold` comprueba
marcador revisado, hashes, mapa de frames y duración máxima1s; `cut_integrity`
lo consume. `video_edit_policy` guarda la clasificación explícita hook/snapshot
en nuevos planes; autoedit exige el marcador para trabajos clasificados.
Order83 rendererv3/v4 exige el control para las correccionesV1/V3. La importación
genérica sin metadatos todavía requiere clasificación visual explícita: no
afirmar detección automática universal ni reescribir trabajos históricos.

No usar un generado limpio sin overlays como prueba de que su referencia no
tenía textos. Resolver primero el enlace explícito de edición; si falta, seguir
la procedencia del concepto hasta su vídeo original real y comprobar sus letras
y emojis. Una nueva corrección humana que pide los textos prevalece sobre el
antiguo `text_mode=none`, mediante autorización separada ligada al spec: nunca
alterar el encargo inmutable ni ignorar una exclusión explícita sin nueva orden.

Orden de Emmanuel: nuevas ediciones deben ligar la entrada fuerte de la canción
con la demostración del producto o cambio de escena. En ganchos hablados quitar
la espera inicial, conservando aproximadamente 100 ms antes del primer fonema.
No cortar consonantes ni confundir ruido inicial con habla. Contrastar VAD, forma
de onda y acción visual; ASR aislado puede asignar mal el inicio.

Dar prioridad a la voz: normalizar aproximadamente a -14 LUFS y limitar picos;
no interpretar «todo el volumen» como ganancia ilimitada. Música debajo de la voz
atenuada y liberada al cambio; fuera del gancho usar solo la canción seleccionada,
no música residual del cuerpo. Conservar voz, tono y palabras completas.

Usar `EDITOR/rhythm_edit.py` para el plan de tiempos con marcadores revisados.
La entrada fuerte NO es cualquier golpe ni el mayor pico de todo el archivo:
revisar el fragmento musical y la referencia. Registrar archivo/hash y segundo
del acento elegido. Ajustar primero el fragmento musical; si conviene, acelerar
levemente el gancho sin alterar el tono (límite predeterminado 1.12x).
No acelerar el cuerpo ni eliminar acciones esenciales por acomodar un golpe.
Fuente de texto/recuadro/traducción vigentes permanecen; recalcular sus tiempos.

Registrar mapa exacto de frames cuando hay velocidad. El verificador independiente
de cortes comprueba el final; el control de audio comprueba onset, sonoridad,
picos, prioridad de voz y alineación del acento con el corte. No atribuir escucha
humana a una medición automática. Conservar originales y recibos.

Primera integración ejecutable: prueba autorizada V9 del lote59 en
`order59_finish.rhythm_verified_v9`. El módulo es reutilizable para nuevos lotes;
esta política no acredita despliegue automático en todas las rutas de la app.
No aplicar retroactivamente ni regenerar clips para cambiar edición.

## Comprobaciones de edición reforzadas — 22/10/2026

Antes de entregar, contrastar la canción con la selección del item ORIGINAL:
la normalización de prepared.item puede omitir esa selección. Conservar hash y
recibo de importación. La música de un cuerpo no sustituye el archivo elegido.
Separar el marcador de alineación musical del fin del ducking: si la voz continúa
tras el revelado, conservar la frase y documentar el desfase; no cortar palabras
para aparentar coincidencia. Un offset negativo se representa como retraso real
de la pista, no se cambia silenciosamente a cero.

Verificar los emojis desde la referencia visual, la traducción y el CTA propio
según06B, los PNG de texto y el render final. Revisar legibilidad del cierre;
cuando el CTA quede fugaz, ajustar únicamente sus tiempos sobre resultado/producto
sin inventar tomas, duplicar frames o cambiar el texto. Cada revisión debe ligar
el spec y renderer exactos por hash; guardar versiones previas y revisión final
independiente con todos los frames, decodificación y mediciones del audio.

Implementación comprobada en el lote83: order83_render.py y su variante v2 con
retraso musical. Esto NO acredita integración global en otros montadores ni
autoriza reexportar históricos. El detalle de comprobaciones del lote está en
EDITOR/order83_edit_checks.md; los recibos reales permanecen en el pedido.
# Voz y subida progresiva — orden 22/10/2026

En nuevas ediciones, analizar el montaje de referencia y marcar el acento de la
canción y el cambio de escena/producto correcto. No inventar el tiempo a partir
de duración fija. Voz inicial con 15–150ms de margen sin cortar fonemas; normalizar
para inteligibilidad sin saturar. Música atenuada bajo la voz y rampa smoothstep
de 0,70s después del último fonema (ajustable revisada 0,3–2s), nunca salto brusco.
No confundir el final de voz con el acento musical. Aceleración suave con tono
conservado solo si encaja con la acción y el mapa visual.

`EDITOR/edit_audio_integrity.py` exige fuentes/hashes, marcadores y revisión
independiente; crea mezcla reproducible y verifica el audio del render, incluidas
ventanas locales estéreo y comparación equivalente AAC192k. `autoedit/engine.py`
exige audio-plan.json ligado al cut-plan.json, canción seleccionada y referencia
exacta. `completed_batch_catalog.verify_new_edit_cut` bloquea publicación de
finales editados nuevos sin recibos de cortes y audio coincidentes. No modifica
finales históricos ni convierte una prueba sintética en revisión semántica real.

Para cerrar nuevos pedidos con `audio_integrity_policy=20261022-progressive-music-v1`,
registrar `.progress.json.final_edit_reviews[item_id]` con path/sha256 del recibo
final (order, item, output, sha256, full_decode_ok, audio_integrity,
final_cut_integrity). `edit_delivery_gate` conserva el pedido pendiente mientras
falte un final editado vinculado. No basta acabar los clips generados.



## Canción continua desde el inicio — orden expresa 25/10/2026

La canción seleccionada debe sonar desde el primer fotograma y continuar en un único fragmento cronológico hasta el final: sin entrada diferida al cuerpo, saltos, reinicios ni cortes internos de canción. Elegir el punto inicial del archivo para que el drop o parte principal observado coincida con la entrada del segundo clip (cuerpo), sin añadir relleno al gancho. No confundir empezar desde el primer fotograma del vídeo con exigir el segundo cero del archivo musical. Mantener voz inteligible sin superponer otra canción residual del generado; separar y revisar la voz cuando sea necesario. Los cambios de ganancia, especialmente la subida tras hablar, deben ser progresivos y continuos, nunca saltos secos.

Esta orden sustituye la excepción anterior de conservar música distinta durante el gancho y pasar después al MP3 en V1/V2/V3 del lote34. Corrección autorizada: V1, V2, V3 EisWerk y V6 HaarZauber del lote34; conservar clips y originales. Exigir revisión independiente del audio final, continuidad del fragmento, rampa y coincidencia drop/entrada del cuerpo, con tiempos y hashes. Documentar limitaciones reales; la actualización de esta regla no certifica renders ni despliegue global.


## Orden posterior: mezcla R2 aprobada — 25/10/2026
Leer `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/REGLA.md`. Canción exacta, continua desde primer frame; alinear drop guardado a entrada del cuerpo y recortar solo extremos. Sin ducking automático del gancho, sin limpieza/separación de la canción elegida. Nivel constante; ajuste global anticlip permitido. Retirar música solo del audio original, conservar voz/ambiente cuando sea posible. Sustituye defaults anteriores de atenuación/rampa automática; no modifica históricos. Aprobación humana exacta en aprobacion.json.


## Precisión posterior: voz conservada, música original eliminada — 25/10/2026
Emmanuel aprueba V8 R3 como ejemplo de ausencia de música original. En próximas ediciones, si existe voz, conservarla y eliminar la música del clip; añadir únicamente la canción elegida, continua desde el primer fotograma y con el drop guardado alineado al primer frame real del cuerpo. No basta usar un archivo llamado «voz»: comprobar que no arrastra música residual. No borrar voces por defecto para resolver una separación defectuosa. V8 R3 sin audio original fue una corrección concreta, no una autorización general para silenciar el habla. Si no puede conservarse la voz sin música residual, registrar el problema y no presentar el resultado como verificado. Mantener la política R2 de canción sin cortes internos ni atenuación automática. La aprobación y documentación no acreditan integración global ni escucha independiente. Evidencia: REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion-v8-r3.json en SSD.
