# Un fallo no detiene todo el lote

Emmanuel autorizó expresamente: «si por supuesto, el resultado de un video no puede
para toda la produccion nunca».

Causa: lote_control exigía `generado` en todas las regeneraciones antes de permitir
cualquier frame, incluso tras un rechazo terminal del proveedor. Una dependencia
global de orden estaba funcionando como dependencia de éxito.

Corrección general: un recibo terminal del último job, vinculado a cuenta, lote y
elemento, permite continuar frames independientes. No basta una etiqueta de error
manual. No se modifica el prompt rechazado ni se repite el gasto. Se conservan el
error, su historial y el bloqueo de cierre del lote. Cada clip sigue necesitando
su propio frame aprobado y los controles de calidad correspondientes.

Pruebas: rechazo aislado, recibo ausente, trabajo todavía activo, identidad errónea,
nuevo intento pendiente, aprobación de frame y cierre de lote aún incompleto.
