# Genjutsu: padding técnico autorizado permanentemente

Orden expresa de Emmanuel, 24/10/2026. Esta regla sustituye la necesidad de
preguntar por cada referencia demasiado corta; no sustituye las demás puertas.

## Regla

- Nunca preguntar a Emmanuel por el padding técnico de una referencia Genjutsu
  cuya toma autorizada dure menos que el mínimo exigido por el modelo concreto.
- Completar una copia de trabajo hasta ese mínimo repitiendo únicamente el último
  fotograma de la toma autorizada. No incorporar frames de la escena vecina,
  alargar el intervalo fuente, repetir acciones ni inventar una continuación.
- Preservar íntegro el original, su ruta contractual, hash y snapshot inmutable.
  Registrar por separado la copia derivada, intervalo real y duración añadida.
- En la edición posterior quitar íntegramente el añadido técnico. No confundir
  la duración nominal de la salida con el límite visual real: observar el resultado
  y revisar por frames/PTS el último frame útil y el empalme. Ningún frame de la
  escena vecina ni del relleno técnico debe sobrevivir. Preservar voz/palabras;
  si no es posible verificar ese límite, mantener la entrega pendiente.
- No usar esta autorización para cambiar motor, ampliar creativamente la toma,
  regenerar históricos, repetir jobs aceptados ni eludir aprobaciones de frames,
  preflight, deduplicación, aislamiento de propietarios o revisión independiente.

## Pedido actual y futuros encargos

El pedido actual identificado por Emmanuel como `cf98...34` está expresamente
autorizado para esta operación. Es un identificador abreviado, no un ID ejecutable:
el responsable debe usar el ID completo del pedido admitido y su hash real, sin
adivinarlos. Este documento no modifica ni autoriza ejecutar otros pedidos.

La misma decisión técnica se aplica a futuros encargos Genjutsu ya autorizados:
no solicitar de nuevo consentimiento de padding. No inicia generación por sí sola.

## Integración normal existente, sin rebajar controles

Inspeccionado `EDITOR/submitted_order_context.py`: `prepare_source_segment` acepta
un recibo `authorization` dentro de `scope['preparation']`; comprueba `order`,
`snapshot_sha256`, inclusión del item en `items` e `instruction_literal`.
`validate_source_segment` vuelve a comprobar esos vínculos y el hash del recibo.
La extracción existente usa `tpad=stop_mode=clone` y conserva la fuente original.

El responsable registra esa evidencia por pedido como aplicación de esta orden
permanente, NO como una nueva respuesta humana ni como aprobación visual. Debe
mantener los campos exigidos por la ruta existente, y añadir:

- referencia a este documento y su SHA-256 realmente leído;
- autoridad: instrucción expresa de Emmanuel del 24/10/2026;
- cita literal de la autorización humana realmente recibida, sin presentar una
  paráfrasis como cita; interpretación técnica en un campo separado: completar
  último frame y retirar íntegramente el añadido sin escena vecina;
- fuente/hash, intervalo autorizado, FPS/PTS y último frame observado;
- modelo y mínimo vigente comprobado, duración real y duración añadida;
- `remove_padding_in_final: true` y obligación de revisión independiente del corte.

No reutilizar un recibo de otro pedido ni inventar revisión, hash o consentimiento.
No sobrescribir recibos existentes distintos; reconciliar antes de continuar.
La documentación no autoriza eludir el rechazo existente de combinaciones no
soportadas, por ejemplo extracción frame-exact con padding. No modificar snapshots
para acomodar esas restricciones. Cualquier incompatibilidad real de integración
se resuelve como trabajo técnico acotado, no como nueva pregunta de consentimiento.

## Alcance comprobado

Esta entrega registra la política y su referencia de lectura en AGENTS. No cambia
código del motor, no crea recibos por item, no prepara medios, no envía jobs ni
certifica un final. La ruta existente admite recibos ligados al pedido; no se ha
ejecutado aquí y no se afirma resolución automática global de la autorización ni
eliminación automática del padding. Main conserva la producción de frames y las
verificaciones de la orden actual.
