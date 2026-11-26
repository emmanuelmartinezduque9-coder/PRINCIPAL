# Sitios de la referencia: un frame, un clip y un Topaz por vídeo

Orden expresa de Emmanuel, **25/11/2026**: todos los vídeos generan una apertura (`frame`),
un clip (`clip`) con el vídeo fuente entero desde esa apertura aprobada y un Topaz (`upscale`).
Más candidatas de apertura únicamente mediante `videos.frame_count` o `batches.frame_count`.
Nunca se crean `frame:N`, `clip:N` ni `upscale:N`. No se recorta por sitio ni se empalma en montaje.

## Sitios y referencias

`clipPlaces` en `tramos.ts` conserva los índices de `analysis.places` y sus tiempos absolutos.
El sitio 0 ya está en la apertura y no añade referencias. Cada sitio N ≥ 1 adjunta fotos de entorno solo si cumple las tres condiciones: **≥ 2 tomas**
(cuyos inicios están dentro del sitio), **≥ 4 s** y **≥ 25 % de la duración del vídeo**.
Las constantes `LONG_PLACE_MIN_SHOTS`, `LONG_PLACE_MIN_MS` y `LONG_PLACE_MIN_SHARE` viven en `tramos.ts`.
Orden del 25/11/2026: las referencias son para entornos que ocupan varias tomas y una parte importante
del vídeo, no para objetos o apariciones breves. Primero se mantienen apertura, avatar, artículo y embalaje en su orden habitual.
Se respeta `MAX_IMAGE_REFS`: Motion Transfer 49, Object Swap 30, Wan 10. Seedance no añade entornos.

Para ese sitio manda la foto del dueño (`environment_photo_id` o `video_references` con papel
`fondo`) si `ownerEnvironment` dice que cubre su tipo de sitio; no se busca Pinterest para él.
Si no, se usan las fotos de `video_pinterest_refs.tramo = N`. La búsqueda de sitios posteriores
queda lista sin escribir ningún prompt de frame. Sus índices no cambian por haber tomas cortas.

El único prompt añade por entorno, con sus números reales y tiempos del vídeo entero:

> From {start}s to {end}s the scene takes place in {place}: rebuild that setting from images [k]..[m] (real photos of it), localized to the target country; keep the action ({action}) and {keepObjects}. Image [1] only supplies the person, the product, the outfit and the look for that part; do not carry its background there.

Los sitios que no cumplen las tres condiciones no buscan ni adjuntan fotos. Se describen con tiempos
absolutos, conservando acción, sitio y objetos necesarios y variando diseño, color y contenido.
Nunca se traslada el fondo de otra toma ni se saca algo de la nada.

## Vídeos antiguos

También generan un solo clip desde el `frame` de apertura aprobado. Los `frame:N` aprobados en
`videos.tramo_approvals` se reutilizan como referencias de entorno de su sitio solo si es largo, sustituyendo a
Pinterest. Un `frame:N` aprobado de una toma corta nunca se adjunta. No se regeneran imágenes. Las generaciones `clip:N` y `upscale:N` antiguas se ignoran:
no bloquean el avance ni entran en el montaje. La revisión muestra solo la apertura y sus candidatas.

## La imagen del dueño manda

La foto manual se etiqueta «Tu imagen de entorno (manda)». El prompt de apertura enumera todos sus
objetos en inglés con su posición y conserva habitación, mobiliario, decoración y objetos reconocibles.
Solo reencuadra lo necesario para colocar acción, manos y producto. Las pantallas conservan contenido
neutro sin personajes ni marcas. El clip aplica esta conservación en los tiempos de su entorno.

## Pausas

Un lote `pausado` requiere reanudación explícita. El barrido no reanuda pausas de prompt ni devuelve
vídeos excluidos en lotes pausados. Autopilot solo procesa vídeos sueltos. Las generaciones pendientes
no se envían y los montajes encolados no se recogen mientras el lote esté pausado. Publicar no arranca
el lote 10. Un trabajo que ya se envió al proveedor antes de pausar puede terminar y conservar su resultado.

Pruebas: `tests/tramos.test.ts`, `tests/flujo-automatico.test.ts` y el caso de fondo manual en
`tests/pinterest.test.ts`. No se modifica `CLAUDE.md` ni se migran datos al desplegar.

## Casos del lote 10 (umbral del 25/11/2026)

| Vídeo | Duración | Sitio | Tomas | Resultado |
| --- | --- | --- | --- | --- |
| 40 | 16,65 s | Cocina 4,7–8,2 s | 3 | Corto: 3,5 s |
| 40 | 16,65 s | Salón 8,2–16,7 s | 3 | Largo |
| 45 | 15,1 s | Todos los sitios | 1 por sitio | Ninguno largo |
| 47 | 13,8 s | Oficina 8,9–13,8 s | 2 | Largo: 4,9 s y 35 % |
| 38 | 15,4 s | Nevera 7,1–8,2 s | 1 | Sin imagen, incluso con `frame:2` aprobado; se describe en el prompt |

## Rehacer desde la tarjeta (26/11/2026)

El dueño que creó el vídeo puede pedir «Rehacer imagen» o «Rehacer vídeo» con su corrección, sin
confirmación adicional. La ruta de la tarjeta guarda el rechazo y una petición persistente
(`videos.owner_redo`); la generación usa `ownerOverride` y queda marcada en
`generations.owner_override`. Esa generación no consume regeneraciones automáticas ni queda
limitada por el presupuesto autorizado; sigue comprobándose el saldo real de Higgsfield.
El flujo automático conserva sus límites. La migración 0066 añade ambas columnas.

El vídeo vuelve a incluirse. Solo se levanta una pausa por máximo de ese mismo vídeo; una pausa
manual o por otro motivo permanece. Durante esa pausa solo pasan la búsqueda de la imagen pedida,
su generación o el clip pedido y su Topaz y montaje. La imagen nueva vuelve a revisión visual.
La petición persiste mientras Pinterest prepara el prompt con la corrección del dueño; el
seguimiento la retoma sin pedir otro clic. El clip incorpora el motivo de rechazo en su prompt.
