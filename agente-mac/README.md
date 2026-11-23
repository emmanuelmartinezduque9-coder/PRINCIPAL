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

Para dar de alta un producto pegando solo la cuenta. Instagram se lee con un Brave sin ventana (una
carpeta temporal, nunca tu perfil de Brave) y tu sesión de Instagram guardada en
`~/.principal-agente-cookies.txt`. Si Instagram cierra la sesión, vuelve a guardarla:

    bash agente-mac/exportar-sesion.sh

(hace falta haber entrado en instagram.com con Brave). TikTok se lee con yt-dlp.
