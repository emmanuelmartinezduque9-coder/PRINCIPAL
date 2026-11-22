# Prompts de la fase C (pedido 54)

Primera prueba real del método «Seedance 2.5 guiado por la referencia» (`reglas/video-seedance.md`, plantilla
[Referencias]/[Resumen]/[Planos]/[Mantener]). Los textos van tal cual se enviaron.

| Archivo | Vídeo | Motor y parámetros | Job | Resultado |
|---|---|---|---|---|
| `V10-seedance.txt` | V10 FalterPfote | `seedance_2_5`, `omni_reference`, 14 s, 480p, `bitrate_mode: high`, 9:16, `generate_audio: true`, `use_unlim: false` | 769c9e55-c61c-4d83-aee0-27f8b8eb0477 | Aceptado a la primera; Topaz 36539885 |
| `V11-seedance.txt` | V11 FalterPfote | ídem | 4ef0f16b-da97-4b90-a602-fb56adc21a27 | Aceptado a la primera; Topaz 1a2f961c |
| `V06-genjutsu.txt` | V6 HaarZauber | `hf_mult_motion_control` (Genjutsu), 480p, `use_unlim: false` | 540c3252-e858-49ee-998d-adceebf077de | Aceptado a la primera; Topaz 455ada66 |

Medios enviados (ids de Higgsfield):
- V10: `video_references` 0b1c5954 (reel de referencia, con rótulos quemados); `start_image` 7f5c4d17 (frame aprobado
  c21b3fa0: manos con alas de disfraz rosas sobre un border collie); `image_references` en este orden: 670520c4
  (collar-proyector), 936c27f6 (proyección de alas de mariposa), b2cfb6f5 (paseo del puerto), aeac749d (calle de
  terrazas de noche), 603c56f6 (plaza con edificios clásicos), 9543123a (camino del parque con farolas).
- V11: `video_references` 1ac185d9; `start_image` f59513c5 (frame aprobado f1936e19: mujer con golden retriever en la
  acera); `image_references`: 670520c4, 936c27f6, b2cfb6f5, 78bb6b2b (calle residencial de noche), 9543123a.
- V6: `video_references` 02e9e3c3 (ref.mp4 de V6, subido en esta fase); `image_references` d8416232 (frame
  06-HaarZauber.png aprobado, subido en esta fase) y d33a220a (cepillo blanco, variante `articulo_blanco`).

Decisiones del método que conviene revisar:
- El frame aprobado se mandó como `start_image` (modo «primer fotograma») aunque el clip tiene varias escenas, porque el
  sistema antiguo lo había fijado como «clean opening frame». En el texto no se le pone etiqueta `@Image`: se le llama
  «the start image», y las imágenes de referencia se numeran desde `@Image1`, además descritas con palabras por si la
  numeración de Higgsfield contara también la imagen inicial.
- `@Video1` llevaba los rótulos quemados de la referencia; con la exclusión explícita no apareció ningún texto.
- Los cortes salieron casi en su sitio: V11 3,33 / 7,08 / 8,88 / 11,71 s (referencia 3,4 / 7,13 / 8,9 / 11,87);
  V10 4,0 / 7,38 / 10,25 / 13,0 s (referencia 4,0 / 7,43 / 9,23 / 11,83).
- Las imágenes del producto no muestran el collar en una mano (regla de escala con mano): no había esa foto entre los
  assets del pedido y no se inventó.
