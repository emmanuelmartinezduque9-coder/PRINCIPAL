# Primer vídeo automático de test — orden 17/10/2026

## Flujo final de tests aprobado — 25/10/2026
Leer obligatoriamente `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md` antes de CADA producto, edición y entrega. Enlace → assets/alta → réplica con métricas → tres ganchos fijos (destape, café/sorpresa/escaparate, regalo) reutilizando cuerpo V1 → cuatro ediciones. Textos investigados adaptados por concepto/nicho y canciones elegidas por Emmanuel. Un único bloque inicial incluye dudas de edición. Consultar recetas FaltLiebling aprobadas sin heredar sus defectos ni inventar escucha. Registrar lectura, fuentes/hashes y revisión real. Sustituye notas antiguas de un solo vídeo o ganchos/textos pendientes. Documentación no acredita ejecución autónoma.


## Alcance

Cada nueva alta encargada por Emmanuel mediante enlace y países incluye preparar
una réplica del vídeo de mejor rendimiento verificable de esa cuenta competidora
para cada cuenta/mercado solicitado. Continuar tras crear los assets y verificar el
alta real en la app, sin pedir que vuelva a encargar el vídeo. No activar productos
históricos ni crear pruebas adicionales. La ejecución sigue requiriendo el agente
y el motor existentes; este documento no instala un servicio autónomo.

## Selección de la fuente

Revisar las publicaciones accesibles de la cuenta, únicamente del producto elegido.
Recoger URL, fecha de publicación y consulta, vistas, likes, comentarios y demás
interacciones realmente visibles. No tratar métricas ocultas como cero ni inferir
ventas, guardados, compartidos o rendimiento de pago. Registrar cuántas publicaciones
se revisaron y si el inventario fue completo; no llamar máximo absoluto a una muestra.

Seleccionar un solo vídeo: priorizar el mayor número de vistas comprobadas y usar
interacciones visibles como segundo criterio. Si los líderes de vistas e interacción
son distintos, registrar ambos y el motivo de elegir el líder de vistas; no afirmar
que gana en todo. Comparar tasas de interacción solo con denominador conocido.
Si faltan vistas pero existe evidencia suficiente de interacción, elegir el mejor
por esa evidencia y declarar la limitación. Sin métricas comparables, no elegir por
intuición ni presentar un candidato como «el más viral»: recuperar las métricas por
otra vía disponible o pedir el dato mínimo. No gastar en la réplica sin una selección
justificada. Inspeccionar el vídeo real completo y conservar archivo/hash y fuente.

## Avatar para el cliente ideal

Usar los avatares ACTIVOS de la biblioteca, no generar una persona nueva por defecto.
Respetar selección explícita de Emmanuel. Derivar el público de la función, uso,
descripción y mercado del producto; no únicamente de quién sale en el vídeo ajeno.
Registrar edad aproximada, género/presentación cuando sea pertinente, papel y motivo.

- Producto dirigido a mujeres mayores: avatar de mujer mayor disponible.
- Producto dirigido a hombres mayores: avatar de hombre mayor disponible.
- Producto para jóvenes adultos: avatar adulto joven adecuado al público.
- Producto específicamente masculino o femenino: elegir en consecuencia.
- Producto amplio/unisex: no inventar una restricción demográfica; elegir según el
  usuario de la demostración y rotar entre candidatos adecuados, sin repetir el mismo
  avatar por rutina. Distinguir comprador/regalador de usuario final.

Comprobar retratos y metadatos reales; no inventar edad exacta o nacionalidad a partir
del rostro. Si no existe un candidato apropiado, conservar selección pendiente y
resolver esa falta, no sustituir por uno incompatible ni generar otro sin encargo.
Conservar roles y continuidad cuando haya varias personas. Usar el índice real de
adjunto en el prompt, nunca «avatar mujer 14» como si el proveedor conociera el catálogo.
En POV sin caras, no añadir caras ni personas para forzar el avatar; documentar esta
excepción y preservar las manos/acción. En tomas con personas aplicar la identidad
elegida mediante el frame y las referencias necesarias del esquema vigente.

## Ejecución y acabado

1. Leer la skill higgsfield-genjutsu. Modo predeterminado explícito para ESTE flujo:
   Genjutsu Motion Transfer, `genjutsu_model=hf_mult_motion_control`. No usar Object
   Swap o Wan como sustitutos silenciosos. Verificar esquema/resolución soportados
   al enviar; respetar resolución explícita o default técnico vigente del motor.
2. Registrar una sola producción en el motor normal con deduplicación por alta,
   cuenta/mercado y fuente. Reconciliar tickets/recibos antes de enviar. No abrir otra
   cola ni reintentar estados inciertos.
3. Generar el frame inicial limpio con nanobanana-pro-imagenes, conservar acciones y
   ángulo de referencia. Presentar TODOS los frames de los mercados juntos con
   presentation_policy=complete_round y esperar aprobación visual real. La orden
   de alta no sustituye esta aprobación. Después continuar sin permisos rutinarios.
4. Generar el clip; conservar producto y variantes originales, sin adjuntar mockup
   de artículo/embalaje salvo petición expresa. Assets nuevos de catálogo no obligan
   a sustituir el producto que ya aparece en la referencia.
5. Verificar dimensiones: si necesita upscale, Topaz Theia 1080p con FPS originales;
   no escalar un nativo 1080p ni repetir un upscale aceptado. Leer
   memory/context/upscale-theia-1080p.md.
6. Edición posterior CON CODEX, no texto generado como sustituto del montaje.
   Editar únicamente el final Topaz verificado o nativo exento. Leer
   memory/context/texto-edicion-default-06b.md: TikTokDisplay-Medium 06B blanca,
   borde negro exterior 0,05 em, interlínea 35/31 em, recuadro x112/y287/886/318
   en 1080×1920, centrado y sin rectángulo visible. Traducción fiel al idioma de
   la cuenta, tiempos/emojis íntegros y CTA original con nuestra marca cuando
   corresponda. No inventar CTA ni copiar música de la referencia; conservar audio
   del generado. Traducir habla solo conforme al plan de audio autorizado.
7. Revisar realmente texto, encuadre, audio, duración y archivo final. Si hay un
   defecto no resuelto, no declarar entrega lista ni subir un borrador como final.

## Entrega a la persona encargada en Drive

La asignación es por cuenta: responsable + ID/enlace de carpeta confirmado por
Emmanuel. No escoger por coincidencia de nombre ni heredar carpeta de otra cuenta.
Usar la skill google-drive y conector conectado; verificar carpeta, acceso y destino
antes de subir. No ampliar permisos, crear credenciales ni compartir carpetas.

Si falta asignación, continuar producción independiente y dejar `delivery_pending`
con el vídeo final preservado; pedir únicamente responsable/carpeta. No subir a Mi
unidad, carpeta pública o carpeta adivinada como sustituto.

Con destino configurado, subir automáticamente solo el MP4 final editado y verificado.
Nombre identificable por cuenta/lote/vídeo/versión. Antes de subir, comprobar recibos
y archivos existentes del mismo final: no duplicar ante timeout ni sobrescribir una
versión distinta. Guardar hash local, tamaño, cuenta, lote, versión, folder_id y recibo
con file_id/enlace de Drive; verificar metadatos y carpeta después. Si no puede
acreditarse el resultado, marcar incierto y reconciliar sin repetir a ciegas.

Avisar a Emmanuel y SEGA con enlace y estado comprobado. La entrega en Drive NO
publica el vídeo en redes ni autoriza al agente a hacerlo. No afirmar que hay subida
desatendida fuera de la ejecución del agente si no existe integración comprobada.


## Test de cuatro vídeos y preguntas de edición — 25/10/2026
Orden posterior para futuros tests: leer `/Volumes/T7/AUTOMATIZACION SEGA/TestProductos4-20261025/PLANTILLA_Y_PREFLIGHT.md`. V1 réplica del más viral verificado; V2–V4 solo ganchos validados y mismo cuerpo generado V1 sin regenerarlo. Plantillas de texto por variante adaptadas a producto/nicho; canciones manuales por vídeo de biblioteca. Un único bloque inicial incluye dudas esenciales de frames, clips y edición antes de generar. Pendientes de configurar ganchos/textos exactos; no inventarlos. No alterar históricos ni lanzar antes de envío humano; registro no acredita despliegue.


## Actualización de textos — 25/10/2026
Emmanuel sustituye expresamente la plantilla fija de textos de V2–V4: seleccionar textos de las publicaciones con mejor rendimiento observable de la cuenta de referencia y adaptarlos a cada gancho, producto, nicho, marca y mercado. Usar la skill variaciones-textos-ganadores. Comparar vistas e interacción visible, considerando antigüedad y cobertura; no inferir ventas de likes ni presentar métricas ausentes como cero. Conservar texto fuente, URL, fecha, métricas disponibles, motivo de selección, adaptación y traducción española. Elegir por compatibilidad con la acción, sin inventar beneficios/CTA ni imponer tres textos diferentes si la evidencia no lo respalda. Si faltan datos esenciales, incluir la duda en el único bloque inicial antes de generar. Ya NO pedir al usuario tres textos base fijos. Las canciones siguen siendo asignadas manualmente por vídeo. Ganchos exactos e integración siguen pendientes; esta actualización no certifica despliegue.
