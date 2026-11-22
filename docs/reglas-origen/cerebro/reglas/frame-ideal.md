# Frame ideal — el listón de calidad

`REFERENCIA_CALIDAD/FRAME_IDEAL.png` es el frame validado por Emmanuel como **el nivel a igualar siempre**. Su prompt exacto vive en `REFERENCIA_CALIDAD/FRAME_IDEAL_prompt.txt`.

Antes de dar por bueno cualquier frame, **compararlo con ese**. Se regenera (no se envía) si sale:
- más plano o con menos textura,
- con aspecto de IA,
- con el fondo demasiado parecido a su referencia.

Porqué: el objetivo del proyecto es hiperrealismo estilo "foto de celular real"; este frame es la vara concreta que evita aprobar por debajo de ese nivel.

Es parte del [[reglas/filtro-de-verificacion]] y la meta del paso 8 (realismo iPhone) de [[reglas/frame-desde-referencia]]. El estándar de escritura para alcanzarlo es `maestro_fondo_realismo_fewshot_corregido.md` (estructura de 8 bloques + realismo iPhone). Y la orden permanente: empujar el realismo un poco más cada vez.
