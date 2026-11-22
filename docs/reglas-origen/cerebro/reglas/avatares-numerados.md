# Avatares — orden de Emmanuel, 2026-09-09

## Incorporación obligatoria — orden 25/09/2026
Cada fotografía que Emmanuel aporte explícitamente como avatar debe importarse a
esta biblioteca y mostrarse en la app, aunque también se use como avatar fijo de
una cuenta. Conservar el original, deduplicar por hash, mantener el número y
asociar la cuenta indicada. No sustituirla por una identidad generada. Registrar
la selección en la ficha de cuenta y comprobar el panel tras actualizarlo.

La app tiene Avatares (#avatares). Registro único: EDITOR/avatares.json.
Los originales se conservan sin retoques en NanoBanana/_AVATARES; las copias visibles
están en _ENTREGA_DIARIA/_avatares, un directorio técnico sin vídeos ni cuenta asignada.
Los números de hombres y mujeres son independientes y permanentes: nunca ordenar para
renumerar, reciclar números retirados ni alterar PANEL/numeros.json.

«Cámbialo por hombre 4» significa consultar el registro, no inventar un hombre ni usar
el cuarto resultado de búsqueda. Se admite `avatar_selector: "hombre 4"` en frame.py,
o `avatar: "hombre 4"`. La puerta resuelve la referencia y registra selector, hash y media_id.
El prompt tiene que identificar qué persona visible se sustituye y qué imagen aporta
la identidad. Quitar cara_fija de extras cuando se elige un avatar; no mezclar retratos.
Para varias personas con avatares concretos, preparar una asignación explícita por sujeto;
no asumir que este selector singular ya implementa un reparto de varias identidades.

Cambiar un avatar para un frame NO cambia assets.json ni rehace los frames aprobados.
POV sin cara: sigue vigente la regla de no adjuntar retratos innecesarios.
Usar solamente las fotos entregadas/existentes, no generar nuevas identidades.

Alta de nuevas fotos (grupo indicado y archivos originales):

    python3 EDITOR/avatares.py importar manifiesto.json
    python3 EDITOR/avatares.py subir 'hombre N'
    python3 EDITOR/panel.py actualizar

Formato de manifiesto: lista de {grupo, archivo, descripcion, cuentas:[], media_id?}.
Importar no sube ni genera. Subir solo registra la foto en Higgsfield y se reutiliza.
Una foto exacta repetida conserva número. Fotos recomprimidas pueden tener entradas
distintas: no deduplicar por reconocimiento facial. No rescatar retratos descartados del
historial de cuentas; los avatares vigentes y alternativos conservados son los iniciales.

Los ocho adjuntos del 09-09: los cinco hombres son Hombre 1–5, las tres mujeres Mujer
11–13; Hombre 6 es la foto masculina ya entregada previamente. Mujer 10 y Mujer 11 son
dos archivos de la misma foto, el primero histórico y el segundo entregado en este mensaje;
se conservan ambos originales sin cambiar números.
