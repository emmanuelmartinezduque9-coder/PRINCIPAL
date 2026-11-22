# Cierre verificado del catálogo — 19/10/2026

## Corrección ejecutable — 23/10/2026
`completed_batch_catalog.after_cycle` publica por item cuyos clips estén TODOS
terminados y verificados, sin esperar otros items fallidos del lote. Mantiene
`batch_complete=false` mientras falten entregas. `catalog_coverage_audit` descubre
los items esperados leyendo la cola y el snapshot (no el bundle del publicador);
`catalog_completion_audit` relee catálogos, miniaturas y archivos tras publicar.
Un mismo origen con jobs distintos se bloquea para reconciliar la corrección,
nunca se duplica. Importaciones requieren su evidencia específica. Un único
reinicio del panel por ciclo con cambios, ninguno si no cambió el catálogo.
Los históricos sin metadatos de origen modernos requieren reconciliación: no
crear duplicados por el mero aviso de cobertura. No afirmar cobertura global
si hay conflictos, importaciones pendientes o archivos ausentes.
Recuperación comprobada: `EDITOR/patches/catalog-recovery-20261023/published-01/`:
64 conceptos publicados y auditados; pareja HAARZAUBER lote105 V4 = C20.
La vista del montaje admite también el recibo antiguo `delivery-status.json`
en la raíz del preparado, ligado al item y la cuenta, sin crear nuevos vídeos.

Al finalizar un lote completo, incluidos los tests por chat, publicar conceptos,
frames aprobados y cuerpos existentes mediante completed_batch_catalog.after_cycle.
Después ejecutar catalog_completion_audit: consumidor independiente de solo lectura
que relee ambos catálogos, registro, previews y hashes de cuerpos. Guardar su recibo.
Sin verificación satisfactoria no declarar completa la entrega; conservar los jobs
done y sus recibos para no regenerar ni gastar créditos por fallos de publicación.
Las ediciones finales se vinculan con catalog-final-edits.json, con recibo, hash y
origen Topaz/nativo comprobados; conservar la entrega previa y los originales.
Comprobar también que la interfaz ofrece el cuerpo para seleccionar. No activar
lotes históricos, ampliar permisos ni inventar aprobaciones. El auditor automático
es un módulo separado; no implica un agente LLM autónomo en segundo plano.

## Entregas importadas por Emmanuel — 22/10/2026
Una importación editada necesita publicación y auditoría propias, sin marcar
el job original fallido como completado ni esperar a que ese job termine.
Verificar autorización, recibo de importación, hashes, frame y final editado;
publicar por completed_batch_catalog.publish y comprobar catalog_completion_audit.
Guardar recibo por importación, sin declarar completo el resto del lote.
Caso reparado: lote59 vídeo3 → EISWERK C110, mediante
EDITOR/publish_order59_imported_v3.py. Esta ruta reparadora no es un servicio
autónomo: el agente debe ejecutar el cierre al incorporar futuras importaciones.
