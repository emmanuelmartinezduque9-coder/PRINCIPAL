# Reintento de frame sin imagen — permiso de Emmanuel, 2026-09-20

Si el proveedor termina `failed` con `result: null` o `result_url: null` explícito, Emmanuel autoriza
un reintento automático del mismo frame porque espera devolución de créditos.
Esto NO verifica la facturación ni permite afirmar que hubo reembolso.

En `production_engine.py`, añadir un nodo al mismo plan `rounds_append_only`,
con `replaces: <id original>` y `retry_no_image: {archivo, sha256}` apuntando al
recibo local del proveedor (`id` del job, `status: failed`, `result: null`
o `result_url: null`/`min_result_url: null`, tal como lo devuelve; todos los
campos de salida conocidos presentes deben ser nulos, sin URLs de preview ni
resultados contradictorios). La detección de moderación se limita a errores,
motivos de estado y metadatos, excluyendo prompt/input/request.
Mismo archivo de manifiesto, hash y archivos congelados. Máximo un nodo de
reintento por original; no cadenas. No aplicar a vídeos, estados inciertos,
pendientes, moderación, rechazos de seguridad ni resultados presentes.

Se conservan nodo/job original e historial `failed_no_image`, sin inventar un
rechazo del usuario. Se repiten las puertas normales de frame, preflight y
límite de intentos: este permiso no las relaja. No se crea ni envía el reintento
por el mero hecho de instalar esta regla. Recuperar recibos existentes sin
duplicar gasto. Un segundo fallo queda detenido para revisión.
