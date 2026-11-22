# Indicaciones del dueño para el montaje (22/11/2026)

Dichas por Emmanuel en el chat; son requisitos del montador con ritmo.

1. **Vídeos hechos con Genjutsu**: llevan el mismo audio que el original, así que el ritmo ya viene dado; no hay que resincronizar.
2. **Vídeos en los que él elige la canción**: el **drop tiene que caer cuando se muestra el producto**, que normalmente es en el **segundo o tercer clip**. El montador debe identificar bien en qué momento se muestra el producto y colocar ahí el drop.
3. **Los cambios de escena deben ir con el ritmo de la canción**: que tengan sentido, más conexión con el cliente, más enganche, que retengan más.
4. **Mini zooms** para hacer el vídeo más dinámico y menos estático.

Pendiente de concretar con ejemplos reales: cuánta intensidad de zoom, cada cuánto, y qué vídeos suyos considera bien montados.

## Respuestas del dueño (22/11/2026, más tarde)

- **Canción elegida manda siempre**: si eligió una canción para un vídeo, se usa esa canción aunque el vídeo se haya hecho con Genjutsu (vale para V6 y V9 del pedido 54).
- **El drop va al empezar el cuerpo** (cuando aparece el producto en sí). Se irá afinando con más pruebas.

## Clips que el dueño da por buenos (22/11/2026)

- `hf_20261121_173216_263f4aa8-b3a8-4129-9f8d-93074e496d32.mp4`: "este vídeo sí está bien, solo le falta la edición".
- `hf_20261121_172138_88a7e7b3-5b6c-47e1-9834-b8479bf07a8b.mp4`: "este gancho también está bien". Es un gancho generado para unirlo a un cuerpo reutilizado.

Lo que el dueño da por bueno no se regenera.

## Requisito para la web: ganchos + cuerpos reutilizados y biblioteca de clips

Dicho por el dueño: una de sus formas de trabajar es **generar solo el gancho y reutilizar como cuerpo un vídeo que ya hizo**; elige la **canción** y el **vídeo de referencia de edición**, y recibe el vídeo **ya editado**. La web tiene que permitirlo.

Para eso necesita una **biblioteca con todos los vídeos generados en la cuenta**, que al elegir "reutilizar un vídeo como cuerpo" **cargue bien y rápido** y deje **ver cada vídeo antes de seleccionarlo**. Con Codex, al compartir la aplicación, no cargaba nada e iba muy lento (los archivos estaban en su Mac y se perdían).

Consecuencia técnica (decisión del constructor): los clips generados y sus miniaturas tienen que guardarse en la nube (almacén de objetos), no depender del Mac ni de enlaces de Higgsfield que caducan; la vista previa debe ser ligera (miniatura + vídeo reducido).
