# Textos desde referencia, sin depender del chat · 2026-09-13

Petición de Emmanuel: enlace del original → detectar los textos y sus cambios →
copiar o traducir → reutilizar la edición en Creatomate. Música elegida por
número/segundo en la app. No pedirle redactar alemán ni dictar todos los tiempos.

La implementación vive en **Montaje**, `EDITOR/reference_texts/`; no crear otra
sección. OCR local, cola SQLite y proceso independiente del chat. Por petición
posterior del 13 septiembre, la traducción usa Codex con la cuenta ChatGPT del
propietario: una sesión efímera, sin herramientas, vídeo ni historial del chat.
No usa Apple Translation ni API de pago como alternativa. Traduce solo los bloques
con [[traduccion-organica]], cargada de verdad; guarda caché y recibo del envío.
Consume el uso compartido de Codex; si está agotado, espera. Consulta operativa:
`EDITOR/reference_texts/README.md`.

Reglas que no deben perderse:

- Revisar una vez los textos de la plantilla; guardar correcciones en su snapshot.
  Reutilizar esa versión sin repetir OCR/traducción/aprobación para cada regeneración.
- Un texto dura lo que el vídeo. Los cambios se vinculan a sus planos; nunca
  estirar/repetir clips para ajustarlos a la duración de una plantilla.
- Una receta alternativa es un vídeo completo. En C1 no concatenar M&M, galletas,
  etc. por estar registradas como «clips»: seleccionar la receta concreta.
- La copia no reescribe palabras; OCR no garantiza recuperar emojis/comillas.
  Traducción nueva requiere revisión inicial: no presentarla como alemán perfecto.
- Música e inicio se heredan por concepto. No sustituir una canción ni confirmar
  sus derechos comerciales por el usuario.
- No confundir detector de cambios de plano con detector del gesto que interesa
  recortar. Estructura ambigua se señala; nada de inventar correspondencias.
- La app funciona sin conversación, no sin ordenador: Mac encendido/despierto y
  app iniciada. No afirmar servicio cloud, autoarranque al reiniciar o aprendizaje.
- No afirmar actualización de plantilla remota cuando solo se compiló RenderScript;
  no afirmar vídeo exportado cuando únicamente hay previsualización/borrador.

Véase [[biblioteca-musica-y-recortes]] y [[textos-classic-creatomate]].
