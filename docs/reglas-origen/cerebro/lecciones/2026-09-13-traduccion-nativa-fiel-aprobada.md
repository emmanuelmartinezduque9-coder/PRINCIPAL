# Traducción nativa y fiel — criterio aprobado

## Orden de Emmanuel

13 septiembre 2026, después de ver el hook de EisWerk C22 y pedir su significado:
«todos los textos que se traduzcan deben ser lo más parecido a como lo escribiría
una persona nativa de ese país, y el significado más fiel al de la referencia».
Expresó que este resultado era algo que llevaba tiempo buscando.

## Ejemplo real, no inventado

- Referencia: `Cozy Christmas nights are better with this 🎄🍦🤭`.
- Resultado alemán que aprueba: `Gemütliche Weihnachtsabende sind damit schöner 🎄🍦🤭`.
- Explicación en español: «Las acogedoras noches de Navidad son más bonitas con esto».
- Procedencia del original: `EDITOR/lotes/tanda_20260913_prueba_eiswerk/revision_textos.json`,
  referencia `2026-09-13-018`, primer overlay. La captura posterior muestra el resultado.
- El guion `Weihnachts- / abende` pertenece a la maquetación, no cambia la palabra.

## Qué conservar

Naturalidad nativa y fidelidad semántica son requisitos simultáneos. No hacer una
traducción literal torpe, pero tampoco reescribir libremente para vender más.
Conservar el tono orgánico, la intención, el humor, los hechos y la intensidad
del mensaje. No añadir beneficios, urgencia, promesas ni palabras comerciales.
Esta aprobación no demuestra rendimiento o conversiones ni autoriza cambiar otros
textos ya aprobados. No copiar este hook en conceptos ajenos.

## Aplicación

[[../reglas/traduccion-organica]] contiene el criterio y el ejemplo breve.
`EDITOR/reference_texts/codex_translation.py` carga ese archivo en cada solicitud
como instrucciones del traductor. La huella de las reglas forma parte de su caché:
las solicitudes futuras usan la regla actualizada; los snapshots y vídeos aprobados
se conservan. Los tests comprueban esta conexión y caché, no certifican por sí solos
que cualquier traducción futura tenga calidad de hablante nativo.
