# PRINCIPAL — producción de vídeo: de la referencia al clip (diseño, plan 2)

Fecha: 2026-11-22. Estado: decisiones técnicas tomadas por el constructor (delegadas por el dueño);
pendiente de que el dueño lo lea y corrija lo que no encaje.

## Por qué

Emmanuel quiere **generar vídeos en la web nueva cuanto antes**. La base ya está publicada; el
motor de ángulos pasa a después. Hoy un vídeo sale hablando con Codex en su Mac: es caro, solo
puede hacerlo él y a veces paga dos veces un fallo.

## Metas

- Desde el móvil: dar un vídeo viral de referencia y un producto, y salir con **un clip generado**
  que repite la idea con su producto y su avatar.
- Cada persona usa **su propia cuenta de Higgsfield** y sus créditos.
- **Nunca gastar sin avisar**: antes de cada generación se ve cuánto cuesta y cuánto saldo hay.
- Mandan las reglas de Emmanuel (adaptación, imagen, vídeo), editables en la pantalla Reglas.

## Fuera de alcance (esta entrega)

Montaje con música, textos en pantalla, subir la resolución del clip, publicar, transcribir el
audio y el motor de ángulos. Un vídeo = un clip (normalmente 4–15 s; máximo 30).

## Lo que lo haría fracasar aunque funcione

- Cobrar dos veces una generación, o gastar créditos sin confirmación.
- Un producto que hace cosas que no hace, o una cara que no es la del avatar elegido.
- Tener que escribir prompts a mano.
- Que un colaborador vea vídeos de otro o use el Higgsfield de otra persona.
- Que una subida con mala cobertura obligue a empezar de cero.

## Cómo funciona, paso a paso

1. **Conectar Higgsfield** (una vez por persona). La persona da permiso en la página de
   Higgsfield y vuelve. La web guarda ese permiso cifrado (nunca la contraseña) y enseña
   «conectado como…» y los créditos.
2. **Fotos del producto con su papel**: artículo, embalaje, avatar, entorno u otra. Conviene una
   foto del artículo en una mano, para que salga a su tamaño real.
3. **Referencia.** Se sube el vídeo (hasta 100 MB; va a trozos y, si se corta, sigue donde iba) o
   se pega un enlace de Instagram o TikTok, que solo funciona con el Mac de Emmanuel encendido
   (un programa pequeño descarga el vídeo y lo entrega). La web saca fotogramas, envía un
   recorte al Higgsfield de la persona y **no se queda con el vídeo**.
4. **Desglose.** Claude mira los fotogramas, la ficha, las fotos y las reglas, y devuelve: la idea
   en una frase, los planos, el mapa de adaptación (qué hace el original → qué hace este
   producto → qué se ve), los riesgos (funciones que el producto no tiene, enseñarlo antes de
   tiempo…) y dos textos: el de la **imagen** y el del **clip**. Se leen y corrigen antes de gastar.
5. **Imagen.** Precio en créditos y saldo a la vista. Al confirmar, 2 candidatas (Nano Banana, 2K,
   vertical). Se aprueba una, o se rechazan diciendo por qué en una línea y se regenera: **como
   mucho 2 regeneraciones**.
6. **Clip.** Igual: precio, saldo, confirmar. Seedance 2.5 toma de la referencia solo cámara,
   ritmo y acción; la imagen aprobada y las fotos ponen el producto y la persona. Movimientos
   parecidos, no idénticos; sin textos en pantalla. Máximo 2 regeneraciones. Al final, descargar.

## Dinero y seguridad

- Cada generación queda **apuntada antes de enviarse** y se envía una sola vez. Si se corta la
  conexión y no se sabe si Higgsfield la recibió, la web **no reenvía**: mira en el historial de
  Higgsfield si llegó y solo deja repetir cuando es seguro que no.
- Sin créditos suficientes, se dice con cifras y no se envía.
- Por vídeo se ve lo gastado: créditos de Higgsfield y coste de Claude (dentro del tope mensual).
- El motivo de cada rechazo se guarda (servirá a la biblioteca de casos).

## Pantallas

- **Producto → pestaña «Vídeos»**: lista y «Nuevo vídeo».
- **Nuevo vídeo**, en 4 pasos: Referencia → Desglose → Imagen → Clip.
- **Ajustes**: tarjeta «Higgsfield» (conectar, cuenta, créditos); para el dueño, además, el modelo
  de imagen y el estado del Mac.

Todo en español y para el móvil. Solo quien creó un vídeo genera en él: se paga con su
Higgsfield.

## Riesgos e incógnitas

- **Que Higgsfield no acepte una aplicación propia.** El alta de la web ya funcionó en una
  prueba; falta comprobar que deja generar. Es el riesgo principal: por eso es la primera tarea y
  la conexión va aislada, para cambiar de vía sin rehacer el resto. Además, Higgsfield cambia su
  sistema de alta el 31/12/2026.
- **Los enlaces de Instagram necesitan el Mac** (la descarga ya está probada allí). Sin él, se
  sube el archivo.
- **Coste real por vídeo**: estimado, 4 créditos por las dos imágenes y 3 por segundo de clip a
  480p (35–50 créditos por 10–15 s sin repetir), más céntimos de Claude. Se mide con el primer
  vídeo real.
- **Modelo de imagen**: existen «Nano Banana Pro» y «Nano Banana 2.1». Se empieza con Pro (el de
  sus reglas) y se cambia en Ajustes.
- Higgsfield puede rechazar un trabajo si reconoce marcas o caras en la referencia.

## Qué tiene que hacer el dueño

1. Publicar la web en Railway y poner la clave de Claude: **ya hecho**
   (`https://principal-production-6265bcf2.up.railway.app`).
2. Pulsar «Conectar Higgsfield» en Ajustes y estar presente en dos pruebas cortas (la conexión
   y el primer vídeo real, que gasta unos pocos créditos).
3. Opcional: dejar encendido el programa del Mac para pegar enlaces (guía incluida).
4. Decir qué modelo de imagen usa de verdad y revisar las tres reglas nuevas en Reglas.
