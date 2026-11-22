# MAQUINA DE HELADOS — edición por API

Verificado el 12 septiembre 2026 mediante GET de la API del proyecto conectado,
sin navegador, sin modificar la plantilla remota y sin crear un render.

## Identificación estable

- Nombre exacto: MAQUINA DE HELADOS.
- ID remoto: `0658121e-cb17-4b4e-ab8b-54f3a648dde5`.
- `updated_at`: `2026-09-12T20:25:23.734Z`.
- Guardada: MP4, 720×1280, 60 fps, 11,5 segundos.
- Solo contiene `Text-1`: texto `holaa`, inicio 0, duración 5,38 s,
  escala X/Y 50 %, fuente `classic`, peso `800`, blanco, interlineado 87 %.
- No hay capa de vídeo ni música en esta versión remota. No afirmar que basta
  reemplazar una capa de vídeo existente. Se puede añadir por RenderScript.
- `classic` no tiene declaración `fonts` en el source remoto. La prueba anterior
  resolvió el archivo Classic en su copia local; verificarlo, no sustituirlo por
  Aileron ni afirmar que se dispone de una variante Bold distinta.

## Qué admite la API pública

- Texto, tipografía disponible/personalizada, tamaño, peso, color, borde, sombra,
  alineación, posición, saltos de línea y estilo.
- Inicio y duración de capas; animaciones; insertar/reordenar escenas y medios.
- Archivo de vídeo, fragmentos y encuadre. No ampliar/recortar por defecto.
- Archivo musical, fragmento, volumen, fundidos; conservar o silenciar audio del clip.
- Crear plantillas (`POST /v2/templates`) y guardar cambios de nombre/tags/source
  (`PATCH /v2/templates/{id}`). En PATCH, `source` reemplaza el source completo:
  leer el actual, conservar copia y comparar antes; no mandar un fragmento incompleto.
- Para variaciones por vídeo: `POST /v2/renders` con `template_id` y `modifications`,
  o RenderScript de una copia. Esto no modifica la plantilla original.
- No es obligatorio marcar una propiedad dynamic para modificarla por API.

No confundir capacidad de la API con controles ya expuestos por nuestra app:
`creatomate_app.api()` actualmente envía GET/POST; no implementa PATCH genérico.
El código puede construir RenderScript y usar las propiedades admitidas sin
automatizar la interfaz, pero la actualización permanente exige una operación
explícita y controlada, no una mutación silenciosa en cada lote.

## Primera práctica del lote siguiente

Actualización del 13 septiembre: [[sistema/creatomate-edicion-flexible]]. El usuario
puede aportar captura, texto guardado o idea en español; no exigir transcripción
manual de alemán. Los tiempos se calculan desde el montaje final, no la plantilla.

1. Emmanuel identifica primer concepto/variante y referencia de texto. No asumir la lista de
   ayer como lote de mañana ni repetir la prueba antigua cobrándola otra vez.
2. Resolver los MP4 finales por registro, no por posición en la carpeta.
3. Leer esta plantilla por ID y usar su versión actual como base. Añadir la capa
   de vídeo, resolver Classic y conservar el estilo salvo cambios pedidos.
4. Para el esquema hook/CTA, sincronizar el cambio con el último corte verificado
   del montaje real. Acordar excepciones de legibilidad y tramo musical; no exigir
   tiempos manuales para cada vídeo ni cambiar la escala sin indicación.
5. Preparar plan con clips, texto, tiempos y coste. Renderizar por la puerta
   existente una vez autorizado; guardar resultado y entrega automáticamente.

Todavía no hay un encargo concreto del primer vídeo del lote siguiente. Este
documento es preparación y alcance verificado, NO una plantilla nueva publicada,
un render nuevo, ni una aprobación visual de la plantilla.

## Fuentes oficiales

- https://creatomate.com/docs/api/reference/get-all-templates-in-a-project
- https://creatomate.com/docs/api/reference/get-a-template-by-its-id
- https://creatomate.com/docs/api/reference/create-a-template
- https://creatomate.com/docs/api/reference/update-a-template
- https://creatomate.com/docs/fundamentals/getting-started/template-modifications
- https://creatomate.com/docs/fundamentals/getting-started/automating-a-template
- https://creatomate.com/docs/api/render-script/text-element
- https://creatomate.com/docs/api/render-script/audio-element

Historial de la prueba existente: `EDITOR/prueba_plantilla_20260912/RESULTADO.md`.
