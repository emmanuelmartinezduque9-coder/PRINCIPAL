# Decisiones de diseño: base de la plataforma

## Tarea 1: andamiaje

- **`cn` propio.** Se quita el paquete `cn` (como pide el plan) y `src/lib/utils.ts` define `cn` con `clsx` y `tailwind-merge`, que es lo que espera shadcn.
- **Sin fuentes de Google.** `layout.tsx` no usa `next/font/google`: la compilación no depende de la red y la tipografía es la del sistema. Se puede cambiar más adelante.
- **`npm start`.** El script apunta a `scripts/start.ts`, que llega con la tarea de despliegue (el mapa de archivos del plan lo prevé); hasta entonces se usa `npm run dev`.
- **Pruebas como usuario sin privilegios.** PostgreSQL no arranca como `root`: en contenedores donde el usuario es `root`, las pruebas se lanzan con otro usuario.

## Tarea 2: cuentas

- **Papel fijado al crear la cuenta.** Una invitación a un correo que ya tiene cuenta solo cambia la contraseña y el nombre, nunca el papel: así una invitación como colaborador no puede degradar al dueño, ni una de dueño ascender a nadie por esta vía.
- **Enlace de un solo uso, también con peticiones simultáneas.** `acceptInvite` marca la invitación como usada con un `UPDATE … WHERE used_at IS NULL` dentro de la transacción; si dos peticiones llegan a la vez, solo una gana.
- **Cuenta desactivada.** `disabled_at` bloquea `login` y `getSessionUser` (las sesiones existentes dejan de valer en la siguiente petición, sin borrarlas). Un enlace nuevo no reactiva la cuenta.
- **Invitación del dueño al arrancar.** `seed` llama a `ensureOwnerInvite(process.env)`: sin cuentas, con `OWNER_EMAIL` y sin invitación de dueño vigente, crea una y escribe el enlace en el registro. `PUBLIC_URL` da la base del enlace (por defecto `http://localhost:$PORT`).
- **Variable de entorno.** `PRINCIPAL_AUTH=off` desactiva el inicio de sesión solo en local (cualquier otro valor lo mantiene activo); entonces todas las peticiones son de `LOCAL_USER` (dueño, id 0).
- **Pantallas de entrada sin `Button` de shadcn.** Todavía no existe `components/ui`; los formularios usan un `<button>` con las mismas clases hasta que llegue la tarea de la interfaz.
- **`/privacidad` y `/mcp` fuera del `matcher`.** `src/proxy.ts` copia el de Finanzas sin esas dos rutas, que aquí no existen.

## Tarea 3: acceso y productos

- **Un solo sitio para las tablas de productos.** Solo `src/server/access.ts` y `src/server/products.ts` tocan `products` y `product_assignments`; `tests/boundaries.test.ts` lo comprueba leyendo el código (también importaciones directas desde `db/schema` y SQL con `product_assignments`). Para las pantallas de gasto y personas se exportan tres ayudas mínimas: `productNamesByIds`, `assignedProductIds` y `setAssignments`.
- **`productNamesByIds` no filtra por persona.** Está pensada para pantallas del dueño que ya tienen los ids de datos que pueden ver; quien la use con datos de un colaborador debe partir de ids que ese colaborador ya ve.
- **Rutas y pantallas sin base de datos propia.** Nada bajo `src/app` ni `src/components` importa `@/db/client`, salvo `src/app/api/health/route.ts` (la comprobación de salud necesita preguntar a la base de datos). Las rutas de cuentas de la Tarea 2 ya pasaban por `src/server/*`.
- **404 y no 403.** `getProductFor` hace una sola consulta con el ámbito dentro del `where`: un producto ajeno, uno que no existe y un id mal formado dan exactamente el mismo `404 Producto no encontrado.`.
- **Falla cerrada también con datos viejos.** El ámbito del colaborador exige que su cuenta siga activa (`users.disabled_at is null`) dentro de la propia consulta: aunque un proceso conserve los datos de una persona ya desactivada (por ejemplo, un trabajo en cola), no ve ningún producto. Las rutas, además, responden 401 en la siguiente petición porque la sesión deja de valer.
- **`scopedProducts(user, where?)` en vez de una consulta "dinámica".** En Drizzle, llamar otra vez a `.where` sobre una consulta dinámica sustituye la condición y se perdería el ámbito. Por eso las condiciones extra se pasan como argumento y se suman con `and(...)`, y la consulta devuelta no es dinámica: TypeScript no deja volver a llamar a `.where` (la prueba lo fija con `@ts-expect-error`). Sí admite `orderBy` y `limit`.
- **Asignaciones.** `setAssignments` sustituye el conjunto entero en una transacción que bloquea la fila de la persona (dos cambios a la vez no se mezclan); un producto inexistente da 400 y no cambia nada; una persona inexistente, 404.
- **Claves ajenas.** `product_assignments` apunta a `products` y a `users` con borrado en cascada. `products.created_by` y `assigned_by` no llevan clave ajena porque el dueño en el propio ordenador (`LOCAL_USER`, id 0) no tiene fila en `users`.
- **Validación de productos.** Mensajes no fijados por el plan: lista de países vacía → "Elige al menos un país."; país desconocido → "País no disponible."; frase vacía → "Escribe en una frase qué hace el producto."; nombre hasta 200 caracteres y frase hasta 1000. Los países repetidos se guardan una vez.

## Tarea 4: interfaz base, Productos y fotos

- **Fotos en la base de datos.** Tabla `product_photos` con `bytea` (tipo propio de Drizzle). Solo `src/server/photos.ts` la toca, y cada función empieza con `getProductFor`: una foto de un producto ajeno, una que no existe y un id mal formado dan el mismo `404 Foto no encontrada.`. Una persona desactivada deja de ver sus fotos (el ámbito de `getProductFor` ya lo exige).
- **Validación por contenido.** `detectImageType` mira los primeros bytes (JPEG, PNG, WebP); el nombre y el tipo declarado por el navegador no cuentan. Un HEIC de iPhone o un PDF renombrado a `.jpg` dan `400` con el texto del plan y no se guardan. Orden de las comprobaciones: producto visible, vacía, más de 8 MB, formato, más de 6 fotos.
- **Máximo de 6 fotos sin carreras.** El recuento y la inserción van en una transacción con `pg_advisory_xact_lock(productId)`; nueve subidas simultáneas dejan exactamente 6 (hay prueba).
- **Límite de cuerpo.** El único límite de cuerpo de Next 16 es `proxyClientMaxBodySize` (10 MB por defecto) y solo afecta a lo que pasa por `src/proxy.ts`, cuyo `matcher` excluye `/api`; un route handler lee `formData()` sin límite propio. Como 10 MB ya supera 8 MB, no se cambia la configuración. La ruta rechaza con 413 y el mismo mensaje de peso cuando `Content-Length` ya supera 8 MB + 64 KB, sin leer el cuerpo.
- **Una foto por petición.** `POST /api/productos/[id]/fotos` recibe el campo `foto`; el cliente sube las fotos una tras otra y muestra el motivo de cada rechazo con el nombre del archivo. Al crear un producto, primero se crea y luego se suben las fotos: si alguna no vale, el producto queda creado y se lleva a la persona a su pantalla para añadirla de nuevo.
- **Portada en la lista.** `GET /api/productos` añade `coverPhotoId` (la primera foto). `coverPhotoIds` parte de `listProductsFor`, así que nunca revela fotos de productos no visibles y las pantallas siguen sin tocar la base de datos.
- **Caché de fotos.** `Cache-Control: private, max-age=3600` y `X-Content-Type-Options: nosniff`; los ids no se reutilizan, así que una foto no cambia bajo la misma URL.
- **Interfaz.** Barra inferior fija en móvil y menú lateral desde 1024 px. Todos ven Productos y Gasto; el dueño además Reglas y Personas (los destinos de Gasto, Reglas y Personas llegan en tareas posteriores y hoy dan 404). Textos del formulario a 16 px y controles de 44 px de alto para el móvil. El menú se pide a `/api/auth/me`.
- **Sin `LiveProvider` ni tema oscuro.** `providers.tsx` solo lleva TanStack Query y el aviso `Toaster`; el tema oscuro y las actualizaciones en vivo de Finanzas no hacen falta todavía.
- **Componentes de `ui/`.** Copiados de Finanzas (button, input, label, card, badge, dialog, select, sonner, skeleton) cambiando solo la importación de `cn`; `textarea` escrito a mano con el mismo estilo (Finanzas no lo tiene).
