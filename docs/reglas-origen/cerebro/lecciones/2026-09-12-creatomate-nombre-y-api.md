# Buscar la plantilla real por API y separar variación de actualización

Emmanuel confirma el nombre MAQUINA DE HELADOS y pide priorizar Creatomate sin
controlar el PC. GET `/v2/templates` devuelve ese nombre y su ID; GET por ID
permite inspeccionar toda la plantilla. No hace falta buscarla visualmente.

La versión consultada tiene únicamente Text-1. No inventar vídeo/música existentes.
No convertir la escala 50 % ni la duración 5,38 s en valores elegidos por el agente.

La documentación pública vigente SÍ permite crear y actualizar plantillas por API.
Distinguir modificaciones de una exportación de cambios permanentes con PATCH;
estos últimos reemplazan el source completo cuando se incluye ese campo.
No presentar limitaciones de nuestro cliente GET/POST como límites del proveedor.

Graphify registra ya esta integración como una búsqueda sin cobertura: no
reconstruir el grafo ni repetir recorridos vacíos. La evidencia para esta tarea
proviene del código actual, la API autenticada y la documentación oficial.

Ficha operativa: [[sistema/creatomate-maquina-helados-api]].
