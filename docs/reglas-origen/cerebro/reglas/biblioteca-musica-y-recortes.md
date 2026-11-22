# Música y criterio de edición · 2026-09-13

Textos desde enlace y sincronización local implantados después de esta regla:
ver [[textos-referencia-independiente]]. No equivalen a recorte semántico.

Emmanuel aprueba heredar edición, textos y música por concepto. La biblioteca de
canciones debe permitir MP3 local, número fijo, escuchar, adelantar y ver segundos.
Modo de encargo: «Canción 1 desde 30 s». No pedir enlaces ni volver a subir el mismo
archivo para cada vídeo. Guardar ese inicio en el concepto; el inicio habitual del
reproductor solo sirve de sugerencia para selecciones nuevas.

Secciones con nombres del usuario (13 septiembre): crear/renombrar desde la biblioteca
y asignar una canción a varias secciones sin duplicar su MP3. Filtros Todas/Sin sección
y por nombre; también disponibles en Textos desde un vídeo de Montaje. Quitar una
sección solo quita esa agrupación, nunca canciones ni sus selecciones guardadas.
IDs de secciones y números de canciones no dependen del nombre ni posición visual.
Implementación SQLite en `music_library.py`; pruebas `test_music_sections.py` y
`EDITOR/musica_secciones_20260913/ui_smoke.cjs` con una base aislada.

Implementación: `EDITOR/music_library.py`, `EDITOR/concept_edits.py`, pestaña
`/#musica`. `concept-edit/save` conserva revisiones; el compilador de conceptos las
hereda. Elegir música no implica aprobar un texto, un recorte o derechos comerciales.
El guardado local no envía al proveedor; la preparación de un montaje musical puede
subir el MP3 para que Creatomate lo lea. No exporta sin la confirmación vigente.

Los cortes de conceptos nuevos deben seguir acciones, no duraciones arbitrarias:
ejemplo, entrar cuando empieza a caminar y recortar el gesto de colocar caja en el
carrito. Los tiempos también deben revisarse en regeneraciones con gestos desplazados.
No inferir el punto exacto que el usuario no haya aclarado/aprobado.

Estado del recorte semántico: diseño de piloto, NO detector autónomo funcionando.
Ver `EDITOR/edicion_heredada/RECORTES_POR_ACCION.md`. No confundir una descripción de
Memories con verificación precisa de un evento. No afirmar que «aprende solo» por
guardar notas; exigir resultados comparados con los cortes aprobados del usuario.
