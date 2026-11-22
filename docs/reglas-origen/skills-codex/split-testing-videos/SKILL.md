---
name: split-testing-videos
description: Preparar y evaluar variaciones controladas de vídeos orgánicos ganadores, reutilizando ediciones y cambiando una variable por versión. Usar junto con variaciones-textos-ganadores para lotes diarios y pruebas de textos, ganchos, sonido o tomas.
---

# Split testing de vídeos orgánicos

## Método y fuentes
Basado en el vídeo de Kevin Martins [How To Split Test In AI Organic Dropshipping](https://www.youtube.com/watch?v=b3xKO_MABXg). Leer [references/metodo-video.md](references/metodo-video.md) para los pasajes y límites del método. Es una comparación de publicaciones orgánicas, no un experimento aleatorio que pruebe causalidad.

1. Recuperar cuenta, mercado, publicaciones, métricas y proyectos originales. Elegir un vídeo que destaque respecto a publicaciones comparables de la misma cuenta. Registrar muestra, fecha y antigüedad; no imponer un umbral universal de vistas ni confundir vistas con ventas. Si solo hay evidencia histórica, identificarla como histórica. Si no hay ganador propio, probar un concepto sustentado de la competencia como candidato, sin atribuirlo al usuario.
2. Revisar el vídeo real y descomponer gancho visual, texto sobreimpreso, caption, habla, cuerpo, música, fondo, duración y ritmo. Una miniatura no acredita la secuencia ni la letra completa. Recuperar receta y fuentes limpias: no tapar texto incrustado con otro texto ni regenerar originales por comodidad.
3. Conservar una base identificada por archivo/hash, receta y URL publicada. Definir por variante una hipótesis y UNA variable principal: texto sobreimpreso, caption, gancho visual, música o metraje. Mantener las demás constantes. Dos variantes de texto se comparan con la misma base, no entre versiones que además cambian música y clips. Si el nuevo gancho exige variar duración o sincronía, registrar esos cambios como factores adicionales; no llamarlo prueba aislada de texto.
4. Para texto, leer y aplicar la skill `variaciones-textos-ganadores` en `../variaciones-textos-ganadores/SKILL.md`: evidencia propia/competidora, coherencia con imágenes, idioma nativo y traducción española de cada propuesta. No añadir prestaciones, ofertas, tiendas o testimonios. Una candidata nueva no es todavía ganadora.
5. Duplicar en destinos nuevos. Preservar originales, aprobaciones y hashes. Seguir reglas vigentes del proyecto para edición, audio, cortes y revisión independiente. Una autorización para reutilizar vídeos no aprueba automáticamente frames nuevos ni permite repetir generaciones aceptadas. Preferir material ya aprobado para ahorrar trabajo y créditos.
6. Entregar los archivos o proyectos realmente preparados, con estado exacto y tabla base→variante→cambio. No sustituir nueve vídeos por nueve filas de un plan ni afirmar revisión visual/escucha a partir de tests técnicos. Registrar dependencias pendientes y continuar cuentas independientes.
7. Tras publicación autorizada, asociar URL, plataforma, fecha y métricas disponibles. Comparar a edades equivalentes (por ejemplo 24/48/72 horas si se eligieron esas ventanas), separando plataformas y métricas de alcance, interacción y ventas atribuibles. Los horarios, audiencias y azar son factores de confusión. Repetir la señal antes de generalizar; reutilizar la mejor versión como siguiente base sin prometer resultados.

## Adaptación por plataforma
Facebook: el vídeo propone probar repost exacto o cambios pequeños. Instagram: recrear partes o variar gancho/cuerpo, admitiendo que a algunas cuentas les funciona el mismo cuerpo. TikTok: priorizar recreación y mejora de ejecución. Son hipótesis del autor que deben contrastarse con la cuenta, no reglas oficiales ni garantías de distribución. No convertir afirmaciones anecdóticas sobre programación, intervalos o penalizaciones en prohibiciones.

## Lotes diarios de Emmanuel
Orden posterior de Emmanuel: piloto de DOS vídeos diarios por cuenta (seis total), no tres. El ejemplo posterior de tres vídeos ilustra la numeración y no cambia esa cuota. Ver [references/cuentas-emmanuel.md](references/cuentas-emmanuel.md).
Secuencia expresamente elegida: si un vídeo viraliza, regenerar SOLO el gancho conservando cuerpo, textos, canción y edición. Si esa variante vuelve a funcionar, aplicar una variación pequeña de texto/emoji. Para renovar metraje, variación visual Genjutsu conservando concepto. No sustituir este flujo por cambios de caption ni por pruebas exclusivamente textuales. Mantener revisiones de frames/clips y reglas de generación existentes.

## Vinculación automática desde entregas nuevas
Emmanuel publicará en el orden numerado de entrega. No exigir tablero ni pegado manual habitual de enlaces. Leer [references/vinculacion-entregas.md](references/vinculacion-entregas.md) antes de entregar o revisar Instagram. Guardar edición recuperable, fuentes y numeración antes de entregar; comprobar visualmente la asociación propuesta por fecha/orden. No atribuir métricas a coincidencias ambiguas ni asumir que un retraso desplaza toda la cola.

La preparación diaria no equivale a publicación automática. Usar la herramienta de automatizaciones cuando el usuario encargue recurrencia; guardar prompt, cuentas, ruta, deduplicación por fecha/cuenta/variante, pendientes y notificaciones solo relevantes. No crear cron alternativo ni afirmar ejecución futura por tener esta skill. Mantener autorizaciones de publicación y generación separadas del archivo de instrucciones.

## Registro mínimo
Por variante: experiment_id, fecha, cuenta/propietario, plataforma, mercado, base_id/URL/hash, evidencia y métricas observadas, hipótesis, variable, constantes, texto original y variante con translation_es, fuentes/receta, salida/hash, revisiones reales, estado, URL publicada y métricas con fecha/edad. Reutilizar registros existentes para evitar duplicados; no sustituir desconocidos por ceros.

## Regla fija de tandas delegadas — 29/10/2026

Dos vídeos por cuenta significan DOS ORIGINALES GANADORES DISTINTOS, con una primera variación de gancho de cada original. Para TargetAlarm, ZielAlarm y Nailuna son seis linajes independientes. No entregar dos variantes de una única base como si cumplieran la cuota.

Paso 1: regenerar exclusivamente el gancho mediante Genjutsu normal Motion Transfer (`hf_mult_motion_control`), conservar texto, canción y estructura de edición de su propia referencia. Reconstruir la edición base cuando fue manual; documentar diferencias necesarias. Paso 2, tras evaluar el resultado: variación mínima de texto/emoji. Renovación visual posterior según resultados. No sustituir paso 1 por cambio de caption.

TargetAlarm y ZielAlarm: cuerpos exclusivamente IMG_0523.mov, IMG_0525.mov, IMG_0527.mov e IMG_0528.mov aportados por Emmanuel. Elegir por contenido y continuidad observados; no regenerar cuerpos. Nailuna conserva su cuerpo recuperable correspondiente.

Guardar fuentes, hashes, cortes, textos editables, canción/fragmento, receta recuperable, original padre y numeración cuenta-fecha-número. Emmanuel publica en ese orden; confirmar asociación visual además de cronología antes de atribuir métricas.

Entregar MP4 finales descargables y subirlos a la carpeta existente de Drive «Videos Emanuel» tras identificar su ID/cuenta. No crear sustituta ni afirmar subida sin recibo verificable. Mantener aprobaciones y revisión real vigentes. La regla escrita no acredita cambios desplegados ni vídeos producidos.
