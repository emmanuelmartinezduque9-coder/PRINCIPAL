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
