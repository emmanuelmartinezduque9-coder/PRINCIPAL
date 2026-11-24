# Encargo para Codex: programas del móvil (24/11/2026)

Objetivo: el Mac de Emmanuel maneja un iPhone extra para publicar los tests de sus productos, sin gastar el plan de Claude. Los pasos fijos los hace un programa sin IA; solo una pantalla inesperada se consulta a Codex.

## Lo que ya funciona
- iPhone 11, iOS 26.1, interfaz en ITALIANO. UDID 00008030-000539D13668C02E.
- WebDriverAgent corriendo en http://192.168.1.139:8100, en la Wi-Fi de casa. Se arranca con:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test-without-building -xctestrun /Volumes/PRINCIPAL-DATOS/xcode/wda/Build/Products/WebDriverAgentRunner_iphoneos27.2-arm64.xctestrun -destination id=<UDID>`.
- Helper de prueba: `wda_basico.py`. Hace sesión, url, shot, tap, hold (no vale: para pulsar largo hay que usar /actions con pause de 2000 ms), click por predicado y launch. El tamaño en puntos es 414×896.
- Flujo comprobado a mano: poner la foto de perfil de Instagram.
  1. Servir la imagen por HTTP en la IP del Mac (`ipconfig getifaddr en0`).
  2. Abrir esa URL en Safari (com.apple.mobilesafari) y pulsar largo sobre la imagen → «Salva in Foto».
  3. Abrir Instagram (com.burbn.instagram) → pestaña de perfil (abajo a la derecha) → «Modifica» → «Modifica immagine o avatar» → «Scegli dalla libreria». La última foto ya sale elegida → «Fine» → esperar → cerrar con la X.
  4. Si sale «Mantieni aggiornata la tua immagine… Account Meta», cerrar con la X. NUNCA pulsar «Continua».

## Qué hay que hacer (en Python, en esta carpeta)
1. `movil.py`, una biblioteca sobre WDA con:
   - sesión;
   - esperar un elemento por etiqueta;
   - tocar por etiqueta antes que por coordenadas;
   - captura de pantalla;
   - pulsación larga;
   - escribir texto;
   - volver a la pantalla de inicio de la app.
   Las etiquetas, en italiano con alternativa en español e inglés.
2. `foto_perfil.py <imagen> [--app instagram|facebook]`: el flujo de arriba, de principio a fin.
3. `publicar_reel.py <video.mp4> --texto <archivo.txt> --app instagram|facebook`:
   - pasa el vídeo a Fotos del iPhone por el camino que funcione en un iPhone real (por ejemplo, Safari → compartir → «Salva video»; si no hay otro, documenta el que uses);
   - crea un reel con ese vídeo, sin música añadida;
   - pega el texto (la descripción ya viene escrita en alemán);
   - publica;
   - guarda una captura del resultado;
   - con `--simular`, se queda justo antes de pulsar «Condividi» o «Pubblica» y saca la captura. Sirve para probar sin publicar.
   - En Facebook se publica como reel en la cuenta que esté abierta.
4. Si una pantalla no es la esperada (aviso, actualización, permiso), el programa se para y sale con código 3, una captura y un JSON con la pantalla (fuente de WDA resumida). No toca nada «a ciegas».
   - Opcional: `--ayuda-codex` llama a `codex exec` con la captura para proponer el siguiente toque. Solo para cerrar avisos inofensivos, nunca para aceptar términos, vincular cuentas, iniciar sesión ni pagar.
5. Un README corto con cómo se usa.

## Límites
- No publiques nada de verdad: prueba solo con `--simular` y con la foto de perfil, que ya está puesta y se puede volver a poner igual: es el logo de SofaLeiste, /private/tmp/claude-501/-Volumes-T7-PRINCIPAL-APP/a366887f-65d5-4209-9093-bd0acfdbe2a6/scratchpad/sofaleiste-logo.jpg.
- No cambies ajustes de la cuenta ni aceptes nada de Meta.
- No escribas contraseñas.
- Todo en esta carpeta. Los temporales, en /Volumes/PRINCIPAL-DATOS/tmp.
