# Publicar PRINCIPAL en Railway (guía paso a paso)

Esta guía la sigues tú, a mano, en el navegador. Tardas unos 20 minutos. Vas a crear dentro de
tu proyecto de Railway (el mismo donde está Finanzas) **dos servicios nuevos**: una base de datos
y la web. No se toca nada de Finanzas.

Antes de empezar ten a mano tu gestor de contraseñas y una terminal (en Mac: la app "Terminal").

## 1. Crear la base de datos nueva

1. Entra en <https://railway.com> y abre tu proyecto.
2. Pulsa **New** (arriba a la derecha) → **Database** → **Add PostgreSQL**.
3. En tu proyecto ya hay un cuadro de la base de datos de Finanzas (probablemente se llama
   `Postgres`). **No es ese.** El cuadro **nuevo** es el que acaba de aparecer. Ábrelo →
   **Settings** → en **Service Name** escribe `Postgres-principal` y pulsa Enter. Hazlo ahora
   mismo, para no confundirlas.
4. Con `Postgres-principal` abierto, entra en la pestaña **Data**: tiene que estar **vacía** (sin
   tablas). Si ves tablas, es la de Finanzas: te has equivocado de cuadro.

> Tiene que ser una base de datos **nueva**. No uses nunca la de Finanzas: mezclar las dos
> estropearía los datos de ambas.

## 2. Crear el servicio de la web

1. Pulsa **New** → **GitHub Repo** → elige **PRINCIPAL**. Si no aparece, pulsa
   **Configure GitHub App** y da permiso a ese repositorio.
2. Abre el servicio nuevo → **Settings**:
   - **Service Name**: `principal`.
   - **Branch** (rama): `main`.
   - Activa **Wait for CI** (Railway espera a que pasen las pruebas antes de publicar).
   - **Healthcheck Path**: escribe `/api/health`.

## 3. Variables del servicio `principal`

Abre el servicio `principal` → pestaña **Variables** → **New Variable**. Crea estas, una por una
(nombre a la izquierda, valor a la derecha):

| Variable | Valor | Para qué sirve |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres-principal.DATABASE_URL}}` (escríbelo tal cual, con las llaves) | Le dice a la web dónde está su base de datos. |
| `VAULT_KEY` | una clave nueva, ver más abajo | Protege las conexiones que se guarden (por ejemplo la de Higgsfield). |
| `PRINCIPAL_CLOUD` | `1` | Avisa a la web de que está en internet y no en tu ordenador. |
| `TZ` | `Europe/Berlin` | Pone la hora de Alemania en los registros. |
| `OWNER_EMAIL` | tu correo | Prepara el enlace para crear tu cuenta de dueño. |
| `ANTHROPIC_API_KEY` | la clave de Claude, ver más abajo | Permite que la web use la IA de Claude. |

**Cómo crear `VAULT_KEY`.** En la terminal escribe:

```
openssl rand -base64 32
```

Te imprime una línea de unos 44 caracteres que **termina en `=`**. Cópiala **exactamente** como
sale, **incluido el `=` del final**, sin espacios ni comillas, y pégala como valor. Tiene que
quedar pegada tal cual la imprime el comando. **Guárdala también en tu gestor de
contraseñas**: si se pierde, las conexiones guardadas dejarían de poder leerse y habría que
volver a hacerlas. Y tiene que ser **distinta** de la clave de Finanzas: no copies la de la otra
app.

**Cómo crear `ANTHROPIC_API_KEY`.**

1. Entra en <https://console.anthropic.com> → **API Keys** → **Create Key**. Ponle de nombre
   `principal-web`.
2. Tiene que ser una clave **nueva, creada solo para esta web**. No uses nunca una clave que hayas
   pegado alguna vez en un chat o en un documento: se considera ya no secreta.
3. En la misma consola, en los ajustes de límites (**Limits**), pon un **límite mensual de gasto**
   (el diseño de la web cuenta con 30 USD al mes) para que nunca se pueda gastar más.
4. Copia la clave (empieza por `sk-ant-`) y pégala como valor de la variable. Solo se muestra una
   vez.

Después de guardar `DATABASE_URL`, mira el valor que muestra Railway: tiene que nombrar
`Postgres-principal` (o, al abrirla, apuntar a esa base) y **no** la base de datos de Finanzas.

Si aparece el botón **Deploy** (o **Apply changes**) arriba, púlsalo para que Railway aplique las
variables.

Al guardar las variables Railway empieza a publicar. Es normal que de momento falle o no responda:
falta el paso siguiente.

## 4. Darle una dirección a la web

1. En el servicio `principal` → **Settings** → **Networking** → **Generate Domain**.
2. Copia la dirección que aparece (algo como `principal-production-xxxx.up.railway.app`).
3. Vuelve a **Variables** y crea `PUBLIC_URL` con esa dirección **empezando por `https://`**,
   por ejemplo `https://principal-production-xxxx.up.railway.app` (sin barra al final).

| Variable | Valor | Para qué sirve |
| --- | --- | --- |
| `PUBLIC_URL` | la dirección de tu web, con `https://` | Para que los enlaces de invitación apunten a la dirección correcta. |

Si aparece el botón **Deploy** (o **Apply changes**) arriba, púlsalo para que Railway aplique las
variables.

## 5. Esperar y crear tu cuenta

1. Ve a **Deployments**. Espera a que el último despliegue diga **Active** (unos 3 a 5 minutos).
2. En ese despliegue pulsa **View logs** y busca la línea que dice
   **`Enlace para crear la cuenta del dueño`**. Al final tiene un enlace largo.
3. Ábrelo en el navegador y elige tu contraseña. El enlace sirve **una sola vez** y dura 7 días.
4. Mientras no lo uses, el enlace **se vuelve a escribir en el registro cada vez que la web
   arranca**, y solo vale el **más reciente**: si hay varios, coge el de las líneas más nuevas
   (las de más abajo).
5. Cuando ya hayas entrado, **borra la variable `OWNER_EMAIL`** (pulsa los tres puntos junto a
   ella → **Delete**).

## 6. Comprobar que todo va bien

- Abre `<tu dirección>/api/health`. Debe mostrar algo como `{"ok":true,"version":"a1b2c3d"}`.
- Entra con tu correo y contraseña.
- Abre la pantalla **Productos** desde el móvil: se tiene que ver bien y poder crear un producto.

## Vídeos (ffmpeg) — por verificar

Los vídeos de referencia se procesan en el servidor con `ffmpeg` y `ffprobe`. Para que estén en
la imagen de Railway, el repositorio trae `railpack.json` (solo paquetes del sistema:
`deploy.aptPackages: ["ffmpeg"]`); los ajustes de publicación y de salud siguen en `railway.json`.

**Estado: por verificar.** Desde el código no se puede comprobar qué lee Railway, así que tras el
primer despliegue con este cambio quien coordina mira el registro:

- Si **no** sale el aviso `[nube] Aviso: falta ffmpeg…`, funciona y se quita la marca «por verificar».
- Si sale, se pone con la CLI de Railway una de estas variables en el servicio `principal` y se
  vuelve a desplegar:
  - `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg` (constructor actual, Railpack);
  - `NIXPACKS_APT_PKGS=ffmpeg` (si el servicio usa el constructor antiguo, Nixpacks).
- Cuál hizo falta: _(anotarlo aquí tras comprobarlo)_.

Tú no tienes que hacer nada. Mientras falte ffmpeg la web arranca con normalidad y solo fallan
los vídeos de referencia.

## Higgsfield (conexión de cada persona)

Cada persona conecta **su propia** cuenta de Higgsfield en **Ajustes**. No hace falta ninguna
clave de Higgsfield en Railway. Lo que sí importa:

- `PUBLIC_URL` debe ser la dirección pública de la web (`https://…up.railway.app`): con ella se
  construye la dirección de vuelta `<PUBLIC_URL>/api/higgsfield/callback`. Si cambia, la web se
  vuelve a registrar sola en Higgsfield y cada persona tiene que conectar otra vez.
- `PRINCIPAL_HIGGSFIELD_CLIENT=cimd` (opcional): en lugar de registrarse, la web se identifica con
  su documento público `<PUBLIC_URL>/api/higgsfield/cliente`. Solo se pone para probarlo; sin ella,
  registro dinámico.
- `PRINCIPAL_HIGGSFIELD_FAKE` **nunca** en Railway: es el Higgsfield simulado para el propio
  ordenador y la web no arranca en la nube si está puesta.
- El proceso en segundo plano lee el saldo de cada conexión cada 6 horas (no gasta créditos) y lo
  anota en la tabla `higgsfield_probe_log`.

## Publicar un cambio más adelante

Quien trabaja en el código (Claude) sube los cambios con `git push origin main`. Entonces:
GitHub pasa las pruebas automáticas (CI) → si salen bien, Railway publica solo la versión nueva
(gracias a **Wait for CI**) → si la nueva versión no arranca, Railway sigue sirviendo la anterior.
Tú no tienes que hacer nada.

Un texto corregido en `reglas/` no sustituye las reglas que ya están guardadas en la base de datos: para cambiarlas, edítalas en la pantalla Reglas.

## Si algo falla

Abre **Deployments** → **View logs**. Las líneas que empiezan por `[nube]` dicen qué falta:

| Mensaje en el registro | Qué hacer |
| --- | --- |
| `Falta DATABASE_URL (la base de datos).` | Crea la variable `DATABASE_URL` con el valor `${{Postgres-principal.DATABASE_URL}}`. |
| `Falta VAULT_KEY (la clave que protege las conexiones guardadas).` | Crea `VAULT_KEY` con el resultado de `openssl rand -base64 32`. |
| `VAULT_KEY debe ser una clave de 32 bytes en base64.` | Se copió mal (cortada, con espacios o comillas). Genera otra con el mismo comando y pégala entera, tal cual sale. Si ya había conexiones guardadas con la anterior, hay que repetirlas. |
| `En la nube no se puede desactivar el inicio de sesión (PRINCIPAL_AUTH=off).` | Borra la variable `PRINCIPAL_AUTH`. |
| `PUBLIC_URL debe empezar por https://.` | Corrige `PUBLIC_URL`: tiene que empezar por `https://`. |
| `Esta base de datos es la de Finanzas: PRINCIPAL necesita la suya propia.` (sale como `[nube] No se pudo preparar la base de datos: ...`) | `DATABASE_URL` apunta a la base de Finanzas. Cámbiala a `${{Postgres-principal.DATABASE_URL}}`, la del cuadro nuevo. |
| `No se pudo preparar la base de datos: ...` (otro texto) | La base no responde o la dirección está mal. Revisa `DATABASE_URL` y que `Postgres-principal` esté activo. |
| `No se pudo lanzar la web` / `el proceso en segundo plano` | Pulsa **Redeploy**; si se repite, avisa a quien mantiene el código. |
| `Aviso: falta ffmpeg: no se podrán procesar vídeos de referencia.` | No es un error: la web funciona, pero sin vídeos. Avisa a quien mantiene el código: pone `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg` (o `NIXPACKS_APT_PKGS=ffmpeg`) en el servicio y vuelve a desplegar. Ver «Vídeos (ffmpeg)». |
| `Aviso: Falta ANTHROPIC_API_KEY: la IA no funcionará hasta añadirla.` | No es un error: la web funciona, pero sin IA. Añade `ANTHROPIC_API_KEY` cuando tengas la clave. |

Otros casos:

- **No encuentro el enlace de la cuenta.** Comprueba que `OWNER_EMAIL` existe y que aún no has
  creado ninguna cuenta. Pulsa **Redeploy** y mira las líneas nuevas del registro.
- **El enlace dice que no vale.** Se ha usado ya o es uno antiguo: busca el más reciente.
- **El despliegue se queda esperando (Wait for CI).** Mira la pestaña **Actions** del repositorio
  en GitHub: si las pruebas fallan, Railway no publica.
- **`/api/health` no responde.** Mira los registros: casi siempre falta o está mal una variable
  de la tabla de arriba.
