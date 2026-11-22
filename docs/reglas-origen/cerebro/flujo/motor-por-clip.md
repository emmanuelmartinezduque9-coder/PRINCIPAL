# Elegir el motor clip a clip

Emmanuel: *«tú puedes identificar del vídeo un cambio del clip, digamos, que el primer clip quiero
un frame y generación con Kling y el segundo clip quiero otro frame y generado con Seedance, según
las necesidades de ese vídeo»*. Sí, y está montado en `EDITOR/cortes.py`.

```
python3 EDITOR/cortes.py <video.mp4>                        # tabla clip a clip
python3 EDITOR/cortes.py <video.mp4> --fotogramas <carpeta> # + el fotograma de inicio de cada clip
```

## Lo que hace el script (determinista)

1. Detecta los **cortes de plano** con ffmpeg y sus tiempos exactos.
2. Mide **cuánto movimiento** hay dentro de cada escena.
3. Extrae el fotograma del **inicio exacto** de cada escena — el punto de partida de ese clip.
4. **Propone** motor y segundos, con el motivo.

Antes esto lo escribía yo a mano después del análisis, con sus tiempos: justo donde me podía
inventar un corte o una duración.

## El umbral está calibrado, no elegido a ojo

Con 0,3 salían 3 clips; con 0,2 salen **7**, que son exactamente las 7 escenas que Memories.ai
detectó por su cuenta analizando el mismo vídeo. Dos métodos independientes coincidiendo. Y de 0,2
a 0,08 el resultado se mantiene en 7, así que 0,2 no está al borde.

## El criterio de motor

**Kling** no admite imágenes de referencia: **todo lo que se vea tiene que estar ya en el frame de
partida**. Sirve para **una** acción simple, corta y estable.

**Seedance** sí admite referencia además del frame, encadena varios cortes dentro de un mismo vídeo
y llega a 15s. Sirve para secuencias, para cuando aparece algo que no está en el frame, y para
clips con habla.

De ahí salen los tres criterios medibles que aplica el script:

| condición | motor | por qué |
|---|---|---|
| dura más de 5s | **seedance** | kling se queda corto |
| pasa mucho dentro de la escena (movimiento ≥ 0,12) | **seedance** | kling no encadena sub-acciones |
| una sola acción corta y estable | **kling** | la hace bien, *si* todo lo visible está en el frame |

## Lo que el script NO puede decidir, y lo pongo yo

Estas tres son **narrativas**, no medibles, y son las que mandan sobre la propuesta:

- **¿Aparece algo que no está en el frame de partida?** → seedance obligatoriamente, porque kling no
  puede recibir la imagen del producto.
- **¿Habla alguien?** → seedance, y el prompt declara el idioma de la cuenta.
- **¿Es el arranque de un reveal?** → el frame **no** puede enseñar el producto todavía.
  Ver [[no-adelantar-el-reveal]].

## Y la tabla se le enseña antes de generar

La propuesta no decide. Se le pone delante la tabla —clip, desde, duración, motor, segundos y
motivo— y decide él. Igual que con el `plan` de `lanzar.py`.

Relacionado: [[pipeline-manana]] · [[2026-09-01-kling-no-admite-imagenes-de-referencia]] · [[generacion-de-clips]]
