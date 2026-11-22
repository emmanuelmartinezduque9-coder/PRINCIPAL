# ZielAlarm — alemán · despertador con diana y pistola de juguete

Alta 2026-09-01 (cuenta que Emmanuel ya tenía, incorporada al sistema).
**Es la cuenta ORIGINAL del prompt [[prompts/BIBLIOTECA_PROMPTS]] › «1,2,3»** — por eso ese prompt
ya está en alemán y ya nombra el elemento *zielalarm*: para esta cuenta **no lleva ninguna sustitución**.

## El producto
Base negra mate de despertador con **display LED rojo**, botones arriba, y una **diana circular negra**
con anillos blancos montada de pie detrás. Se acompaña de un **blaster de juguete de plástico negro mate**
(accesorio ligero, no metálico). Mecánica: suena la alarma → disparas a la diana → se apaga.

## Sin avatar fijo — actualización de Emmanuel 01/10/2026
Cada vídeo puede llevar una persona distinta de la biblioteca activa de avatares.
Emmanuel autoriza al asistente a elegirla según la escena sin preguntar avatar por avatar.
No generar nuevas identidades ni cambiar el avatar fijo de otras cuentas; una selección explícita del usuario prevalece.

## Caja compartida
Comparte la **misma caja** con [[cuentas/TargetAlarm]], igual que [[cuentas/EisWerk]] y [[cuentas/Gelatovivo]].

Reglas que hereda: [[reglas/globales]] · [[reglas/frame-desde-referencia]] · [[reglas/calidad-de-video]]

```datos
{"idioma": "German", "color": "negro",
 "avatar_fijo": false,
 "checklist_frames": [
  "el producto es el despertador negro con la DIANA circular de anillos detras y el display LED rojo",
  "el accesorio se ve como un juguete de plastico mate, nunca como un arma real de metal",
  "la persona del video procede de la biblioteca activa autorizada, salvo selección explícita del usuario"],
 "prohibido": ["(?<!toy )\\breal (gun|firearm|pistol)\\b", "\\bammunition\\b", "\\bbullets?\\b"],
 "palabras_producto": ["alarm clock", "the target\\b", "toy blaster", "toy accessory", "LED display", "product out of", "the full product"],
 "imagenes_de_la_cuenta": {"embalaje": "8dfae2b5-387b-4e89-a05b-c6a822f8eef9", "marca": "a00a7b4a-574b-4b97-abb8-e14085541329", "articulo": "103b13af-1cc9-4e8d-8c62-bdc4a8b8564d"}}
```
