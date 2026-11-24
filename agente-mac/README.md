# Agente del Mac

Un programa pequeño que se queda encendido en tu Mac. Cuando pegas en la web un enlace de
Instagram, TikTok, YouTube o Facebook, la web no puede descargarlo (Instagram no deja entrar a los
servidores). Tu Mac sí: este programa lo descarga con `yt-dlp` y se lo entrega a la web. El vídeo
no se queda en el Mac.

En **Canciones → Pegar enlace** pasa lo mismo con una canción (también de SoundCloud): el Mac saca
el audio como MP3 y la canción entra en la biblioteca, lista para marcarle el drop.

Desde la versión 1.4.0 el Mac **ya no monta vídeos**: el montaje se hace en la nube. El Mac solo
descarga enlaces: las referencias que pegas en la web, las canciones y, además, los enlaces que
necesita el montaje en la nube y que la nube no puede traer (la referencia de edición de Instagram,
o el «Audio original» cuando viene de un enlace). Si el Mac está apagado, el vídeo se monta igual
sin esos enlaces y la web te lo dice.

Usa la sesión de Instagram que tengas abierta en **Brave** en este Mac. Para vídeos privados hace
falta que esa sesión esté abierta en Brave.

## 1. Comprobar que el Mac tiene lo que hace falta

Abre Terminal y escribe estas tres líneas, una cada vez:

```
yt-dlp --version
ffmpeg -version
node -v
```

- La primera tiene que responder una fecha, por ejemplo `2026.11.01`.
- La segunda, un texto que empieza por `ffmpeg version`.
- La tercera, `v22` o un número mayor.

Si alguna dice «command not found», no sigas: hay que instalar eso primero.

## 2. Crear la ficha

La ficha es la llave con la que este Mac entra en la web.

1. En la web, entra en **Ajustes → Mac**.
2. Pulsa **Crear ficha**.
3. Pulsa **Copiar**. La ficha solo se enseña esa vez: si la pierdes, crea otra.

## 3. Instalar

Desde la carpeta del proyecto:

```
bash agente-mac/instalar.sh
```

El instalador:

1. Comprueba que `node`, `yt-dlp` y `ffmpeg` están donde el arranque automático los va a buscar. Si
   falta alguno, lo dice y no instala nada.
2. Te pide la ficha: **pégala y pulsa Intro**. No se ve mientras la pegas, es normal. La guarda en
   `~/.principal-agente.json`, que solo puedes leer tú.
3. Copia el programa a `~/.principal-tools/agente-mac/` y lo deja arrancando solo cada vez que
   enciendes el Mac.

Se puede lanzar las veces que haga falta (por ejemplo, después de actualizar el programa): si la
ficha ya está guardada, no la vuelve a pedir.

No escribas la ficha en la misma línea que el comando: se quedaría guardada en el historial del
terminal.

## 4. Comprobar

En la web, **Ajustes → Mac** tiene que decir **«Conectado»**.

Si quieres ver lo que hace sin instalarlo (para probar), con la ficha ya guardada:

```
node agente-mac/agente.mjs
```

Tiene que escribir «Conectado con https://…». Para pararlo, `Ctrl+C`. Si el agente instalado ya
está en marcha, este segundo se cierra solo: solo puede haber uno.

## Cambiar la ficha

Borra el archivo y vuelve a instalar; te la pedirá otra vez:

```
rm ~/.principal-agente.json
bash agente-mac/instalar.sh
```

## Cómo saber si está funcionando

- En la web: **Ajustes → Mac** dice «Conectado» y hace cuánto dio señales.
- En el Mac: `tail -f ~/Library/Logs/principal-agente.log` enseña lo que va haciendo.

## Pararlo o quitarlo

- Pararlo: `launchctl bootout gui/$(id -u)/com.principal.agente`
- Volver a encenderlo: `bash agente-mac/instalar.sh`
- Quitarlo del todo: páralo y borra `~/Library/LaunchAgents/com.principal.agente.plist`,
  `~/.principal-tools/agente-mac/` y `~/.principal-agente.json`. En la web, **Ajustes → Mac →
  Revocar**.

## Si algo no va

- **«Ficha revocada o incorrecta»**: la ficha se revocó o está mal copiada. Crea otra en Ajustes →
  Mac y cámbiala (ver «Cambiar la ficha»).
- **«No se puede lanzar yt-dlp»** (o `ffmpeg`): mientras falte, el agente no recoge ningún enlace
  (no los da por fallidos: esperan en la cola). Instálalo; en un minuto como mucho sigue solo.
- **Un enlace corto de compartir no va** (`fb.watch/…`, `facebook.com/share/…`,
  `instagram.com/share/…`): abre el vídeo en Brave y copia la dirección de la barra (la que lleva
  `/reel/…`, `/watch/…` o `/p/…`). Por seguridad, el agente solo descarga la dirección directa del
  vídeo y no sigue saltos a otras páginas.
- **Un enlace falla siempre**: prueba a abrirlo en Brave en este Mac. Si ahí no se ve (vídeo
  privado, borrado o sesión cerrada), el programa tampoco puede. Sube el archivo del vídeo.
- **Tarda mucho**: cada enlace tiene 4 minutos como mucho; pasado ese tiempo se corta y la web te
  lo dice.


## 1.5.0: leer perfiles de Instagram y TikTok (23/11/2026)

Para dar de alta un producto pegando solo la cuenta. Instagram se lee con un Chrome (o Brave) sin ventana
(una carpeta temporal, nunca tus perfiles de navegador) y tu sesión de Instagram guardada en
`~/.principal-agente-instagram.txt` (aparte del archivo de cookies de yt-dlp). Si Instagram cierra la sesión, vuelve a guardarla:

    bash agente-mac/exportar-sesion.sh

(copia la sesión de Chrome, del perfil que tenga Instagram iniciado; si no hay, de Brave). TikTok se lee con yt-dlp.

## 1.6.0: buscar referencias en Pinterest (23/11/2026)

Cada imagen inicial lleva fotos reales de Pinterest como referencia (regla fija del dueño). La web
busca primero desde la nube; si Pinterest no la deja, pide la búsqueda a este Mac: el agente hace la
misma petición al buscador de pines de Pinterest desde tu conexión (sin sesión, sin abrir Brave) y
entrega la respuesta. Solo pide direcciones de `www.pinterest.com/resource/BaseSearchResource/get/`.
Para tenerlo, vuelve a lanzar `bash agente-mac/instalar.sh`.

## Datos en el SSD

En el Mac de Emmanuel todo va al T7: ver `docs/datos-en-ssd.md` y `disco-ssd.sh`.

## 1.8.0: Claude de tus lotes con tu plan, no con la API (24/11/2026)

Todo lo que hace Claude en tus lotes (desglose, prompts, elegir referencias, revisión de imágenes,
clasificar reportes, nichos…) lo hace ahora el **Claude Code de este Mac con tu plan Max**, no la
API. La web sigue en la nube igual; solo cambia quién piensa.

Una sola vez:

    bash agente-mac/instalar.sh
    bash agente-mac/conectar-claude.sh

El segundo abre el navegador para que entres con tu cuenta de Claude (como cuando inicias sesión) y
te da una ficha que empieza por `sk-ant-oat`: pégala cuando la pida (no se ve al pegarla). Se queda
en `~/.principal-agente-claude.json`, solo legible por ti, y nunca va a la web.

- En **Ajustes → Mac** el Mac dice «Claude Code 2.x» y, debajo, **Claude para tus lotes**: «Mac
  primero» (por defecto: si el Mac está apagado, sin sesión o en el límite del plan, esa llamada va
  por la API dentro del tope), «Solo Mac» (espera al Mac; nunca gasta API) o «Solo API» (como antes).
  También cuántas llamadas hizo el Mac este mes y cuánto habrían costado en la API.
- Hace hasta 4 llamadas a la vez, sin herramientas (solo buscar y leer en internet cuando la llamada
  lo pide), en una carpeta temporal vacía y con 10 minutos como mucho cada una. No lee tus CLAUDE.md,
  tu memoria ni tus plugins, y no guarda las conversaciones.
- Las llamadas de las demás personas siguen por la API con sus topes.
- Si Claude Code dice que llegaste al límite del plan, el Mac descansa 30 minutos y mientras tanto va
  por la API (o espera, con «Solo Mac»).
