# Conservación, continuidad y contraste real

Emmanuel preguntó por vídeos terminados que no estaban en sus carpetas y por qué se había dejado incompleto el lote.

## Causas verificadas

- `entregar.py` detenía todo el archivado al fallar la revisión: ocho originales existían en `EDITOR/revisiones_video`, pero no en la carpeta de su cuenta/concepto.
- Una pregunta de estado se había tratado como cierre del trabajo, aunque quedaban generaciones autorizadas y revisiones realizables.
- Los Q&A completos de Memories también contenían errores: pelado de adhesivo descrito como batería, cortes y tiempos desplazados, dirección de barrido invertida y cantidad/disposición de cajas inventada. Un análisis completo no garantiza que sea correcto.

## Cambios y límites reales

- `entregar.conservar_revision` conserva el original íntegro, prompt y veredicto en `_REVISION/<job>` con comprobación SHA-256 e identidad. No sustituye el final, no pasa a entrega diaria y no autoriza upscale. Pruebas: `EDITOR/test_archivo_revision.py`.
- Las consultas de estado no cancelan ni completan el encargo. Continuar el trabajo autorizado; informar el bloqueo real sin ocultarlo como terminado ni gastar en intentos adicionales no autorizados.
- Antes de pagar un largo: Q&A real, original MP4, cronología y acciones contrastadas, prompt final con ledger y revisión independiente ligada al hash. Conservar la respuesta original de Memories y documentar cada corrección mínima; no falsificar el análisis para hacerlo coincidir.
- Después de generar: revisar el original, no solo el frame ni el prompt. Un preflight aprobado no demuestra obediencia del generador. C5/012 falló encuadre y cantidades pese al prompt revisado y quedó SUSPENSO, con archivo conservado.
- ASR y otro Q&A del mismo servicio no son dos escuchas humanas independientes. No certificar una palabra, acento o sincronía si no se ha escuchado; conservar dudas explícitas.

Evidencias: `EDITOR/lotes/tanda_20260911/archivos_retenidos.json`, `memories_qa/`, `estado_largos_vigente.json` y `EDITOR/preflight_integridad/`.
