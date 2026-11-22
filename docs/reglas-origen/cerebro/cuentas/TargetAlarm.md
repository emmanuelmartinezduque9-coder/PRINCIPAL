# TargetAlarm — inglés (USA) · mismo producto que ZielAlarm

Alta 2026-09-01. **Mismo producto y misma caja** que [[cuentas/ZielAlarm]]; lo que cambia es el
mercado: **Estados Unidos, todo hablado y escrito en inglés americano**.

## El producto
Idéntico a [[cuentas/ZielAlarm]]: despertador negro con diana circular y display LED rojo, más el
blaster de juguete de plástico negro mate.

## Sin avatar fijo
Cada vídeo lleva una persona distinta; Emmanuel pasa la imagen en cada encargo.

## Idioma — la única adaptación
El «1,2,3» de la biblioteca está escrito en alemán para ZielAlarm. Para esta cuenta,
`EDITOR/sustituciones.json` lo pasa a inglés («One… Two… Three… Let's see how it turned out»).
Ver [[logica/biblioteca-de-prompts]].

Reglas que hereda: [[reglas/globales]] · [[reglas/frame-desde-referencia]] · [[reglas/calidad-de-video]]

```datos
{"idioma": "English", "color": "negro",
 "avatar_fijo": false,
 "checklist_frames": [
  "el producto es el despertador negro con la DIANA circular de anillos detras y el display LED rojo",
  "el accesorio se ve como un juguete de plastico mate, nunca como un arma real de metal",
  "cualquier texto o habla en escena esta en INGLES americano, nunca en aleman",
  "la persona del video es la que paso Emmanuel para ESE encargo, no un avatar reutilizado"],
 "prohibido": ["(?<!toy )\\breal (gun|firearm|pistol)\\b", "\\bammunition\\b", "„", "\\bEins\\b", "\\bZwei\\b", "\\bDrei\\b", "\\bGerman\\b"],
 "palabras_producto": ["alarm clock", "the target\\b", "toy blaster", "toy accessory", "LED display", "product out of", "the full product"],
 "imagenes_de_la_cuenta": {"embalaje": "8dfae2b5-387b-4e89-a05b-c6a822f8eef9", "marca": "c54d9876-2943-465e-a670-29e31de45a24", "articulo": "103b13af-1cc9-4e8d-8c62-bdc4a8b8564d"}}
```
