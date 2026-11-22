# Primera prueba EisWerk: reglas ejecutables, no más agentes por defecto

Correcciones explícitas de Emmanuel: música demasiado baja sin habla; última
línea de texto más ancha que la primera; keyword ajena en la petición de comentarios.
Regla vigente: [[../reglas/edicion-musica-texto-cta]].

## Causa y cambio

1. El compilador usaba `keep_clip_audio=True` como si probase que había voz y
   fijaba música al 20%. Ahora usa `speech_present`; conservar ambiente no baja música.
2. El maquetador respetaba saltos OCR y equilibraba líneas sin orden de anchura.
   Ahora mide Classic, busca anchura descendente y admite separación válida alemana
   con Pyphen local. Tests conservan palabras, márgenes y centrado.
3. Se copió literalmente «ICE CREAM» en la CTA. La nueva orden autoriza reemplazar
   solo la keyword de comentarios por «Eiswerk», manteniendo evidencia fuente intacta.
4. Se inventó una regla de CTA de dos segundos y se prepararon correcciones de
   vídeos que el usuario quería conservar. No convertir preferencias del asistente
   en bloqueos. Los tests comprueban que estas correcciones NO cambian los vídeos.
5. El guardado canónico de los montajes dependió de un script particular de la tanda.
   Ahora forma parte de la finalización y reintento local de Creatomate, sin nueva
   API de generación ni inferir aprobación. Tests de dos copias, hash, no sobreescritura.

## Qué demuestra la prueba

Los tres envíos Seedance ya eran paralelos y sus originales quedaron guardados
en aproximadamente seis minutos desde el envío. La prueba completa hasta archivo
canónico ocupó unos 66 minutos. El cuello principal fue la coordinación, preparación
y retrabajo entre etapas, no tres generaciones ejecutadas una detrás de otra.
No atribuir cada hueco a un proveedor ni al usuario: faltaban relojes específicos
de espera humana/cómputo/revisión; varios hitos se reconstruyen desde archivos.

Coste comprobado Higgsfield: 158,77 créditos. Creatomate: 60 estimados, cargo exacto
no expuesto en las respuestas guardadas. No inventar equivalencia a euros ni coste
de Memories/Codex. Detalle: `EDITOR/lotes/tanda_20260913_prueba_eiswerk/RETROSPECTIVA.md`.

Los MP4 originales se conservan. Las nuevas recetas/borradores NO son nuevos vídeos
exportados. No afirmar validación visual en Creatomate de cambios probados solo localmente.
