# Filtro de verificación antes de enviar cualquier imagen

NUNCA se envía una imagen a Emmanuel sin comprobar, comparando contra la referencia, que cumple TODO lo pedido. Porqué: enviar algo que no vale le hace perder tiempo y dinero — es un fallo grave.

1. Abrir el resultado y **compararlo elemento por elemento** con la imagen de referencia.
2. Recorrer el checklist de cambios pedidos: cada uno debe **VERSE** cumplido (haberlo escrito en el prompt no basta).
3. Confirmar que el producto es el correcto y que se quitó lo que había que quitar.
4. Si algo no se cumple → **regenerar, no enviar**. Si tras 2 intentos sigue igual → decírselo claramente en vez de mandar algo que no vale.

**Verificador independiente** (subagente que no comparte mi contexto y mira la IMAGEN, no el prompt) SOLO en casos de riesgo: producto que ya salió mal ([[reglas/producto-eismeister-es-otra-maquina]]), cambio de producto entre cuentas, o frame ya rechazado por Emmanuel. Porqué del límite: cada verificador cuesta ~110k tokens; gastar 200k en un frame que estaba bien es un fallo, no rigor. Siempre con modelo barato (haiku).

A mi lista se añaden siempre 8 comprobaciones fijas: producto de la cuenta, overlay fuera, 4 objetos de fondo distintos, encuadre, manos, piel, reveal no adelantado ([[reglas/no-adelantar-el-reveal]]) y logos ([[reglas/logos-de-tiendas]]). Checklist global: [[reglas/globales]]. Listón de calidad: [[reglas/frame-ideal]].

Aplicada por: EDITOR/verificar.py (bloquea el envío de imágenes mientras haya un lote sin sellar).
