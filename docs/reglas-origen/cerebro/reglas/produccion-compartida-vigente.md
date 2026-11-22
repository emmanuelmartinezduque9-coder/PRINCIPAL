# Producción compartida — Emmanuel y Sebastián

Leer antes de planificar cada nuevo encargo compartido. Este archivo orienta hacia las reglas vigentes: no sustituye las puertas ni concede aprobaciones.

- Usar los mismos archivos del proyecto, assets por cuenta, avatares y motor. No copiar registros ni abrir otra cola. No activar trabajos ajenos o históricos.
- Leer AGENTS.md y CEREBRO/reglas/lotes-dos-revisiones-editables.md: primera revisión conjunta de todos los frames; segunda de todos los clips. Continuar lo independiente sin preguntas repetidas sobre decisiones ya registradas. Ante un bloqueo real, documentarlo sin inventar aprobaciones.
- Genjutsu requiere frame inicial limpio, aprobado y realmente adjuntado: CEREBRO/reglas/genjutsu-frame-inicial-obligatorio.md. Para nuevos Motion Transfer, usar la skill higgsfield-genjutsu y EDITOR/GENJUTSU_ENGINE.md.
- Elegir el motor por clip. No mantener habla extranjera por defecto cuando la cuenta requiere alemán o italiano. Revisar fuente y capacidades antes de elegir.
- Genjutsu 480p debe pasar por Topaz 4K conforme a las reglas vigentes; conservar original, audio, recibos y estado real del escalado. No presentar una promesa de upscale como entrega.
- Cuenta atrás de hasta 6 segundos, salvo instrucción explícita aplicable al encargo. Mantener prompt y acciones originales salvo adaptaciones autorizadas.
- Emmanuel: preparar proyectos editables según su encargo y EDITOR/CAPCUT.md. Sebastián: por orden de Emmanuel del 02/10/2026, NO preparar, copiar ni modificar proyectos CapCut. Entregar sus clips organizados por cuenta, con audio original y upscale cuando corresponda. Esta excepción no elimina las revisiones visuales ni cambia la entrega de Emmanuel.
- No modificar conceptos fuente. No renumerar por iniciativa propia. Registrar frames, archivos, conceptos y entregas en la biblioteca correcta.
- Las respuestas de Sebastián se muestran en el chat web. Presentar medios archivados en NanoBanana; preguntas normales dentro del chat, no controles exclusivos de Codex.
- Trabajos de Sebastián se dirigen al destino sebastian. Las aprobaciones corresponden solo a su encargo y a los archivos mostrados.

Ante contradicciones, prevalece la instrucción explícita más reciente del usuario. Este documento no afirma que el chat recuerde automáticamente toda conversación anterior.

## Continuidad web — 30/09/2026
La presentación de un frame NO termina el encargo. Conservar el progreso como
pendiente de aprobación; el turno puede acabar para recibir la respuesta web,
pero nunca marcar el lote completado por ello. Al recibir «Aprobar y continuar»,
verificar el archivo/hash indicado, registrar la aprobación por la puerta normal
y continuar el mismo encargo hasta la próxima revisión necesaria o entrega real,
sin pedir otra orden de «sigue». No regenerar el frame ni duplicar tickets.
Los medios de revisión pueden presentarse en NanoBanana/<CUENTA>/_revision_<lote>/.
El botón transmite una decisión humana, no sustituye las comprobaciones del motor.

## Preparación y audio — corrección 30/09/2026
Preparar fuente, audio/idioma, prompt y referencias de vídeo mientras se genera
el frame, antes de solicitar aprobación. No posponer toda la planificación del
clip hasta después de la respuesta. Reutilizar evidencia existente ligada al hash;
no repetir análisis ni lecturas completas ya resueltas en el mismo encargo.
Memories DataLake puede leer transcripción con `get_video_content`,
`kind=transcription`, de un `video_id` indexado; también `get_moment` con
`expand=[transcription]`. Que falte `transcribe_audio` NO significa ausencia de
transcripción. Consultar capacidades reales y recibos antes de declarar bloqueo.
Antes de nueva indexación comprobar saldo y recuperar subidas existentes.
Un saldo insuficiente o rechazo se registra como bloqueo concreto, sin comprar
créditos, repetir reservas inciertas ni afirmar idioma o ausencia de voz.
Una transcripción vacía por sí sola no demuestra ausencia de habla.

### Orden posterior: Genjutsu sin control de audio — 30/09/2026
Emmanuel ordena explícitamente generar con Genjutsu sin controlar el audio.
En esta ruta no analizar, transcribir, traducir ni modificar audio por iniciativa
interna; no exigir Memories ni audio_local para enviar. Esta orden prevalece
sobre las indicaciones de comprobación de audio anteriores de este documento.
Usar el vídeo original y frame inicial aprobado, conservando las demás puertas.
Registrar la decisión del usuario, nunca fingir escucha o idioma verificado.
Una petición explícita posterior de traducción/audio se trata por separado.

### Genjutsu: envío directo tras aprobar el frame — orden posterior 30/09/2026
Emmanuel dispone que el frame aprobado, los assets y el vídeo de referencia son
los insumos suficientes para preparar el envío Genjutsu del encargo autorizado.
No añadir Memories, transcripción, análisis de audio, reconstrucción de escenas
ni una segunda revisión creativa o agente revisor como condición previa.
No reabrir decisiones ya aprobadas. Aplicar los cambios pedidos al preparar el
prompt de edición y enviar por el motor existente.
Conservar únicamente comprobaciones mecánicas de archivos/referencias correctos,
aprobación real, parámetros admitidos y ausencia de un envío previo o incierto.
No inventar veredictos para satisfacer controles antiguos: cualquier adaptación
de la puerta debe reflejar explícitamente esta política específica de Genjutsu,
sin afectar otros motores ni modificar evidencias históricas.
La revisión del resultado sigue en la ronda de clips, después de generarlos.
