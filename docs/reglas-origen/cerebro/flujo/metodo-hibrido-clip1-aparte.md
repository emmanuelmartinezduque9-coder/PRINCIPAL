# Método C — el clip 1 aparte, el resto de una vez

Pedido por Emmanuel el 2026-09-02: *«quiero que el primer clip tenga su frame separado y a partir
del segundo clip coges la imagen y lo haces completo con memories»*.

Son **dos generaciones**, no una ni siete:

| | qué es | frame | motor |
|---|---|---|---|
| **Generación 1** | solo el clip 1 | fotograma del inicio del vídeo, convertido en frame | el que toque para esa acción |
| **Generación 2** | del clip 2 hasta el final, de una vez | fotograma del **inicio del clip 2** | seedance, que encadena los cortes dentro de un mismo vídeo |

## Por qué tiene sentido

El **clip 1 es el hook**: lo que decide si alguien sigue viendo. Merece su propio frame y su propio
motor, y poder rehacerlo sin tocar el resto.

Del clip 2 en adelante lo que importa es la **continuidad**, y ahí seedance de una tirada va mejor
que coser N clips generados por separado — además de costar dos generaciones en vez de siete.

Frente al **método A** (un clip por escena): mucho menos gasto y sin costuras.
Frente al **método B** (un solo vídeo entero): el arranque no queda a merced de lo que el motor
decida hacer en el segundo 0.

## Cómo se prepara

1. `python3 EDITOR/cortes.py <video.mp4> --fotogramas <carpeta>` — cortes reales y el fotograma de
   inicio de cada escena.
2. El **fotograma 1** se convierte en el frame del clip 1 (patrón FRAME DESDE REFERENCIA).
3. El **fotograma 2** se convierte en el frame de la generación larga.
4. El análisis de Memories del **tramo del clip 2 al final** es el prompt de esa generación.
5. **Comprobar que ese tramo cabe en 15s.** Si no cabe, hay que partirlo o comprimir los tiempos.
6. Se le enseña el plan a Emmanuel antes de generar.

Relacionado: [[motor-por-clip]] · [[pipeline-manana]] · [[por-que-un-prompt-sale-POV-y-otro-sale-rodaje]]
