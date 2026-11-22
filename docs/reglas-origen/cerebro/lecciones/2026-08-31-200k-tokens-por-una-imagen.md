# 200k tokens por una imagen

**Fecha:** 2026-08-31 · **Ámbito:** GLOBAL

**Qué pasó:** Una sola imagen consumió del orden de 200k tokens de Claude entre iteraciones.

**Por qué pasó:** El gasto de Claude sube por salidas largas y texto repetido, no por descargar: abrí (Read) imágenes que no hacía falta analizar, re-pegué prompts largos en el chat y volqué salidas de terminal enteras — y cada iteración lo multiplicaba todo otra vez.

**Regla que dejó:** No abrir imágenes salvo análisis de verdad (un frame aprobado se descarga SIN abrirlo: Emmanuel ya lo ve en el widget). Los prompts largos viven en archivos y se referencian por ruta. Salidas de terminal recortadas (`head`/`tail`/parse a 1 línea). Operaciones agrupadas en un solo paso (generar→descargar→archivar). Ver [[reglas/globales]].

Aplicada por: ninguna puerta todavía — sigue siendo disciplina (sección EFICIENCIA DE TOKENS de CLAUDE.md).
