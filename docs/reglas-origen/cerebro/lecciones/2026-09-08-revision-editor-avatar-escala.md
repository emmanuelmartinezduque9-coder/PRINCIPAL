# Revisión: proyectos editables, avatares y escala del producto

Fecha: 2026-09-08. Ámbito: GLOBAL.

## Decisiones expresas de Emmanuel

- No generar más avatares fijos por defecto: Emmanuel suministra la identidad por cuenta/encargo. Conservar los assets históricos; no se pidió borrarlos.
- Próximas imágenes de producto incorporarán una mano como referencia de tamaño. Para no inventar la escala, usar dimensiones verificadas o una foto real con referencia de tamaño. No generar sustitutos en esta revisión.
- La prioridad visual sigue siendo una grabación de iPhone, sin piel plástica ni aspecto de render. Aplica a TODAS las escenas, no solo al frame inicial.
- Hoy no se genera ni regenera contenido; se discute el flujo de trabajo.

## Propuesta de edición, no implementada

Un proyecto por vídeo/variación/lote, con cuenta, concepto, sabor, fecha y versión en el nombre. Importar únicamente los clips finales aprobados de ese encargo, por orden del registro, conservando el audio de cada uno. Una regeneración crea otra versión y no pisa una edición manual. Más adelante, música limpia aportada por Emmanuel, textos editables traducidos y montaje por referencia.

DaVinci Resolve Studio tiene scripting e integraciones oficiales. Premiere dispone de API UXP para importar medios y crear secuencias. CapCut puede operarse por interfaz, pero no se ha validado un flujo autónomo aquí; su soporte indica que no importa proyectos editables de Premiere. No se instaló ni conectó ninguno durante esta revisión.

Fuentes: https://www.blackmagicdesign.com/products/davinciresolve/studio · https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/project · https://www.capcut.com/help/how-to-export-pro-project

## Riesgo del método B, todavía hipótesis sobre la causa visual

Los prompts de las réplicas largas piden múltiples cambios de lugar/acción dentro de una sola generación y solo fijan el primer frame. No hay aquí referencias visuales específicas para todas las escenas posteriores. Esto es un punto de riesgo, no prueba de que explique todos los fallos. Hay que comparar crudo y upscale de las tomas rechazadas antes de atribuir su aspecto a Seedance o Topaz. Propuesta: plan visual por escena; cuando sea necesario, separar bloques con referencias propias. No cambiar automáticamente el método ni volver a generar sin autorización.

## Estado de las modificaciones

La retirada de avatar queda en AGENTS.md y en una regla persistente con prioridad sobre el paso antiguo de alta. No se ha instalado un nuevo bloqueo ejecutable. En esta primera revisión el escalado continuaba en 1080; la orden posterior lo sustituye por 4K para nuevos trabajos (véase abajo).

## Orden posterior del mismo día: 4K y referencias adicionales

- Emmanuel cambia el destino de los próximos escalados Seedance a 4K (2160p). Generación base a 480p; audio original conservado; Kling no cambia. Los trabajos anteriores mantienen su resolución y no se vuelven a cobrar. El código de upscale y las etiquetas de entrega usan el destino real de cada trabajo.
- En réplicas largas se preparan también frames para las escenas posteriores/finales desde las escenas del vídeo original, con sus cambios de cuenta y realismo iPhone. Requieren aprobación y un papel de referencia de escena explícito, separado de la imagen de producto. El soporte para enviarlos al motor aún debe verificarse/integrarse; no se ha implementado una nueva puerta de escenas en esta revisión.
- Emmanuel suministra fotos reales del producto con una mano; se convierten en imagen de referencia limpia/mockup conservando esa escala. No inventar tamaños ni forzar manos en escenas que no las requieren.
- DaVinci Resolve está instalado; todavía no se ha conectado al flujo de proyectos automáticos ni confirmado la edición/licencia Studio.
