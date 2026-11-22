# Guardar al terminar, presentar la ronda entera y montar por concepto

## Corrección de Emmanuel

Los vídeos terminados no estaban todos en sus carpetas; se pedía opinión de una
parte de los frames mientras otros ni siquiera se habían generado. La preparación
de Genjutsu volvía a exigir reconstrucciones innecesarias del vídeo original.
El volumen también hacía difícil saber cuál publicar a continuación.

## Causa y cambio estructural

Separar trabajo técnico y opinión humana, no añadir más coordinadores. Inventario
global inmutable y barrera de ronda en `lote_control.py`; recibos durables y guardado
por resultado en `video_recovery.py`. El original rechazado se conserva con su
veredicto: no se convierte en entrega final ni se ofrece para montaje.

Genjutsu usa `prompt_estandar`, sin Memories ni guion de escenas. Sigue requiriendo
un envío MCP real: una reserva es pendiente de envío, jamás un vídeo generado.
Regeneraciones conservan comparación literal y las resoluciones vigentes.

Vídeos de Oficina/Equipo se envían sin mantener el bloqueo de registro durante el
render. El colector continúa mientras la app permanezca encendida. Las comprobaciones
de archivos y prompts son idempotentes; un envío incierto no se repite.

Montaje automático directo RenderScript: orden registrado, recortes y textos/música
de la ficha si existen, audio conservado por defecto y `contain` sin recorte añadido.
No inventar textos o música ausentes. Cola por cuenta/red: revisar final exacto antes
de listo; confirmar publicación manual. Historia desconocida no equivale a pendiente.

## Límites explícitos de esta implantación

No se ha lanzado una generación ni un render de pago para medir el nuevo tiempo real.
No hay publicación automática ni calendario remoto. El servicio local necesita el Mac
encendido. Los frames todavía mantienen exclusión durante su proceso legacy; los
vídeos ya liberan la espera. Cambiar assets/reglas sigue invalidando planes; cambios
de clips o biblioteca no usados no deben invalidar el resto del lote.
El upscale pagado de clips sin caras mantiene su autorización y puerta habitual;
el colector no lo inicia a escondidas. La conservación del original es inmediata.

Pruebas reproducibles: `EDITOR/test_produccion_rondas.py` y suites existentes; evidencia
de recuperación en `EDITOR/redisenio_20260912/recuperacion_verificada.json`.
La revisión con graphify era anterior a estos módulos: el diagnóstico se basó en
código actual y se priorizaron esperas/entregas, siguiendo process-optimization.
