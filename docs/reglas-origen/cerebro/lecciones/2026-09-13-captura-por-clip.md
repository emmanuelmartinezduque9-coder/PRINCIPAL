# Captura por clip: cerrar el flujo, no seguir posponiéndolo

Emmanuel aprobó partir de un concepto existente y sustituir solo el clip elegido con una captura. La implementación se fue posponiendo mientras se añadían cambios visuales. Una propuesta explicada y unos desplegables no equivalen a la función pedida.

La función debe cubrir carga real, miniatura, guardado tras recargar y despacho de la referencia al clip exacto. No basta un botón o un campo de enlace. No pedir otra confirmación de una implementación ya autorizada.

`EDITOR/lote_captures.py` almacena bytes originales, valida imágenes estáticas y usa SHA-256. `EDITOR/lote_app.py` guarda la asociación por clip y la congela en el encargo. `PANEL/lote.js` ofrece Subir/Cambiar/Quitar captura junto al selector de frames. No se envía a Higgsfield al subir ni se modifica el registro canónico. La captura es referencia para crear un frame pendiente de aprobación, nunca el frame generado ni su aprobación.

El resto de clips y las selecciones de textos/música se conservan. La variante se prepara en el borrador; no se asigna ni sobrescribe un concepto numerado durante la carga. El constructor arbitrario de escenas nuevas sigue fuera de este cambio; Crear desde cero acepta la referencia de un primer clip con su idea.

Regresiones: `EDITOR/test_lote_captures.py` y `EDITOR/lote_captures_e2e.cjs` (servidor aislado). Deben probar persistencia, reemplazo, duplicación independiente, desvinculación sin borrar el archivo, rechazo de capturas inválidas/cambiadas y plan que no reutilice el frame antiguo en el clip afectado. No confundir estas pruebas con calidad de generación.
