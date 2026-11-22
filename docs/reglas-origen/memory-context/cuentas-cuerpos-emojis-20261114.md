# Regla fija del motor — cuentas y cuerpos · 14/11/2026

Orden expresa de Emmanuel: aplicar al selector «Añadir cuerpo» la misma exclusión visual de cuentas que a «Preparar lote». Nunca borrar cuentas, conceptos, vídeos ni selecciones ya guardadas. Filtrar también los resultados, no solo las opciones del desplegable. Las cuentas nuevas permanecen disponibles salvo exclusión expresa.

Todas las cuentas se presentan con emoji identificador, conservando su ID interno: FableSeat 👑, EisWerk 🍦, HaarZauber 💇‍♀️, FensterFunkeln ✨, WinterDurchblick 🚘, RadBlink 🚲, ZauberSchirm ☂️. Cuenta nueva sin emoji específico: 🏷️ hasta asignarlo, nunca etiqueta vacía de emoji.

Cada vídeo generado y verificado debe incorporarse automáticamente a la biblioteca reutilizable de su propia cuenta; si falta el contenedor de cuenta, crearlo con los datos del pedido autenticado. Usar `submitted_video_context.run/cycle` → `completed_batch_catalog.after_cycle`, que registra por item listo, sin esperar otros items, deduplica por jobs y origen y conserva hashes y referencias. No declarar cerrado el trabajo sin comprobar publicación y cobertura. Un fallo de catálogo se repara sin regenerar ni pagar el vídeo otra vez.

La visibilidad y el registro son independientes: una cuenta oculta conserva todos sus archivos y registros. Registrar un vídeo no lo convierte semánticamente en un cuerpo: conservar su rol y orden reales y excluir el gancho anterior al reutilizar automáticamente. No añadir automáticamente un resultado fallido, incierto o sustituido como cuerpo verificado.

Verificación de esta corrección: pruebas de inicialización de cuentas existentes/nuevas y aislamiento de propietario en `test_catalog_account_bootstrap.py`; prueba del selector en `EDITOR/patches/account-body-visibility-20261114/test.cjs`. La ruta automática ya existía; la reparación visual no la sustituye ni crea otra cola.
