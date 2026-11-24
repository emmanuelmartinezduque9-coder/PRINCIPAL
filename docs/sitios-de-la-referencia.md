# Sitios de la referencia: una apertura y un tramo por sitio

Regla fija de Emmanuel (24/11/2026), el defecto que más le molestaba en Codex. Cada toma de la referencia tiene su propio sitio y su propia acción, y se respetan. Caso real del lote 6: un FalterPfote con las primeras tomas en el supermercado y el resto en la calle. Como solo había una referencia de supermercado, salió entero en el supermercado.

## Cuándo

Con Genjutsu (Motion Transfer u Object Swap) o Wan 3.0 Prime, al replicar o en «Solo gancho» (`usesPlaces` en `analysis.ts`). Con Seedance o en «Adaptación de concepto» no se parte nada. Tampoco sin la referencia entera guardada (`reference_storage_key`), porque hace falta para recortar. Con un solo sitio, todo sigue como antes.

## El desglose

`Analysis.places` (opcional): las tomas consecutivas del mismo lugar real, agrupadas en orden. Cada sitio lleva:

- `startS` y `endS`;
- `place`: tipo de sitio, en inglés;
- `action`;
- `keepObjects`: los objetos que exige la acción, como la nevera o la caja;
- `ownerEnvironment`: si la referencia de entorno del dueño es de ese tipo de sitio;
- `imagePrompt` y `videoPrompt`.

El primer sitio usa los prompts de siempre, y esos prompts describen solo el primer sitio. `normalizePlaces` (`tramos.ts`) ordena los sitios, quita huecos y solapes, cubre el tramo entero y junta lo que dura menos de 1 s con el sitio anterior. Un sitio siguiente sin sus prompts también se junta con el anterior.

## Las generaciones

El primer sitio usa los tipos de siempre (`frame`, `clip`, `upscale`). Cada sitio extra N usa `frame:N`, `clip:N` y `upscale:N` (la restricción `generations_kind_valid` los admite). Se construyen con los mismos constructores y el vídeo «visto desde ese sitio» (`tramoVideo`):

- su prompt;
- su referencia de entorno, solo si `ownerEnvironment`;
- lo aprobado de ese sitio, en `videos.tramo_approvals`;
- su duración;
- para el clip, su vídeo fuente recortado de la referencia guardada (`tramoReferenceMedia`, subido una vez).

Lo que se vuelve a comprobar al apuntar (la instantánea) son las columnas del vídeo de verdad.

- **Apertura.** `image 1` es el primer fotograma de ese sitio, sacado de la referencia guardada. Las fotos de Pinterest son las de ese sitio (`video_pinterest_refs.tramo`), con la escena de ese sitio, su acción y sus objetos.
- **Sitio corto.** Si un sitio dura menos que el mínimo del modelo (Motion Transfer: 3 s), su vídeo fuente congela el último fotograma hasta llegar (`sourceMsFor`). Lo congelado se corta al empalmar: nunca se toma prestado otro sitio.
- **Orden.** El lote y el vídeo suelto piden de uno en uno por vídeo. Los clips salen cuando las aperturas de todos los sitios están aprobadas.
- **Revisión.** Las aperturas del mismo vídeo se revisan juntas, en «Revisar imágenes» y en el paso Imagen. No hay pasos ni botones nuevos: cada apertura extra tiene su «Aprobar» y su «Rechazar».

## El empalme

`buildSpec` (`edits.ts`) pone en el clip los tramos de cada sitio (`parts`), cada uno con lo que dura en la referencia. `montaje-nube.ts` descarga cada tramo (a 1080p si Topaz terminó) y los empalma con `spliceClips`, como el empalme por tomas de Codex (lote 6, ids 8 y 12):

- corta cada tramo por su duración;
- lo pone al tamaño del primero;
- 24 fps, crf 16;
- sin audio, porque el audio sale de la referencia.

## Coste extra por vídeo

Por cada sitio extra:

- una imagen de Nano Banana 2.1 a 2K (su precio de siempre, unos 2 créditos por candidata);
- el redondeo de Topaz por tramo (mínimo 2 créditos por tramo, en lugar de uno para todo el clip);
- si el sitio dura menos de 3 s, lo congelado que Motion Transfer cobra de más.

El clip en sí no se duplica: los tramos suman la misma duración. El presupuesto del lote ya lo cuenta (`quoteRows`).
