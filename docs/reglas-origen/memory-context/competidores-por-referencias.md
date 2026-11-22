# Competidores por referencias — orden de Emmanuel, 17/10/2026

Al añadir enlaces para replicar, registrar la cuenta de origen como competidor/inspiración de la cuenta de destino. Agrupar por cuenta propia y perfil de origen; conservar cada vídeo fuente sin duplicar enlaces equivalentes. No suscribir, contactar ni seguir cuentas.

Implementación activa: `EDITOR/competitor_registry.py`, integrado en el guardado controlado de `local_access_store.batch_save`. Persistencia en `competitor_sources` del lote, separada por propietario; no depende de localStorage. Consulta autenticada: GET `/api/lote-app/competitors`; botón «Ver competidores» en lotes.

Un permalink sin autor no acredita identidad. Queda como `pending_identity`. Al analizar la fuente real para producción, identificar al publicador desde evidencia real y completar por POST autenticado `/api/lote-app/competitor-resolve` con id, revision, source_url y profile_url. No deducir el autor del producto, título, marca visible o ID del reel. Esta resolución requiere la sesión y CSRF normales; no extraer credenciales ni saltar controles. El servidor de la app no hace consultas salientes: conserva su aislamiento de red.

Cuando Emmanuel pida competidores, recuperar el registro vigente, separado por sus cuentas, con perfil y enlaces de inspiración. Distinguir claramente pendientes sin autor; no presentarlos como cuentas identificadas. Conservación al quitar tarjetas y en guardados repetidos. Los lotes anteriores se incluyen en la consulta a partir de sus referencias conservadas, sin modificar sus encargos inmutables.
