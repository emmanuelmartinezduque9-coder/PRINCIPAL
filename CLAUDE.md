# Instrucciones para agentes

- Lee `README.md` y `docs/` antes de empezar.
- No modifiques el repositorio `finanzas-tiendas` (ni su base de datos) desde este proyecto salvo
  petición expresa del dueño. De Finanzas solo se leen datos.
- Nunca guardes secretos en el repositorio.
- Apunta las decisiones de diseño en `docs/`.

## Reglas fijas del flujo de vídeos (Emmanuel, 23/11/2026) — no se negocian

Emmanuel no lee análisis ni avisos: para eso están las reglas del motor (`reglas/`,
`docs/reglas-motor-del-dueno.md`). Cualquier cambio en vídeos o lotes tiene que cumplir esto:

1. **Flujo automático de principio a fin.** Referencia → desglose → imagen → clip → montaje se
   encadenan solos (`src/server/videos/autopilot.ts` para el vídeo suelto, `lote.ts` para el lote),
   dentro de los topes de gasto, el saldo y el presupuesto del lote que ya existen.
2. **Sin avisos.** Los «riesgos» del desglose son instrucciones internas que el motor aplica en los
   prompts: nunca se pintan como tarjetas ni paran nada (como mucho, plegados en «Detalles técnicos»).
3. **Sin botones de confirmar generación.** Nada de «Generar N imágenes · Esto cuesta X créditos»,
   «Generar clip», «Hacer el desglose», «Montar» o «Confirmar y generar» en el camino normal.
4. **Una imagen por vídeo por defecto.** Más solo si él lo pide en la tarjeta (`videos.frame_count`)
   o en el lote (`batches.frame_count`). Un clip por vídeo.
5. **Solo preguntas obligatorias.** Se para únicamente con **una** pregunta concreta que solo él puede
   decidir (avatar obligatorio sin elegir, variante, canción, falta la foto del artículo, no hay
   saldo o se pasa del tope, Higgsfield sin conectar, un fallo que no se repite solo porque cuesta)
   y sigue solo en cuanto responde. Nunca preguntas por preguntar ni riesgos.
6. La única parada rutinaria es mirar la imagen (regla 2 del motor: «tras la aprobación visual,
   clips y ediciones sin otra ronda»); un rechazo se regenera solo dentro de sus rondas.

Las pruebas `tests/flujo-automatico.test.ts` fijan estas reglas: si una cambia, falla.

## Regla fija del dueño: referencias de Pinterest (no olvidar)

- **Toda imagen inicial (Nano Banana) lleva SIEMPRE fotos reales de Pinterest como referencia**, también
  al regenerar una imagen rechazada. Solo si el dueño pone una referencia de entorno a mano en el vídeo o
  la tarjeta, no se busca. Lo pidió tres veces (22 y 23/11/2026).
- **Orden vigente (23/11/2026): de momento NO se busca en Pinterest.** Se reutiliza el banco de referencias
  que él ya aprobó (`reference_bank`, sembrado desde `reglas/banco-referencias.json`; crece con cada imagen
  aprobada que llevaba referencia a mano). La app elige sola la que encaja; él no elige nada. `BANK_ONLY`
  en `pinterest.ts`: no lo pongas a `false` sin una orden expresa suya.
- **Excepción (24/11/2026, orden expresa de Emmanuel):** si la tarjeta, la nota o las indicaciones nombran una
  tienda o un lugar concreto (dm, Sephora, Lidl, Aldi, Rossmann, Zara…), NO se usa el banco: se buscan en
  Pinterest fotos reales del interior de esa tienda en el país del producto (`scene.namedPlace`), con la
  redacción de tienda del método aprobado. El banco sigue para todo lo demás.
- Está en código, no solo en texto: `src/server/videos/pinterest.ts` (búsqueda, elección con visión,
  almacén), `frame.ts` (la imagen no se pide sin ellas) y `reglas/referencias-pinterest.md` (qué buscar
  según la escena). No lo quites ni lo hagas opcional sin una orden expresa del dueño.
- **Lo que ya funcionaba en Codex (`/Volumes/T7/AUTOMATIZACION SEGA`) se copia tal cual y después se mejora.** Nunca se rehace desde cero ni se «compara»: prompts, skills de Nano Banana, referencias, montaje.
