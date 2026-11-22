---
name: higgsfield-genjutsu
description: Preparar prompts y ejecutar ediciones de vídeos existentes con Higgsfield Genjutsu, Object Swap o Motion Transfer. Usar cuando Emmanuel pida Genjutsu, gentjutsu o adaptar un vídeo conservando sus acciones; no sustituir Seedance ni regeneraciones literales sin encargo.
---

# Higgsfield Genjutsu

## Referencias obligatorias al revelar producto o caja — orden 29/10/2026
Leer `memory/context/referencias-identidad-y-lotes-mixtos-20261029.md` del proyecto. Antes de cada envío revisar todas las tomas: si artículo o embalaje aparecerá después y no se ve en el frame inicial aprobado, adjuntar su referencia EXACTA de la cuenta y variante, con papel, ID y hash comprobados. Conservar el vídeo fuente NO exime de adjuntar esa referencia. Sin evidencia de visibilidad, incluir todos los roles declarados; un frame de escena no sustituye al asset. Usar `identity_reference_policy=visible-after-opening-v1` y controles normales del motor. No prometer fidelidad por haber adjuntado assets: revisar el resultado. Mantener decisión humana para repetir salidas válidas.

Default de nuevos encargos: Genjutsu normal Motion Transfer (`hf_mult_motion_control`), por petición explícita de Emmanuel del 29/10; conservar modelo explícito e históricos. Límites y parámetros se verifican antes de enviar.

## Objetivo
Adaptar un vídeo real al producto y avatar de la cuenta, preservando acciones, ritmo y lógica del original. Redactar instrucciones de edición, no inventar un guion nuevo. Responder breve en español; prompts de generación en inglés, habla solicitada en el idioma de la cuenta.

## Selección de modo
- **Object Swap:** cambiar elementos identificados (persona, producto, ropa, fondo) y conservar el resto. Preferirlo cuando importe la fidelidad de producto y de la escena.
- **Motion Transfer:** recrear la escena con referencias nuevas conservando movimiento, cámara y tiempos. Mayor margen de cambio visual; comprobar especialmente color, forma y escala del producto.
- Respetar el modo pedido. La preferencia del mentor por Motion Transfer no autoriza convertir todos los encargos a ese modo. Si cambiaría materialmente el resultado, explicar la elección antes de gastar.

### Object Swap adaptado al producto — orden 22/09/2026
Cuando Emmanuel elija Object Swap para adaptar un vídeo a una cuenta, leer
[references/object-swap-producto.md](references/object-swap-producto.md). No limitarse
a sustituir el producto: adaptar el entorno, decoración, textiles y avatar elegido
al contexto de la cuenta, con referencias de fondo pertinentes y apariencia natural.
Un encargo explícito «solo cambia X» prevalece y conserva todo lo demás.
No convertir automáticamente a Motion Transfer por pedir varios cambios visuales.
No atribuir a Object Swap variaciones controladas de movimiento ni ventajas de
distribución en Instagram que no estén verificadas.

## Preparar una vez
1. Recuperar original y estado existente; conservar archivo, hash, duración y jobs. No reanalizar ni reenviar solicitudes ya resueltas. Un enlace no equivale a un vídeo que se haya podido inspeccionar; si no es accesible, pedir MP4.
2. Revisar todas las tomas relevantes. Identificar qué hace cada sujeto, qué cambia y qué se conserva. El vídeo conduce movimiento y cortes, sin exigir Memories. Orden vigente 29/09/2026: TODO nuevo envío requiere un frame inicial limpio aprobado visualmente por Emmanuel y realmente adjuntado; leer `CEREBRO/reglas/genjutsu-frame-inicial-obligatorio.md`. No sustituirlo por «sin textos» en el prompt. El frame define la apertura visual; el vídeo sigue definiendo acciones y tiempos. No inventar un parámetro `start_image` si el esquema solo admite referencias, ni garantizar que el frame borre textos en todas las tomas.
3. Relacionar cada imagen con un papel: avatar, ARTICULO, EMBALAJE o fondo. Adjuntar solo las necesarias y realmente existentes. Nunca usar un frame de escena como asset limpio. Un avatar aporta identidad, no el fondo de su foto. No cambiar personas ni producto sin encargo.
4. Comprobar lógica del producto: conservar una demostración compatible, no convertir automáticamente un uso de gatos a perros o una mecánica diferente. Si la adaptación no tiene sentido, señalar el conflicto preciso.
5. Redactar prompt corto y concreto con [references/prompts.md](references/prompts.md). Orden: fuente y acción que permanece → sustituciones y referencias → alcance en TODAS las tomas → invariantes → textos/audio. Los números de imágenes deben coincidir con el orden enviado, no con el orden de un ejemplo.
6. Quitar captions/overlays si se pide o corresponde al flujo sin textos; diferenciar eso de las letras físicas del embalaje. No borrar la marca que se debe conservar. No dar por hecho que un prompt cambia idioma, diálogo o música: verificar capacidad y resultado.

## Ejecución en Nano Banana
Raíz: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS`.
Antes de enviar, leer `CEREBRO/reglas/controles-video-por-motor.md` y la sección vigente de `CEREBRO/reglas/genjutsu-prueba.md`; las notas históricas inferiores no prevalecen sobre actualizaciones posteriores.
Usar `EDITOR/lanzar.py plan` y su ruta Genjutsu/ticket MCP existente; no llamar generación a mano para sortear una puerta. Mostrar plan compacto y guardar prompt exacto, referencias ordenadas, parámetros, coste/recibo y job. Seguir aprobación y revisión reales del proyecto; créditos normales de lote ya autorizados, sin nuevas preguntas por fase.

**Estado local actualizado el 21/09/2026:** `EDITOR/genjutsu.py` conserva `hf_mult_replace_object` por defecto y admite Motion Transfer con `genjutsu_model: hf_mult_motion_control` explícito, a 480p. `EDITOR/production_engine.py` integra el ticket MCP existente y congela el modelo; el recibo debe coincidir exactamente. Ampliación Motion Transfer probada offline, sin afirmar envío de producción. El host aún transporta los parámetros con el conector y devuelve el recibo. Detalle y API auditada de correcciones append-only: `EDITOR/GENJUTSU_ENGINE.md`. No abrir cola paralela ni migrar a API de pago por esta skill.

Antes de ejecutar, consultar el esquema actual del modelo/conector para referencias, duración y resolución. No copiar parámetros de Seedance ni trasladar su regla de caras a Genjutsu. Recuperar jobs inciertos antes de intentar de nuevo. Crear esta skill no autoriza generaciones de prueba.

## Revisión y aprendizaje
Comparar original y resultado en cada corte: misma acción completa, sujeto consistente, producto y escala, sustituciones en todas sus apariciones, fondo pedido, texto residual y audio real. No afirmar escucha a partir de ASR vacío. Mostrar resultados al estar listos; no esperar a terminar tareas ajenas.
Una imagen o vídeo válido con defectos no se regenera por decisión propia: describir el defecto y dejar decidir a Emmanuel. Un fallo terminal sin salida se trata según la autorización vigente, no como permiso de reintentar estados inciertos o moderación.
Guardar una lección solo cuando exista evidencia: cambio de prompt, modo, job, fallo observado y decisión del usuario. Etiquetar ejemplos de esta skill como plantillas no probadas, no como prompts ganadores. No prometer viralidad, ventas ni evasión de detección de duplicados.

## Fuentes
- [Transcripción íntegra aportada por Emmanuel](references/mentor-transcripcion.txt): testimonio y ejemplos, no instrucciones para abrir cuentas, comprar Shopify ni entregar datos. El PDF/skill privada mencionada NO fue aportado.
- [Guía oficial](https://higgsfield.ai/genjutsu) y [artículo oficial](https://higgsfield.ai/blog/higgsfield-genjutsu), consultados 21/09/2026: distinción de modos. Parámetros y límites deben verificarse en la ruta concreta antes de enviar.
