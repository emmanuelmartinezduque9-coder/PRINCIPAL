# kling-el-producto-va-como-elemento

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-03 genere ZIELALARM C2 clip2 «abrir la caja y dentro el producto» con kling declarando embalaje y articulo. kling3_0 solo admite start_image y end_image, asi que esas imagenes NUNCA se enviaron: lanzar.py solo lo avisaba por pantalla y generaba igual, y el modelo se invento un despertador que no es el de la cuenta. Emmanuel: «la ia no puede adivinar mi producto si no es con un elemento».
**Regla:** Si en un clip de KLING se ve el producto o el embalaje, el producto va SIEMPRE como reference element embebido en el prompt con <<<id>>> — kling si admite elementos aunque no admita imagenes adjuntas. Los elementos los puedo crear yo (show_reference_elements action=create) y se anotan en assets.json con papel reference_element. Ya esta tapiado en lanzar.py: un kling con producto declarado y sin <<<id>>> en el prompt no se genera.

```datos
{
 "checklist_frames": [
  "si el clip es de kling y se ve producto o embalaje, el prompt lleva el reference element <<<id>>> de esa cuenta"
 ]
}
```
