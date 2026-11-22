# Cortes exactos y verificación independiente — 20/10/2026

Orden de Emmanuel: aplicar a TODAS las nuevas ediciones. Al reutilizar un cuerpo
desde el segundo/tercer clip, ningún frame del anterior puede quedar al principio,
entre tomas ni al final. El nombre o número del archivo no acredita su contenido.

Antes de renderizar, el responsable analiza los medios reales y un revisor
independiente comprueba los límites en frames consecutivos y sus PTS. Registrar
fuente/hash, clip solicitado, primer frame incluido, último exclusivo, observación
visual y mapa de frames cuando cambian FPS/velocidad en `cut-plan.json`.
Revisar TODAS las tomas retenidas, no solo el primer empalme. Un detector de cambios
de escena propone candidatos: no equivale a identificar semánticamente clip 2.

El editor recorta por frames exactos mediante `cut_integrity.trim_filter`, nunca
copiando por keyframe ni restando segundos aproximados. Renderizar en archivo
nuevo; conservar originales, música, textos, jobs y aprobaciones.

`EDITOR/cut_integrity.py` es un consumidor independiente de solo lectura: decodifica
el montaje completo y contrasta cada frame con los intervalos revisados. Exigir
recibo `verified:true`, vinculado al hash exacto del montaje. Si falta evidencia,
hay diferencia, FPS ambiguos o transformación no contemplada, bloquear entrega y
resolver localmente el plan/corte; NO regenerar clips ni gastar créditos.
El mismo agente editor no debe inventar la revisión independiente. Utilizar un
revisor separado para la selección visual; el módulo no comprende escenas.

Puertas implementadas en el código local: autoedit comprueba el ensamblado y el
final con textos antes de entregarlo. completed_batch_catalog exige recibo válido
para publicaciones editadas nuevas o modificadas; conserva los finales ya
publicados sin cambiarlos. Los scripts de entrega directa que no pasan por estas
puertas aún requieren integración explícita: no afirmar cobertura global.

Integración de autoedit: `Worker.render` exige plan antes de render y audita
`assembled.mp4` antes de texto/audio. Para otros montadores, exigir este control
antes de publicar: no se da por cubierto un ejecutor por esta regla documental.
Las salidas históricas no se reexportan ni se certifican retroactivamente.

Regresión: cuatro frames residuales V4/V6 y flash intermedio deben fallar;
intervalo correcto pasa; hashes cambiados y mapas ambiguos bloquean.
