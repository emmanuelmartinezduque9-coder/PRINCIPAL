# Carpeta compartida entre testeos y creación de tiendas — 17/11/2026

Emmanuel solicita una carpeta que el chat CREACION DE TIENDAS pueda consultar por producto, con assets y contexto de los productos testeados.

Ubicación: `/Volumes/T7/AUTOMATIZACION SEGA/PRODUCTOS COMPARTIDOS`.
Entrada: `LEEME.md`, `INDICE.md` e `indice.json`. Cada ID conserva `PRODUCTOS/<ID>/CONTEXTO.md`, `producto.json`, `TESTEOS.md` y `assets/`. Los encargos con asociación no demostrada permanecen en `TESTEOS/<ID>/contexto.json`; no inventar correspondencias.

Ambos chats usan `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS` en el mismo Mac. No es acceso desde otro equipo, enlace público ni Drive. No se ha enviado un mensaje al otro chat ni interrumpido su trabajo.

Antes de crear una tienda o tras un alta/cambio de nombre, variante, embalaje, asset o contexto, ejecutar `python3 tools/sync_shared_products.py` con T7 montado. El sincronizador reutiliza archivos existentes y hashes; no genera ni modifica pedidos, fuentes ni la app. No reemplaza la autorización humana ni garantiza aprobación de assets disponibles.

El chat de tiendas debe leer la ficha y el expediente original enlazado, comprobar mercado/variante/embalaje/aprobaciones y respetar reglas web vigentes. No deducir producto por nombre/orden de imagen, no publicar datos o imágenes pendientes como aprobados. Preservar originales; derivados web van aparte.

Las fichas automáticas no se editan manualmente: registrar decisiones de tienda en TIENDA.md o actualizar fuente canónica. Las instrucciones explícitas nuevas de Emmanuel prevalecen sobre el registro. Sincronizar no corrige por sí solo registros históricos incompletos ni nombres desactualizados.
