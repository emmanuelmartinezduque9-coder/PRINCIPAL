# Reglas globales — aplican a TODA generación

- Los prompts de biblioteca se usan LITERALES; adaptar = sustituciones declaradas + contrato de escena.
- Toda referencia de imagen va POR NOMBRE con su papel. Un frame del panel jamás es referencia de producto.
- Si el producto va tapado TODO el clip, su mockup no se pasa (la caja da la forma del bulto).
- El color del producto lo manda EL FRAME, no la cuenta.
- Al terminar de generar: registro + archivo + entrega diaria, automáticos.
- Verificador visual independiente SOLO en casos de riesgo, y SIEMPRE en modelo barato (haiku).

Ver: [[reglas/frame-desde-referencia]] · [[reglas/filtro-de-verificacion]] · [[sistema/una-sola-puerta-para-video]]

```datos
{"checklist_frames_global": [
  "el producto que se ve es el de la cuenta, no el del anuncio de referencia ni otro recoloreado",
  "no queda NADA del overlay de la competencia: caption, emojis, play, sonido, marca de agua",
  "el fondo esta REDISEÑADO: al menos 4 objetos concretos distintos de la referencia",
  "para frame_inicial: encuadre, pose y distancia iguales a la referencia; para referencia_contextual de Seedance largo: composición propia que muestre producto, avatar e interacción completos",
  "manos correctas y del mismo sexo que la referencia",
  "piel con textura real, sin plastico ni filtro",
  "para frame_inicial de un reveal: el frame NO enseña el producto antes de tiempo; para referencia_contextual: el artículo SÍ es visible para enseñar su uso y el inicio del vídeo se evalúa por separado",
  "logos y carteles bien escritos y legibles"],
 "prohibido_global": ["lorem ipsum", "(?<!no )\\bwatermark"]}
```
