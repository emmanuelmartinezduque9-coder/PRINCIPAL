# Doblaje con ElevenLabs

Orden fija del dueño, 27/11/2026: jamás gastar créditos de Higgsfield en traducciones o doblajes.

El servidor usa ELEVENLABS_API_KEY exclusivamente en la cabecera xi-api-key:
- POST https://api.elevenlabs.io/v1/dubbing: multipart con file (solo voz), target_lang ISO 639-1, source_lang=auto, num_speakers=0, watermark=false y drop_background_audio=true.
- GET /v1/dubbing/{dubbing_id}: consultar hasta dubbed o failed.
- GET /v1/dubbing/{dubbing_id}/audio/{target_lang}: descargar el resultado autenticado.

Se conserva separar → doblar solo voz → mezclar sobre música y efectos originales → comprobación final. También las reparaciones de frases usan ElevenLabs. Cada petición tiene un timeout de 120 segundos; el montaje espera hasta diez minutos por ejecución y devuelve el trabajo pendiente a la cola. Tras una hora se detiene. Los errores no contienen claves ni cuerpos remotos.

dubs guarda dubbing_id en job_id, quoted_credits=0 y credits_spent=0; mantiene language ISO 639-3 para reutilizar las filas existentes. El trabajo enviado se recoge tras un fallo local sin reenviarlo. Un envío dudoso detiene el montaje y requiere que la persona lo pida de nuevo. La comprobación final permite un único reintento completo; el historial persistente limita a dos envíos completos con ElevenLabs por vídeo, source_sha256 e idioma.

Referencia de los endpoints solicitados: https://elevenlabs.io/docs/api-reference/legacy/dubbing/create (la documentación actual los clasifica como legacy).
