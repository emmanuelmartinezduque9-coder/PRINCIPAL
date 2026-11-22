# Granja de vídeos — implantación 12 septiembre 2026

> Corrección posterior de Emmanuel: «granja» describe TODO el sistema, no una
> sección nueva. Se retira la pestaña y sus formularios manuales. Esta nota conserva
> la historia técnica; no indica una pantalla que deba volver a añadirse.
> Prioridad: conectar fuentes reales de redes antes de diseñar más interfaces.
> Ver [[lecciones/2026-09-12-automatizar-no-es-anadir-formularios]].

## Qué es el cerebro

Obsidian (`CEREBRO`) conserva conocimiento humano legible y sus fuentes. SQLite
conserva publicaciones, métricas, versiones, decisiones, feedback y estado operativo.
`EDITOR/granja.py` aplica criterios explícitos y entrega fichas trazables.
Graphify es un mapa auxiliar del código anterior, no una dependencia de la Granja.
Más archivos o un grafo más grande no equivalen a más capacidad de producción.

[[aprendizaje/cmg/INDICE|Las siete transcripciones]] están conservadas completas,
con hash y extractos razonados ligados a sus marcas de tiempo. No se han visto los
vídeos ni comprobado sus ingresos. Los consejos del ponente no sustituyen las
órdenes de Emmanuel ni se convierten silenciosamente en verdades o umbrales.

## Criterio confirmado

Concepto nuevo ganador → regeneración literal para confirmar → si vuelve a funcionar,
pilares. Ejemplo: cambiar levemente el texto conservando el significado.
Orden posterior del 12 septiembre: SOLO vistas y comentarios para revisar redes.
No exigir retención, tiempo visto, likes, compartidos ni métricas comerciales.
ID, cuenta, plataforma y fechas siguen siendo contexto para asociar y comparar.
Ver [[sistema/trendtrack-alcance-redes]]; comentarios contados no equivalen a texto leído.
No se ha definido qué cifra/ventana significa viral para cada perfil. La app permite
clasificar manualmente con motivo o registrar un umbral explícito por perfil/red.

Explorar diferentes conceptos antes de multiplicar microvariaciones de uno sin
validar. Separar alcance de conversión y datos por plataforma, cuenta, antigüedad
y distribución orgánica/pagada. Un valor ausente es desconocido, no cero.
Pocas vistas no prueban bloqueo. Ventas de toda la tienda no se atribuyen a un vídeo.

## Implementado

- Backend de conocimiento, publicaciones, métricas, criterios, propuestas y supervisor.
  La sección **Granja** y sus formularios se retiraron por orden de Emmanuel.
- Publicaciones vinculadas a cuenta/concepto/MP4 mediante SHA, URL e ID de red.
  Linaje explícito nuevo/regeneración/pilar/repost; no confundir el mismo archivo
  republicado con una generación nueva.
- Observaciones inmutables: valores, fuente, evidencia, hora de captura y fecha
  hasta la que cubren los datos. Políticas versionadas; decisiones con hashes y fuentes.
- Motor en **modo propuesta**: no publica, paga ni modifica código automáticamente.
  Aceptar una recomendación registra feedback; no es autorización de gasto.
- La Oficina recibe un contexto compacto de reglas y perfil del nicho, sin cargar
  todas las transcripciones en cada llamada y sin modificar prompts congelados.
- Supervisor local cada minuto mientras el servidor está abierto. Detecta envíos
  inciertos, descargas pendientes, entregas ausentes y publicaciones sin enlace.
  Puede recuperar una copia de entrega ausente desde un original cuyo SHA coincide.
  Nunca sobrescribe una entrega distinta ni repite una generación pagada.
- Montaje: tiempos inicio/final por texto raíz, catálogo musical con nombre,
  fragmento, volumen y fundidos; permisos/redes/caducidad y revisión antes de pagar.
  Guardar un plan no lo renderiza. Los cambios se aplican a una copia de la plantilla.

## Rutas de producción

| Necesidad | Ruta | Generación visual nueva |
|---|---|---|
| Regeneración sin cambios | Puerta lanzar.py, prompt literal | Sí |
| Pilar de texto/música | Creatomate sobre MP4 existente | No |
| Nuevo concepto o cambio visual | Oficina, gates y ronda global de frames | Según el encargo |

Las puertas existentes conservan inventario global, regeneraciones primero, TODOS
los frames, presentación conjunta y clips aprobados. Genjutsu no requiere un guion
de Memories; Seedance mantiene sus controles específicos. Nada de esta memoria
autoriza borrar datos, cambiar verificadores ni corregir desde una imagen rechazada.

## Métricas: vistas y comentarios; comprobar Trendtrack primero

La propuesta anterior de Metricool queda subordinada al alcance corregido.
Primero verificar cobertura y actualización de las cuentas reales en Trendtrack,
que Emmanuel ya paga. No descartar por ausencia de retención ni contratar otro
servicio para conseguir métricas no pedidas. No reintroducir formularios de Granja.
Credenciales fuera del proyecto y nunca en notas o chat.

Conector actual: solo GET de marcas, Reels de Instagram/Facebook y posts de TikTok.
Captura manual conserva respuesta cruda y SHA. **Normalización automática pendiente**
de verificar una respuesta real: TikTok devuelve CSV; no se inventan columnas,
unidades, atribución ni cobertura temporal. Capturar no equivale a importar métricas.
No existe aún consulta social periódica activada.

El importador manual se conserva como herramienta técnica, no como trabajo diario
impuesto a Emmanuel. La prioridad es conectar una fuente real para vistas y comentarios.

Instagram tiene diferencias de métricas según conexión; TikTok personal/business
también. No cambiar el tipo de cuenta a ciegas: comprobar primero permisos y campos.
No es necesario publicar desde Metricool para consultar todo lo que soporte su API.

## Plantillas y música

Ejemplo de encargo: «EisWerk C1, plantilla Receta; texto de 0 a 4 s y CTA de 7 a 10 s;
canción Verano desde 00:18, al 20 %, conservar voz». Requiere capas con esos nombres
y duraciones compatibles. Capas anidadas se editan en Creatomate, no se adivinan
sus tiempos relativos. Importar otra versión si se añade una nueva capa de audio.

Archivo musical HTTPS autorizado ≠ enlace de Spotify/YouTube ≠ sonido nativo de
TikTok. Un sonido nativo del catálogo se añade al publicar; incrustar audio no lo
vincula al identificador de tendencia de una red. El catálogo registra permisos,
no concede licencias. Las variantes no cambian el significado del texto por sí solas.

## Pendiente para autonomía real

1. Comprobar Trendtrack para vistas y comentarios; verificar cobertura, actualización
   y soporte de Instagram/comentarios individuales con respuestas reales. Elegir
   otra fuente solo ante una carencia concreta. Enlazar publicaciones con su archivo final.
2. Definir umbrales/ventanas por perfil, mínimo de muestra, máximo de intentos,
   presupuesto y condiciones de parada. La app no los inventa.
3. Medir decisiones propuestas frente a las de Emmanuel. El feedback ya se guarda,
   pero no hay entrenamiento de un modelo ni cambios automáticos de política.
4. Autorizar por separado ejecución automática acotada. Conectar las fichas al
   despachador con presupuesto, reserva de coste e idempotencia; no activar aún.
5. Para 24/7, desplegar servidor/colas/almacén durables fuera del Mac. El supervisor
   actual se detiene si el Mac duerme o se cierra el servidor.
6. Autodepuración de código: futuro ciclo de incidencia → propuesta aislada → tests
   → revisión → despliegue/rollback. Hoy solo reparación segura de copias y alertas;
   no afirmar que el programa se reprograma o mejora su criterio autónomamente.

## Fuentes técnicas comprobadas

- [Modificaciones de plantilla](https://creatomate.com/docs/fundamentals/getting-started/template-modifications)
- [Audio y recorte](https://creatomate.com/docs/api/render-script/audio-element)
- [Acceso API de Metricool](https://help.metricool.com/api-access-export-your-metricool-data-to-other-tools-and-automate-tasks-x8ln5)
- [Documentación API](https://app.metricool.com/resources/apidocs/index.html)
- [Métricas TikTok](https://help.metricool.com/es/metricas-de-tiktok-fe7io)
- [Métricas Instagram](https://help.metricool.com/instagram-metrics-ght51)

La arquitectura divide memoria, hechos y acciones; la optimización evita regenerar
cuando basta editar y no añade especialistas por cada comprobación determinista.
