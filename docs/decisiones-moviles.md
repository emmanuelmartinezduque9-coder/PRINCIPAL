# Productos delegados al móvil — 24/11/2026

## Datos y revisión

La migración generada con `npx drizzle-kit generate`, `0060_wooden_hellcat.sql`, crea
`phones` y `publications`, las cuentas y el móvil del producto y la revisión del vídeo.
Incluye la siembra de «iPhone 1» y asigna SofaLeiste (producto 59) con Instagram `sofaleiste`
y Facebook sin nombre explícito. No se ha aplicado a la base de producción.

`saveEdit` marca como pendientes exclusivamente los montajes de productos con móvil.
La aprobación comprueba acceso, versión y estado, genera la descripción con la pasarela
(tier small, idioma/país/nicho del producto y ninguna marca ajena) y crea una publicación por
red. Una restricción única por montaje y red evita duplicados al aprobar otra vez.
Los cambios de móvil/cuenta durante la generación de la descripción invalidan la aprobación.

El rechazo conserva el motivo y usa `requestEditChange`, el punto de entrada existente de
«¿Qué quieres cambiar?». Este guarda `edit_override.pendiente`, encola el montaje y utiliza
`saveEditChange` cuando aplica la instrucción. No se llama directamente a `saveEditChange`
desde el rechazo: esa función registra el cambio ya aplicado, no lo solicita.
El nuevo montaje vuelve a pendiente.

## Calendario y agente

Dos publicaciones diarias por cuenta y red, con cuatro horas entre ellas, día de
`Europe/Berlin`, incluidos sus cambios de hora. Las cuentas explícitas comparten calendario
entre móviles; una cuenta vacía representa la abierta en ese móvil y red. La reserva de
calendario se serializa con un cerrojo transaccional PostgreSQL. El ritmo se comprueba otra vez
al reservar la ejecución, para no vaciar la cola acumulada tras días sin Mac.

El seguimiento de cada minuto crea una sola tarea por móvil no pausado. El agente anuncia
`movil`; los agentes antiguos no recogen estas tareas. Los móviles pausados tampoco entregan
las tareas ya en cola; una publicación que ya se ejecuta termina.

El Mac 1.9.0 descarga el montaje exacto de `publications.edit_id` por una ruta que exige
la reserva y la ficha del agente. Escribe la descripción UTF-8 y ejecuta el publicador
existente con `python3 -B`, `--wda` y `--salida`, sin `--simular`. Entrega JSON por los
mismos trozos y sesión de reserva que los perfiles, incluyendo código, mensaje, enlace
si lo encuentra y captura final o de bloqueo. La ficha no pasa a WDA ni al Python.
No hay reintentos automáticos de publicación: un fallo, una reserva perdida o la pérdida
del resultado quedan fallidos. Podría haber habido envío.

`telefonos.mjs` consulta pantallas WDA en paralelo cada aproximadamente cinco segundos.
No captura mientras ese teléfono está publicando. Reduce a JPEG de 360 px y hace un POST
ligero autenticado; se guarda solo la última captura, actividad y latido.
Los resultados de publicación conservan su propia captura PNG reducida.

El instalador copia los Python existentes del móvil y su README, junto con
`telefonos.mjs`; no copia capturas, resultados ni cachés.
**No se ha modificado ningún archivo de `agente-mac/movil/`.**

## Pantallas

- Ficha de producto: «Móvil y cuentas», guardado al cambiar el selector o salir del campo.
- Lote: acción principal «Revisar vídeos (N)» para los pendientes delegados.
- `/lotes/[id]/revisar-videos`: reproductores verticales, aprobar individualmente o todos,
  rechazar mediante `RejectDialog`, estado y fecha de cada red.
- `/moviles`: tarjetas para varios móviles, pantalla refrescada, desconexión tras un minuto,
  pausa/reanudación, configuración para el dueño, próximas publicaciones, historial y capturas
  ampliables. Todos los usuarios autenticados ven la sección y pueden pausar.

## Comprobaciones y pendientes

- TypeScript y ESLint comprobados; los avisos de lint anteriores ajenos al cambio permanecen.
- 69 pruebas sin base de datos en verde (calendario, cambios de hora y agente), sin publicaciones reales. También se actualizan
  las expectativas de versión, capacidades e instalación de las pruebas existentes del agente.
- Pruebas de integración añadidas: revisión solo de delegados, dos publicaciones al aprobar,
  rechazo y remontaje, pausa y ausencia de reintento tras fallo o reserva perdida.
- `npx vitest run` no puede iniciar su PostgreSQL embebido en este entorno restringido:
  `listen EPERM 127.0.0.1`. Se intentó aislar la integración mediante un socket Unix temporal,
  pero `initdb` también falla con `shmget: Operation not permitted`. Se retiró ese setup
  temporal. Hay que ejecutar la suite completa en un entorno que permita PostgreSQL local.
- Falta la comprobación visual con la aplicación en marcha y la prueba física de publicación
  con WDA/iPhone. No se ha realizado ningún envío real ni se ha arrancado el agente instalado.
- El publicador existente publica en **la cuenta abierta** y no admite un argumento de cuenta.
  Los nombres guardados identifican el calendario; hay que dejar abiertas las cuentas correctas.
  Cambiarlas automáticamente requiere ampliar los scripts del móvil en su tarea correspondiente.
- `phone_screen` está admitido en la restricción de tipos por el encargo, pero las pantallas
  usan el POST ligero, sin crear tareas.
- No se ha hecho commit, push ni despliegue.

## Separación entre vídeos (Emmanuel, 24/11/2026)

Los vídeos aprobados de una misma cuenta salen separados **3 horas** por defecto (uno ahora, el siguiente
3 h después) y como mucho **2 al día** por cuenta (día de Berlín). La separación es un ajuste por producto
(`products.publish_gap_hours`, «Horas entre vídeos» en Producto → Móvil y cuentas); cada publicación guarda
la que tenía al aprobarse (`publications.gap_hours`) y el agente la respeta también al reprogramar.
