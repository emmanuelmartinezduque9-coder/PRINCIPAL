---
name: variaciones-textos-ganadores
description: Investigar y adaptar variaciones de textos orgánicos ganadores de cuentas propias y competencia al preparar ganchos y capas editables de CapCut en el proyecto Nano Banana. Usar para seleccionar copy, localizarlo por mercado y asociarlo a clips aprobados; no para generar imágenes ni publicar vídeos.
---

# Variaciones de textos ganadores

## Resultado y alcance

### Edición autorizada de Emmanuel — prioridad 24/10/2026
Antes de adaptar textos, tiendas, marcas o emojis leer
`/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md`
y `CEREBRO/reglas/criterios-edicion-obligatorios.md` del proyecto.
Preservar tienda explícita del lote/chat. Si es incompatible con el mercado y
no se especificó sustituta, preguntar; no elegir una automáticamente. Adaptar
marca y emojis al producto real, preservando intención y sin añadir afirmaciones.
Registrar original/adaptación/motivo y traducción española. Revisión independiente
contra notas originales y final, no solo contra el plan de textos. Un encargo
expreso de edición final/exportación prevalece sobre la entrega editable antigua
de esta skill; no autoriza publicación externa ni generar clips adicionales.

Preparar cada proyecto autorizado con un texto compatible con su gancho: combinar ganadores propios, ganadores recientes de la competencia y variantes cercanas de esos mensajes. No cambiar clips aprobados para acomodar un texto ni generar combinaciones adicionales sin encargo. En el flujo de Sebastián está excluida la preparación de CapCut salvo nueva orden explícita.

Proyecto: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS`.
Antes de escribir capas leer `CEREBRO/reglas/traduccion-organica.md`, `EDITOR/CAPCUT.md` y `.cursor/rules/entrega-preparada-editable.mdc` del proyecto. Conservan prioridad las reglas vigentes y las elecciones explícitas del usuario.

## Fuentes persistentes

ZielAlarm: Emmanuel confirmó el 02/10/2026 que su cuenta es https://www.instagram.com/ziellwecker/ . Para este producto leer [references/ziellwecker.md](references/ziellwecker.md); distinguirla de la referencia competidora TargetAlarm.

Leer [references/targetalarmm.md](references/targetalarmm.md) como caso real inicial, no como ranking siempre vigente. La referencia de producto aportada es https://www.instagram.com/targetalarmm/reels/ . No asumir que TargetAlarm es una cuenta propiedad del usuario ni sustituir el ID interno ZielAlarm sin comprobar su ficha.

Para cada producto conservar, en su expediente de investigación, las URLs propias y competidoras, papel de cada cuenta, mercado y fecha de consulta. Reutilizar los enlaces ya guardados antes de pedirlos. Tener un enlace NO garantiza acceso permanente: comprobar disponibilidad con el navegador o conector autorizado. Si falla, usar evidencia archivada indicando antigüedad y registrar el bloqueo; no inventar actualidad ni bloquear otras cuentas.

## Selección basada en publicaciones

- Revisar una muestra reciente comparable y los ganadores históricos relevantes. Abrir los reels candidatos: distinguir texto incrustado, caption y habla. Una miniatura no demuestra el texto completo del vídeo.
- Registrar URL del reel, fecha visible de publicación, fecha de consulta, reproducciones y métricas visibles, texto observado y parte revisada. Ausencias quedan como desconocidas. Conservar la grafía original antes de adaptarla.
- Comparar dentro de la misma cuenta y antigüedad aproximada. No decidir por likes brutos entre cuentas diferentes ni tratar un fijado antiguo como tendencia actual. Incluir ejemplos de menor alcance para no llamar ganador a todo.
- Agrupar por familia: destinatario, relación, ocasión, problema, curiosidad, contraste y acción de compartir. Separar reaparición del mismo texto de una variante realmente nueva. Reutilizar metraje no demuestra que SOLO el texto causó el alcance.
- Usar datos propios existentes de rendimiento para priorizar ganadores propios; si faltan no sustituirlos con la competencia. Registrar internamente limitaciones sin repetir advertencias genéricas en cada respuesta al usuario.

## Adaptación al gancho

Siempre que se presenten textos o variaciones a Emmanuel, incluir junto a CADA texto su traducción natural al español, también para originales citados. Guardar `translation_es` junto a `variant_text`. La traducción es para revisión: en las capas del vídeo solo va el idioma del mercado, salvo petición distinta.

Mantener el mecanismo del mensaje que funciona. Cambiar una dimensión principal por variante (destinatario, ocasión o formulación), evitando sinónimos vacíos. No imponer una cuota fija de variantes; producir las necesarias para los proyectos del encargo y deduplicarlas.

Asignar textos a lo que se ve: un regalo admite destinatario/regalo; un destape admite curiosidad y revelación; una reacción admite sorpresa. No usar una afirmación que las imágenes contradigan ni inventar características, precios, descuento, resultados o testimonios.

Traducir como un nativo del país, conservando intención y tono orgánico, no publicitario. No traducir mecánicamente nacionalidades o bromas culturales. Un enfoque de venta nuevo necesita la validación de ángulos del proyecto; una variante de redacción dentro del ángulo autorizado no añade una revisión extra.

El CTA del caption NO pasa automáticamente al overlay. Conservar la keyword de la cuenta destino cuando corresponda; no heredar `Alarm` en un producto distinto ni introducir un CTA que el encargo no incluye.

## Entrega trazable a CapCut

Guardar una selección por proyecto en el expediente del lote, con:

`project_id`, `account`, `market`, `hook_id`, `angle_id`, `family`, `source_kind` (own/competitor), `source_reel_url`, `source_text`, `observed_at`, `metrics`, `variant_text`, `variation_axis`, `status` (observed_winner/candidate), y los IDs de segmento/capa destino.

Una variante escrita ahora es candidata, no ganadora demostrada. Mantener un control fiel al ganador si el encargo permite varias versiones; no duplicar proyectos solo para llenar una matriz.

Convertir la selección en el `text_plan` admitido por `EDITOR/capcut_projects.py`: IDs reales de segmentos o plantilla, texto íntegro y tiempos dentro de la duración disponible. Conservar tipografía, contorno, música y efectos de la copia autorizada. CapCut cerrado al escribir, backup e idempotencia por proyecto y plan. Si falta el enlace de proyecto o el estilo, registrar el pendiente sin sobrescribir otro.

Verificar leyendo el proyecto que las capas contienen el texto elegido, que sus tiempos son válidos y que clips/audio siguen accesibles. No exportar; entregar «Listo para retocar». Guardar la asociación proyecto→variante→fuente para relacionarla con el reel publicado cuando el usuario aporte su URL o autorice seguimiento. La skill no crea vigilancia periódica ni publica por sí sola.

## Split testing diario — 29/10/2026
Para el encargo de tres vídeos diarios por cuenta de TargetAlarm, ZielAlarm y Nailuna, combinar esta skill con `../split-testing-videos/SKILL.md`. El diseño del experimento fija una variable por versión; esta skill investiga y adapta el texto. No confundir caption con overlay ni un plan con archivos preparados.

Nailuna propia: https://www.instagram.com/siilvenaa/ , aportada por Emmanuel el 29/10/2026; el perfil observado enlaza nailuna.shop/products/nailuna. TargetAlarm propia transferible según corrección humana en `CEREBRO/SEGA-LOTE3-MUSICA-20261003-01.md`; prevalece sobre la incertidumbre de las referencias históricas.


## Biblioteca de respaldo autorizada · 14/11/2026
Para conceptos validados sin referencia explícita de textos, leer /Volumes/T7/AUTOMATIZACION SEGA/BIBLIOTECA_TEXTOS_GANADORES/2026-11-14/REGLA.md y catalogo.json. Elegir por acción visual, adaptar al producto/público/mercado y registrar familia, original, adaptación, traducción española y motivo. Referencias o textos expresos prevalecen. No seleccionar al azar ni cambiar el vídeo para acomodar el copy.
