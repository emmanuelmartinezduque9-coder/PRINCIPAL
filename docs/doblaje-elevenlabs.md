# Doblaje con ElevenLabs

Orden fija del dueño, 27/11/2026: jamás gastar créditos de Higgsfield en traducciones o doblajes.

El servidor usa ELEVENLABS_API_KEY exclusivamente en la cabecera xi-api-key:
- POST https://api.elevenlabs.io/v1/dubbing: multipart con file (solo voz), target_lang ISO 639-1, source_lang=auto, num_speakers=0, watermark=false y drop_background_audio=true.
- GET /v1/dubbing/{dubbing_id}: consultar hasta dubbed o failed.
- GET /v1/dubbing/{dubbing_id}/audio/{target_lang}: descargar el resultado autenticado.

Se conserva separar → doblar solo voz → mezclar sobre música y efectos originales → comprobación final. También las reparaciones de frases usan ElevenLabs. Cada petición tiene un timeout de 120 segundos; el montaje espera hasta diez minutos por ejecución y devuelve el trabajo pendiente a la cola. Tras una hora se detiene. Los errores no contienen claves ni cuerpos remotos.

dubs guarda dubbing_id en job_id, quoted_credits=0 y credits_spent=0; mantiene language ISO 639-3 para reutilizar las filas existentes. El trabajo enviado se recoge tras un fallo local sin reenviarlo. Un envío dudoso detiene el montaje y requiere que la persona lo pida de nuevo. La comprobación final permite un único reintento completo; el historial persistente limita a dos envíos completos con ElevenLabs por vídeo, source_sha256 e idioma.

Referencia de los endpoints solicitados: https://elevenlabs.io/docs/api-reference/legacy/dubbing/create (la documentación actual los clasifica como legacy).

## Que a ElevenLabs solo llegue habla y que ninguna canción se traduzca (27/11/2026)

ElevenLabs traduce cualquier voz que reciba. Lo que recibe es `dialogue-only.mp4`: la pista de voz de BandIt con TODO
silenciado fuera de las ventanas de habla (`doblar.py rescatar`: lo que la voz tenga fuera vuelve a la música, que suena
igual). Las canciones se colaban por la comprobación final, no por la separación: oía un verso en inglés en la música
(«Christmas party happened» del 72, «That's why I love, Nestle Crunch» del 86), la decisión lo daba por habla, quedaba en
`forzar` y el siguiente doblaje trataba ese tramo como diálogo («Rockin' around the Christmas tree» del 72, «I never lose a
car on you» del 86). Ahora:

1. La comprobación final solo da por diálogo sin traducir una frase **conversacional de la pista de voz**. Lo que suena en
   inglés en la música o en la mezcla se deja: es la canción.
2. `forzar` nunca convierte en habla una frase que la decisión da por canto, y un tramo forzado sin frase se dobla con lo
   que tenga la VOZ, nunca con la voz de la música.
3. **Letra traducida** en el vídeo montado: no se dobla otra vez. `doblar.py restaurar` pone el audio ORIGINAL en esos
   tramos del doblaje guardado (con fundidos), el tramo queda en `cantar` y el vídeo se vuelve a montar. Máximo
   `MAX_RESTORES`; si aun así sigue, el montaje se para con el motivo, nunca «hecho» con letra traducida.
