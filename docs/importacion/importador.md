# Importador de productos (del sistema antiguo a PRINCIPAL)

`scripts/importar-productos.ts` carga en PRINCIPAL los productos de `productos.json` y sus fotos
desde el paquete de exportación (`/Volumes/T7/PRINCIPAL/importacion/` en el Mac). Se lanza una vez
desde el Mac contra la base de datos de Railway. Se puede repetir sin peligro.

## Qué hace

- **Por defecto es una prueba**: dice producto a producto qué crearía, qué ya existe y qué omitiría, y
  no cambia nada. Solo escribe con `--aplicar` **y** `--confirmo-base <host>`, que tiene que ser el
  host de `DATABASE_URL` (lo muestra la primera línea de la prueba). Así no se escribe por error en otra base.
- **Qué productos**: los de `--estados` (por defecto `active,active*`). `active*` son los que el
  inventario da por activos sin estado explícito (`status: active` con `statusBasis: implicito`:
  LaserBande, RadBlink y WärmePlatz). `--estados active` solo coge los activos explícitos. Valen también
  `hidden`, `retired` y `unclear`.
- **Sin fotos**: un producto sin ninguna foto válida se crea igual si tiene frase (las fotos se añaden
  luego en la web); sin frase no se puede crear (la app la exige) y se omite. El informe lo repite.
- **Nunca duplica ni borra**: un producto se reconoce por su nombre exacto, sin distinguir mayúsculas.
  Si ya existe, no se toca: solo se le añaden las fotos que no tiene (comparando el sha256 del contenido).
- **Datos**: nombre, frase, idioma y países del paquete. Sin países → DE/AT/CH. Sin idioma → `de`. El
  creador es la cuenta del dueño (`--dueno`, que tiene que existir, estar activa y ser la del dueño).
- **Mismas reglas que la web**: pasa por `createProduct` e `importProductPhotos`. Un producto con un
  idioma o país que la app no admite (hoy solo `de`/`it` y DE/AT/CH/IT) se omite y se dice por qué.
  Cada foto se comprueba: JPG/PNG/WebP por contenido, máximo 8 MB y sha256 igual al de `productos.json`;
  la que falla se omite y se dice por qué.
- **Fotos**: el papel se copia tal cual (artículo, embalaje, avatar, otro). Van primero las marcadas
  como principales y luego por papel (artículo, embalaje, avatar, otro); como mucho 12 por producto
  (las que no caben se cuentan como «fuera del máximo»). La misma imagen repetida con otro papel se
  guarda una sola vez.

## Cómo lanzarlo desde el Mac

Hace falta el repositorio al día (`git pull`, `npm ci`), Node 22 o más, el disco T7 conectado y la CLI
de Railway con la carpeta enlazada al proyecto de PRINCIPAL (`railway link`, una sola vez).

`DATABASE_URL` del servicio web apunta a la red interna de Railway, que no se alcanza desde el Mac.
Hay que usar la dirección **pública** de la base `Postgres-principal` (su variable `DATABASE_PUBLIC_URL`).
Nunca la base de Finanzas.

**Opción A: que la ponga Railway** (no se copia ninguna contraseña):

```sh
# 1. Prueba (no cambia nada). Apunta el host que sale en la primera línea («base …»).
railway run --service Postgres-principal -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/importar-productos.ts --paquete /Volumes/T7/PRINCIPAL/importacion --dueno <correo-del-dueño>'

# 2. Si el informe está bien, lo mismo con --aplicar y ese host:
railway run --service Postgres-principal -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/importar-productos.ts --paquete /Volumes/T7/PRINCIPAL/importacion --dueno <correo-del-dueño> --aplicar --confirmo-base <host-de-la-prueba>'
```

**Opción B: pegar la dirección pública** (Railway → `Postgres-principal` → *Variables* →
`DATABASE_PUBLIC_URL`) solo en esa ventana de Terminal, sin que quede en el historial ni en ningún archivo:

```sh
read -rs "DATABASE_URL?Dirección pública de la base: " && export DATABASE_URL   # zsh; pega y pulsa Enter
npx tsx scripts/importar-productos.ts --paquete /Volumes/T7/PRINCIPAL/importacion --dueno <correo-del-dueño>
npx tsx scripts/importar-productos.ts --paquete /Volumes/T7/PRINCIPAL/importacion --dueno <correo-del-dueño> --aplicar --confirmo-base <host-de-la-prueba>
```

El script nunca muestra `DATABASE_URL` ni la contraseña; solo el host.

## Qué responde

Una línea por producto: `CREADO`/`CREARÍA`, `EXISTE` u `OMITIDO`/`OMITIRÍA`, con las fotos añadidas,
las que ya estaban, las rechazadas (con el motivo debajo), las que no tienen archivo y las que no caben.
Al final, un resumen. Código de salida: 0 bien; 1 si algún producto falló (lo demás queda hecho:
basta con repetir); 2 si no se empezó (opción mal escrita, falta `DATABASE_URL`, el host no coincide,
no hay `productos.json` o el correo no es del dueño).

Con el paquete del 22/11 y los estados por defecto, la prueba prevé 33 productos nuevos y 3 omitidos:
FableSeat y TargetAlarm (idioma `en`, país US) y Goldpfötchen (país US), porque la app aún no los admite.
