# Detector de Montaje: cartel junto al hook, caja y falso cambio por emoji

Caso comunicado por Emmanuel: `https://www.instagram.com/reel/DdFK1eBgEZY/`.
Referencia `927b1227d28385ce369d85639aa93909`, hash fuente
`937f4f39a8a9c3d38b9f4685da2a10e239cfc0330d9eaef48cc43ce6d5081a07`.

## Qué fallaba

El detector v5 generaba siete bloques: frases impresas en la caja, ACTION leído
como IACTION/WACTION mezclado con el hook, y el mismo hook partido por un «3»
que Apple Vision leía sobre el emoji 😂. Esas lecturas tenían confianza 1.0:
la confianza de OCR no acredita que sea un caption ni que haya cambiado.

## Corrección v6

- Antes de agrupar líneas, `reference_texts/visual.py` compara píxeles de letras
  claras con contorno oscuro. Solo excluye lecturas pequeñas de estilo distinto
  cuando coexiste un headline claramente contorneado. Sin evidencia no excluye.
- `ocr.blocks` exige alineación además de tamaño/cercanía. Un cartel lateral no
  se incorpora al hook solo por estar encima.
- Un sufijo numérico sospechoso solo deja de fragmentar si al menos dos frames
  apoyan la lectura base y los píxeles coloreados del sufijo no han cambiado.
  No se fusionan palabras, números normales ni emojis reconocidos por semejanza.
- La app puede actualizar lecturas hechas por un detector anterior al pulsar
  Detectar. Conserva una copia de la revisión anterior y NO sobrescribe
  correcciones manuales. La coordinación de fondo no activa esa actualización.
  Los snapshots de conceptos existentes son independientes y no se reescriben.

## Resultado y límites

La ruta real produce hook 0–9 s y CTA 9–11.133333 s; no cambia el MP4 ni sus
cortes. El procesamiento de píxeles usa PIL/NumPy en el trabajador local, sin
API, nuevos agentes ni gasto de generación. Los otros dos casos reales siguen
con dos bloques y sus intervalos previos.

La identificación general de emojis NO está resuelta. Una prueba local con
plantillas de Apple produjo falsos positivos y se descartó antes del despliegue.
El «3» no se convierte a 😂 por una excepción escrita para este vídeo: queda
avisado como símbolo pendiente. El criterio visual es conservador para captions
contorneados, no un clasificador universal de texto de escena.

Pruebas: `EDITOR/test_reference_visual.py`, `EDITOR/test_reference_texts.py`,
`EDITOR/correccion_ocr_20260913_checkout/probe.py` y `ui_probe.cjs`.
No volver a declarar fiabilidad general por pasar únicamente tests sintéticos.
