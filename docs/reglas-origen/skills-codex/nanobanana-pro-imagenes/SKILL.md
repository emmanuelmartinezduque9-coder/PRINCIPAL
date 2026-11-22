---
name: nanobanana-pro-imagenes
description: Generar y corregir imágenes con Nano Banana Pro para el proyecto Nano Banana de Emmanuel, con sus referencias reales y luz cotidiana variable. Incluye frames UGC y assets limpios; no genera vídeos.
---

## Revisión de frames — orden posterior09/11/2026
Para trabajos de Emmanuel, no exigir revisores creativos de prompts o salidas de frames antes de mostrarlos: Emmanuel los aprueba. Preparar a partir de referencias reales y conservar controles técnicos, archivos y aprobación humana antes de clips. Esta orden sustituye requisitos anteriores de revisión creativa independiente de frames, pero no la revisión final de vídeo. Ver `memory/context/automatizacion-ligera-20261109.md` del proyecto.


# Nano Banana Pro — imágenes de Emmanuel

ACTUALIZACIÓN 20261007: few-shot aportado por Emmanuel, integrado en esta misma guía.
Conserva la receta técnica de realismo 20261003; no cambia su versión ni el motor.
No autoriza generación comparativa ni modifica trabajos, recibos o aprobaciones.

Esta es la guía única de generación de imágenes de este proyecto, por orden de
Emmanuel del 01/10/2026. No combinar instrucciones creativas de otras skills de
imágenes ni cambiar a otro generador por defecto. No requiere cargar la skill
genérica de Higgsfield. Las reglas de ejecución y aprobación del proyecto siguen
vigentes; esta skill no crea otra cola ni autoriza gasto fuera del encargo.

Proyecto: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS`.
Las rutas del motor indicadas debajo son relativas a esa raíz.



## Fondos de Pinterest por toma

En cada nuevo vídeo preparar las referencias de entorno siguiendo `/Users/emmanuelmartinezduque/.codex/skills/fondos-pinterest-por-toma/SKILL.md` antes de redactar prompts. La indicación de la tarjeta y el fondo aportado por Emmanuel tienen prioridad. Aplicar por espacio y mantener continuidad.

## Luz de la referencia e integración completa — orden 30/10/2026

La luz observada de la imagen de habitación o espacio es la autoridad principal de toda la escena, por encima de recetas genéricas y de la iluminación del avatar, producto o composición original. Igualar dirección, fuentes, temperatura de color, intensidad, contraste, exposición y caída de luz en persona, piel, manos, ropa, producto y embalaje. Integrar sombras proyectadas y de contacto, oclusiones, reflejos y rebotes de color, perspectiva, escala, profundidad, nitidez y textura. No pegar recortes ni mantener luz de estudio independiente. Uniformidad significa coherencia visual, no iluminación plana: conservar zonas iluminadas y sombras reales de la referencia.

Antes del prompt observar la referencia real e identificar qué imagen aporta el entorno y su luz, usando su índice efectivo. No inventar una dirección de luz no observada. La imagen de estilo no reemplaza la iluminación del espacio. Reluminar el avatar y el producto para integrarlos, conservando identidad, geometría y color físico del producto. Si hay varias referencias de espacios incompatibles, resolver la principal por toma según notas y alcance antes de generar, sin mezclar luces arbitrariamente.

Comprobar el prompt FINAL y revisar visualmente cada resultado contra esa referencia: luces y sombras en cara/manos/producto, sombras de contacto, reflejos, escala, perspectiva, profundidad y bordes sin halos. Registrar referencia, hash y observaciones. Una instrucción o un control técnico no acredita integración visual. No modificar históricos ni regenerar sin encargo.

## Patrón visual elegido

Antes de escribir un prompt, mirar la referencia pertinente del
[criterio visual del 03/10/2026](references/realismo-20261003.md).
Imágenes 1,2,3,4,6 positivas; 5 negra no utilizable; 7,8 rechazadas como estilo.
Las selecciones sintéticas anteriores siguen archivadas, pero no son la receta
de luz, paleta ni textura para nuevos frames. No modificar aprobaciones históricas.

- El color procede de rótulos de tienda, ropa, decoración o productos propios del
  lugar. No fabricar un arcoíris de cajas, snacks, bloques o paredes de colores.
- Piel y tejidos naturales, exposición cotidiana y suavidad moderada de vídeo de
  móvil. No piel cerosa, detalle exagerado, HDR, filtros ni aspecto de render.
- El problema no se arregla añadiendo poros: respetar variación de exposición y
  detalle entre zonas iluminadas, sombras, movimiento y planos. No recuperar
  artificialmente todos los rincones ni tratar tela, piel y fondo con igual nitidez.
  No imponer oscuridad, ruido fuerte, desenfoque o mala calidad a todos los hooks.
- Luz de fuentes reales: pueden coexistir techo frío, lámparas cálidas y ventana.
  Sombras, reflejos y exposición deben conectar sujeto, producto y entorno.
- Una tienda debe parecer un lugar utilizado; la decoración navideña solo cuando
  corresponda al encargo. No convertir todas las imágenes en cafeterías o tiendas.
- No repetir roble, paredes verdes, guirnaldas, sofás y árboles como firma estética.
  Conservar elementos exigidos por la acción/fuente; los demás dependen del lugar.
  Snacks son pertinentes en un pasillo de snacks, no un relleno cromático universal.
- La composición define acción/encuadre; el avatar define identidad; el asset
  define producto. La imagen de estilo no redefine ninguno de ellos. Especificar
  prendas que conservar para evitar copiar involuntariamente el conjunto de estilo.

## Few-shot de prompts validados por Emmanuel

Fuente: transmisión humana por SEGA, Sentinel_6d541a6b86c081919202e945636b709c;
propiedad de esta actualización asignada a AUTOMATIZACION IA 2.0 en
Sentinel_7a276e7e9be88191821599009c592d3e. Emmanuel declara validados estos
ejemplos. No se inspeccionaron sus imágenes ni se repitieron experimentos al
incorporarlos; no atribuirles una certificación visual independiente.

Antes de redactar, leer el ejemplo pertinente completo como patrón de precisión,
no como plantilla universal. Los cuatro textos están íntegros, sin adaptación:

- [1 · Café, apertura y producto fuera de plano](references/fewshot-emmanuel-1.txt):
  roles separados de composición, identidad exclusiva y textura.
- [2 · Tienda de motocicletas](references/fewshot-emmanuel-2.txt): identidad y
  acción conservadas, cinco sustituciones concretas del entorno.
- [3 · Plato y cubierta transparente](references/fewshot-emmanuel-3.txt): contacto
  de ambas manos, escala, orientación del artículo visible y avatar independiente.
- [4 · POV con producto visible](references/fewshot-emmanuel-4.txt): cámara,
  agarre y producto invariantes, cambios acotados y ambiente expresamente conservado.

Aplicar sus patrones a la escena real:

- Asignar a cada referencia su función y exclusiones, usando su índice efectivo.
  Identidad solo del avatar seleccionado; una misma referencia puede aportar
  identidad y composición únicamente si ese es el encargo, como en el ejemplo 2.
- Separar explícitamente invariantes de cambios: cámara, recorte, distancia,
  frontalidad/orientación, mirada, manos con lados de imagen y puntos de contacto,
  escala relativa, silueta y apoyo. No cambiar pose para acomodar el fondo o avatar.
- Describir sustituciones de fondo concretas «elemento original → elemento nuevo»
  y comprobar su presencia en el encuadre; no confundir filtro de color con cambio
  de entorno. Conservar los elementos o el ambiente que el usuario exija conservar.
- Declarar visibilidad real: fuera de plano no significa cubierto; tela opaca
  oculta impresión/artículo pero puede conservar silueta; cubierta transparente
  deja ver el artículo. Producto visible exige geometría, orientación y contacto
  canónicos. No anticipar reveal ni copiar una solución de ocultación ajena.
- La foto de realismo aporta textura, luz o ambiente según su rol, nunca otra
  persona, pose, manos, objeto o composición. Coherencia de luz y contacto, sin
  alisado ni poros exagerados, según la distancia y condiciones reales.
- Elegir negativos ligados a riesgos de esa toma, no concatenar listas de ejemplos.
  No universalizar Navidad, 2700K, marca, persona, lateralidad de manos, habitación,
  cantidad de cambios, número de párrafos ni todos los detalles de un ejemplo.

Esta lectura informa la preparación y comparación visual ya existentes: no añade
gates, revisores, aprobaciones, llamadas de proveedor ni permiso de regeneración.
Comprobar el prompt FINAL del constructor, no solo el borrador: sus cambios de
entorno/luz no deben contradecir los invariantes. Un texto validado como ejemplo
no demuestra que un nuevo resultado los cumpla.

## Redacción contextual y formato del constructor existente

Los ocho apartados siguientes organizan la receta actual del constructor, no
son una condición universal de calidad ni un motivo para reescribir los ejemplos
íntegros. Cuando la ruta técnica vigente exige ocho párrafos, adaptar el nuevo
encargo a ese formato sin alterar sus invariantes; esta actualización no modifica
esa interfaz ni fuerza el mismo número de párrafos fuera de ella.

### Corrección de estilo y escala — 01/10/2026, 22:21

La tanda KaffeeBild/EisWerk anterior NO es un patrón estético: Emmanuel rechaza
la dominante verdosa, piel alisada, iluminación uniforme y producto con aspecto
de recorte pegado. No reutilizar esos resultados como composición o estilo.
Priorizar las fotografías reales de Emmanuel sobre los ejemplos sintéticos
cuando discrepen en piel, exposición o integración. Los ejemplos anteriores no
obligan a repetir paredes verdes, madera, guirnaldas o un mismo decorado.

Actualización 03/10: las nuevas cinco referencias utilizables prevalecen sobre
recetas estéticas anteriores. Verde o beige reales no se prohíben; evitar una
dominante impuesta y el acabado uniformemente limpio/relleno de la escena.

- Describir una fuente concreta y su dirección por escena (ventana lateral,
  puerta abierta, luminarias del local); conservar caída de luz, zonas de sombra
  y blancos neutros. No gradación verde/teal, filtro sepia ni relleno de estudio.
- Piel sin retoque cosmético: edad, variación de tono, pliegues y textura sutil
  visibles a la distancia real. No confundir textura con poros exagerados o HDR.
- Para el producto, usar su proporción real frente a mano/taza/estante de la
  referencia canónica; no inventar centímetros. Si sustituye un maniquí u objeto
  grande de la composición, NO heredar su tamaño. Debe ser un artículo de uso
  doméstico, no un expositor gigante.
- Misma perspectiva, nitidez, ruido, iluminación y oclusiones que su entorno.
  En escaparates: sombra de contacto sobre repisa, cristal por delante con
  reflejos discretos coherentes y objetos de escala en el mismo plano. Nunca
  ampliar el artículo solo para volverlo protagonista; acercar el encuadre si
  hace falta sin alterar tamaño físico ni acción autorizada.
- El color viene de objetos identificables y pertinentes. No imponer una paleta
  repetida a todos los ambientes. Conservar la geometría/color del asset propio.

La revisión visual de cada salida debe observar estos puntos; escribirlos en el
prompt no certifica que se cumplan. No prometer ausencia absoluta de defectos ni
reintentar automáticamente una salida válida sin autorización del usuario.

### Prioridad de calidad — orden 01/10/2026 posterior

El frame es el principal determinante del resultado. Antes de gastar, comprobar
en una sola revisión composición inicial, manos/objetos, producto exacto, identidad
y referencia de realismo pertinente. Preparar el prompt de movimiento a la vez:
la postura debe permitir la acción sin inventar manos, anticipar sorpresa/reveal
o exigir cambiar el embalaje durante el clip. No añadir otro verificador técnico.
Después de generar, comparar esos mismos puntos visualmente contra las fuentes.
No presentar «perfecto» por haber pasado hashes o por usar esta skill. Mostrar
desviaciones concretas y respetar la decisión humana; no regenerar sin permiso.
Mantener color contextual y textura real por encima de adornos vistosos.

1. Referencia de composición y comienzo exacto: qué ocurre ahora, qué aún no ocurre,
   distancia, escala y posición de manos/objetos. No anticipar un reveal.
2. Avatar: identificar su número real de imagen y fuente exclusiva de identidad.
   Conservar elección explícita; de lo contrario usar biblioteca autorizada.
3. Artículo/embalaje canónico: geometría, proporciones y papel exactos. Si no aparece,
   declararlo fuera de plano; no inventar accesorios o prestaciones.
4. Entorno concreto: elementos funcionales y variación coherente. El color no es
   una lista de colores obligatorios. Respetar fondos que el usuario pide conservar.
5. Iluminación cotidiana y reflejos propios de ese lugar.
6. Realismo de móvil y papel de la referencia de estilo: `realism reference only`.
   Excluir copia de rostro, vestuario, producto, banderas y overlays de esa foto.
7. Evitar defectos pertinentes: piel plástica, anatomía imposible, colores
   arbitrarios, objetos flotantes y geometría alterada. No acumular negativos vacíos.
8. Formato del encargo; sin captions, emojis, interfaz o watermark superpuestos,
   salvo texto que el usuario solicite expresamente. Rótulos físicos no son overlays.

Redactar en prosa natural, adaptando índices al orden real de referencias que
prepara la puerta. Mantener el prompt separado de notas y evidencia.

Al construir plantillas, proporcionar entorno, fuente/dirección de luz y zonas
que quedan en sombra por toma. No usar «ceiling lights or window as appropriate»
como iluminación final. El constructor `EDITOR/frame_realism.py`, invocado por `EDITOR/frame.py preparar`,
sustituye los párrafos de entorno/luz/realismo sin cambiar acción, identidad, asset
ni formato. Guarda un prompt FINAL nuevo antes de plan/compile: no reescribe tareas
pendientes ni históricas. La puerta frame.preparar verifica el vínculo guardado.

## Ejecución en el sistema existente

- Recuperar primero el encargo y sus solicitudes existentes. No duplicar trabajos.
- En NUEVOS frames UGC preparar con `python3 EDITOR/frame.py preparar fuente.json
  --salida-dir EDITOR/lotes/<encargo>/<salida-nueva>`. La fuente lleva `realismo_receta`
  con `version: 20261003-emmanuel-8`, `position` (1/2/3/4/6), `environment`, `lighting`,
  `style_index` (posición efectiva de estilo en las referencias) y `upload_receipt`
  (ruta al recibo aceptado de frame_transport). `workspace_id` identifica la cuenta.
  Usar el `frames.json` resultante en el nodo normal del motor; `plan` verifica orden,
  hash y recibo. No compilar/enviar la receta cruda. La preparación no genera ni
  inscribe trabajos. Si la salida existe, recuperarla; no sobrescribir ni hacer una
  copia de una solicitud pendiente para cambiarle el estilo.
- Usar Nano Banana Pro a través de `EDITOR/frame.py` y del plan del motor local
  `EDITOR/production_engine.py`, siguiendo `EDITOR/PRODUCTION_ENGINE.md`.
  No generar directamente desde CLI ni sustituirlo por imagegen u otra skill.
- Usar referencias canónicas existentes y composición original válida. No convertir
  ejemplos sintéticos o resultados rechazados en estilo ni base de otro frame;
  no declarar aprobación visual que no esté registrada.
- Adjuntar una referencia real de estilo pertinente mediante `realismo` y
  `realismo_ruta`, con papel explícito. No adjuntar todas indiscriminadamente.
- Antes de usar una referencia nueva, conservar bytes/hash y recibo de subida
  del workspace correcto; el ID Library no es un ID Higgsfield. No reutilizar IDs
  de otra cuenta ni inventar recibos. Las referencias actuales están en
  `REFERENCIA_CALIDAD/realismo-emmanuel-20261003/catalog.json`; aún no se han subido
  a Higgsfield. Si falta su recibo real, conservar pendiente hasta la preparación
  de producción autorizada, sin inventar IDs ni reutilizar los de otra cuenta.
- Preparar y mostrar el plan; conservar prompts, referencias, job y recibos.
  Cumplir las dos revisiones agrupadas vigentes y no preguntar por cada avatar.
- Mostrar resultados crudos del modelo. No aplicar filtros para simular realismo.
  Si hay desviaciones, señalarlas sin regenerar por iniciativa propia. Correcciones
  solo dentro del alcance autorizado, conservando las demás imágenes.

## Assets limpios y otros formatos

Esta sigue siendo la skill de imágenes si se pide artículo aislado, embalaje,
logo o imagen web: adaptar los párrafos al fondo, texto y formato solicitados.
No introducir personas, tiendas, Navidad, ruido o imperfecciones de móvil en un
asset limpio. Respetar las reglas de alta de producto y assets del proyecto sin
usar otra skill como generador. No modificar producto o marca para añadir color.


## Café y pareja: composición y roles para próximos lotes — 03/10/2026

Aplicar `SEGA-REFERENCIAS-LOGICA-20261003` solamente al crear lotes nuevos.
No reaplicar defaults a NagelKlar actual, pendientes, aprobados o correcciones.
Las originales verificadas están en `REFERENCIA_CALIDAD/hooks-emmanuel-20261003/`;
consultar `catalog.json` y ver los píxeles. Son composición, no identidad ni estilo.
Café: perfil derecho, vaso delante del torso, boca abierta y mirada a la izquierda;
no afirmar sorbo en esa captura ni añadir una pose nueva antes de la acción.
Pareja: dos personas de frente caminando con vasos; ambas erguidas. La captura
no contiene desmayo ni obliga a hombres, abrigos azules/rojos o relación romántica.
No copiar overlays, ropa, personas ni mercancía ajena a otra cuenta.

### Flujo automático desde Prueba producto

Al guardar una prueba NUEVA, `product_test_intake.prepare` congela
`future_hook_defaults`. Al pulsar Iniciar, `start` conserva la autorización de
subidas para esa prueba y encarga al operador el lote habitual. Guardar un
borrador no sube ni genera. Fichas y lotes anteriores sin esta política conservan
su recorrido exacto; no migrarlos, incluyendo NagelKlar actual.

El operador sigue creando los assets y el lote normal: enlazar `product_test_id`
en el snapshot y `batch_id`/cuenta en la ficha ya forma parte del flujo existente.
Preparar los nuevos frames con `frame.py preparar`; no rellenar `hook_scene`,
historial ni recibos manualmente. `product_hook_flow.attach` reconoce coffee y
couple por item_app/item_lote, lee la ficha iniciada y resuelve automáticamente:

- Referencia original café/pareja y hashes de catálogo.
- Historial material reciente: últimos 200 frames y 100 escenas congeladas,
  incluyendo asignaciones del nuevo lote, sin leer sesiones privadas de Codex.
- Público/departamento a partir del uso del producto; uñas/belleza conecta con
  cosmética y asigna mujer a reacción/desmayo. Para un público especial indicado,
  el operador debe conservarlo al describir el encargo, no cambiar identidades.
- Avatar fijo indicado en la ficha o asset real de cuenta. Un retrato explícito
  no se sustituye por conveniencia. Para identificar su papel se usa el selector,
  el registro o la descripción de identidad ya escrita por el operador que ve la
  foto. Si la ficha/foto no está disponible o el papel es ambiguo, conservar
  pendiente y resolver esa evidencia; no inventar género mirando el producto.
- Selección de papeles libres con `select_roles`, historial y activos de la
  biblioteca. Guardar el reparto antes de subir; variantes y recuperación usan
  el mismo reparto. No repetir hombre 1 por defecto si hay otra opción adecuada.
- Subidas/reutilización por `frame_transport.execute('upload', ...)`, con hashes,
  cuenta/workspace declarado y protección de aceptación incierta. IDs Library
  nunca son IDs de proveedor. Solo se sube al preparar una prueba iniciada y
  autorizada; no subir por otra CLI ni repetir ante timeout. No se generan vídeos.
- Receta de luz existente o una elección contextual por composición. La caída
  de luz, ambiente y exposición no son un decorado/paleta uniformes.

La preparación guarda un vínculo inmutable por escena en
`EDITOR/product_tests/<id>/future-hooks/`. `frame_realism` construye el prompt
FINAL antes del plan y verifica sus roles/referencias dentro de la puerta actual.
Los recibos del frame conservan `hook_scene_aplicado`. Cuando el operador prepare
el clip con su frame nuevo aprobado, `lanzar.preparar` llama automáticamente a
`product_hook_flow.bind_video`: hereda los mismos roles y la acción, conserva el
prompt fuente aparte y pasa por las comprobaciones de vídeo vigentes. No enviar
el antiguo actor masculino ni modificar una solicitud histórica.

Las decisiones humanas siguen siendo elegir/encargar la prueba y los assets o
identidades explícitos, validar los cuerpos/ángulos cuando proceda y revisar los
resultados conforme controles vigentes. No hay nuevo formulario de referencias,
rotación, recibos o avatares libres, ni una nueva cola, aprobación o cron.
La automatización no certifica calidad visual: observar cada resultado frente a
las fuentes y respetar la decisión humana. No generar ni corregir el lote actual
por esta mejora. `defaults_version` conserva los snapshots ya preparados.

## Referencias de entorno orgánicas — orden 05/11/2026
Para todos los frames, seleccionar fotos cotidianas de móvil, con apariencia orgánica tipo iPhone; descartar fotografía profesional, sesiones de arquitectura/interiorismo, estudios, catálogos y renders. No afirmar dispositivo iPhone sin evidencia: validar apariencia y procedencia, no inventar EXIF. Si la acción es comprar en una tienda, exigir un comercio real: mercancía a la venta, estanterías, etiquetas u otras señales comerciales. Un guadarnés privado, estudio de diseño o exposición de equipamiento no sustituye una tienda ecuestre. Revisar este filtro tanto en la referencia como en el resultado generado. Mantener luz cotidiana y sujetos integrados, sin pose ni acabado publicitario. HoofHolly V1/V2/V3 entregados el 05/11/2026 quedan completamente rechazados por Emmanuel; conservarlos como histórico negativo, nunca como estilo o composición de nuevas generaciones. La caja y los charms aprobados mantienen su aprobación.

## Escala de producto con mano — 05/11/2026
Leer `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/SEEDANCE_ESCALA_MANO_20261105.md`. En nuevas generaciones Seedance adjuntar referencias del producto con mano de escala, basada en evidencia real del producto original. Para calendarios, cada charm exacto con su propia referencia de mano; conservar originales. No inventar centímetros ni regenerar históricos.

## Tiendas alemanas y logo real visible — 09/11/2026
Aplicar `memory/context/tiendas-alemania-pinterest-logo-20261109.md` del proyecto. Si no hay tienda explícita en instrucciones o texto de referencia, elegir Lidl, Action, Aldi o MediaMarkt con lógica de producto. Usar fotografías reales de Pinterest, verificadas, y mostrar el logo auténtico integrado en cartelería física del fondo. No sustituir por almacén genérico ni inventar marca/arquitectura. Una tienda expresamente indicada prevalece. Esta regla no acredita ventas o colaboración de la tienda.


## Identidad y realismo — 14/11/2026
En frames de testeos y lotes, usar exclusivamente el avatar elegido para identidad y facciones. Ignorar caras, edad, pelo y parecido de las referencias de realismo/estilo; no mezclar ni promediar identidades. Estas aportan textura fotográfica, y la iluminación sigue el entorno. Declarar los índices y papeles de las imágenes en el prompt. Fondo y composición no son identidad salvo asignación expresa. Aplicar a preparaciones nuevas sin alterar envíos aceptados.

## Referencia de supermercado · 19/11/2026
Para preparaciones nuevas usar únicamente la posición 2 activa con el rostro cubierto. Resolver los bytes y recibo por el SHA vigente del catálogo. El original archivado y sus antiguos IDs de subida son solo históricos.
