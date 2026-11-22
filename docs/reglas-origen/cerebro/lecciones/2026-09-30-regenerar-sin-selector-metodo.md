# Regenerar conserva el motor; no hereda el selector de vídeos nuevos

Emmanuel pidió retirar «Método» de Regenerar concepto. La tarjeta usaba el mismo
formulario que Replicar y heredaba Genjutsu Motion Transfer, aunque el concepto
seleccionado estuviera guardado con Seedance.

En nuevos borradores de regeneración, `method=auto` significa heredar los motores
de cada clip de `concept_snapshot`, no elegir un motor distinto. Preparación liga
esa intención con `regeneration_engine_policy=saved_per_clip`. El compilador exige
el motor exacto por posición final; para Genjutsu exige también fuente y modo
guardados. La normalización protege frames frente a un selector Genjutsu viejo.

La interfaz muestra «Motor: el guardado en cada clip del concepto», sin selectores
de método ni modo Genjutsu. Frames, clips, avatar y cambios pedidos siguen aparte.
Replicar, Adaptar y Crear mantienen su selector y Motion Transfer como valor inicial.

Los items ya enviados no se normalizan de nuevo al guardar otras tarjetas. Los
snapshots históricos conservan sus comprobaciones. No se ha generado ningún vídeo
para probar este cambio: pruebas aisladas de navegador, preparación y compilador.
