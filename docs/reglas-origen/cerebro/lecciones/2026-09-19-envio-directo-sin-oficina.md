# Envío directo de lotes

Emmanuel pide eliminar la aprobación intermedia de Oficina y costes.
El envío desde la app es orden de producción con gasto normal autorizado.

Cambio: lote_app.submit conserva el snapshot y deduplicación, pero no llama a
oficina.new_request ni crea cuatro trabajos especialistas. Notifica directamente
a la tarea configurada en codex_handoff.json. Las pruebas verifican ausencia de DB
de Oficina y que los reintentos no duplican el envío.

La entrega en cola NO acredita generación ni finalización. Conservar estados
pending/uncertain y no reintentar un aviso incierto a ciegas. El seguimiento solo
abarca snapshots execution_mode=direct_codex, nunca lotes históricos.

El progreso se guarda junto al snapshot en .progress.json con execution_status,
blocked_items y deliveries: {item_id: {path: ruta_absoluta, verified: true}}.
Solo registrar verified tras revisar el vídeo real. Los frames nuevos mantienen
aprobación visual; una espera de un vídeo no bloquea los demás.
