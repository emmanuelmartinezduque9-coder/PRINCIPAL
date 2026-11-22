# Agente del Mac

Un programa pequeño que se queda encendido en tu Mac. Cuando pegas en la web un enlace de
Instagram, TikTok, YouTube o Facebook, la web no puede descargarlo (Instagram no deja entrar a los
servidores). Tu Mac sí: este programa lo descarga con `yt-dlp` y se lo entrega a la web. El vídeo
no se queda en el Mac.

Usa la sesión de Instagram que tengas abierta en **Brave** en este Mac. Para vídeos privados hace
falta que esa sesión esté abierta en Brave.

## 1. Comprobar que el Mac tiene lo que hace falta

Abre Terminal y escribe estas dos líneas, una cada vez:

```
yt-dlp --version
node -v
```

- La primera tiene que responder una fecha, por ejemplo `2026.11.01`.
- La segunda tiene que responder `v22` o un número mayor.

Si alguna dice «command not found», no sigas: hay que instalar eso primero.

## 2. Crear la ficha

La ficha es la llave con la que este Mac entra en la web.

1. En la web, entra en **Ajustes → Mac**.
2. Pulsa **Crear ficha**.
3. Pulsa **Copiar**. La ficha solo se enseña esa vez: si la pierdes, crea otra.

## 3. Guardar la ficha en el Mac

Crea un archivo llamado `.principal-agente.json` en tu carpeta personal con este contenido,
poniendo tu ficha donde dice `pra_…`:

```json
{
  "url": "https://principal-production-6265bcf2.up.railway.app",
  "token": "pra_…"
}
```

La forma más cómoda, en Terminal:

```
nano ~/.principal-agente.json
```

Pega el contenido, cambia la ficha, y guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

## 4. Probar

Desde la carpeta del proyecto:

```
node agente-mac/agente.mjs
```

Tiene que escribir **«Conectado con https://…»**. En la web, **Ajustes → Mac** dirá «Conectado».
Para pararlo, `Ctrl+C`.

## 5. Dejarlo siempre encendido

```
bash agente-mac/instalar.sh
```

Copia el programa a `~/.principal-tools/agente-mac/` y lo deja arrancando solo cada vez que
enciendes el Mac. Se puede lanzar las veces que haga falta (por ejemplo, después de actualizar el
programa).

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

- **«La web no reconoce la ficha de este Mac»**: la ficha se revocó o está mal copiada. Crea otra
  en Ajustes → Mac y cámbiala en `~/.principal-agente.json`.
- **«No se encuentra yt-dlp»**: instálalo y vuelve a lanzar `bash agente-mac/instalar.sh`.
- **Un enlace falla siempre**: prueba a abrirlo en Brave en este Mac. Si ahí no se ve (vídeo
  privado, borrado o sesión cerrada), el programa tampoco puede. Sube el archivo del vídeo.
- **Tarda mucho**: cada enlace tiene 4 minutos como mucho; pasado ese tiempo se corta y la web te
  lo dice.
