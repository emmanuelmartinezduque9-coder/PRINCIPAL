# PRINCIPAL — producción de vídeo: de la referencia al clip (diseño, plan 2)

Fecha: 2026-11-22. Estado: decisiones técnicas tomadas por el constructor (delegadas por el dueño);
pendiente de que el dueño lo lea y corrija lo que no encaje.

## Por qué

Emmanuel quiere empezar a **generar vídeos en la web nueva cuanto antes**. La base (cuentas,
productos, reglas, tope de gasto) se está terminando; el motor de ángulos pasa a después de esto.
Hoy un vídeo sale hablando con Codex en su Mac: es caro, solo puede hacerlo él y a veces gasta
créditos dos veces por un mismo fallo.

## Metas

- Desde el móvil: dar un vídeo viral de referencia y un producto, y salir con **un clip generado**
  que repite la idea de la referencia con su producto y su avatar.
- Cada persona usa **su propia cuenta de Higgsfield** y sus propios créditos.
- **Nunca gastar sin avisar**: antes de cada generación se ve cuánto cuesta y cuánto saldo hay.
- Las reglas de Emmanuel (adaptar conceptos, imagen con Nano Banana, vídeo con Seedance) mandan,
  y él puede editarlas en la pantalla Reglas.

## Fuera de alcance (esta entrega)

Montaje con música y ritmo, textos en pantalla, subir la resolución del clip (sale a 480p salvo
que se elija otra), publicar, transcribir el audio y el motor de ángulos. Un vídeo = un clip
(normalmente 4–15 s; el modelo admite hasta 30 s). El sistema del Mac no se toca.

## Lo que lo haría fracasar aunque funcione

- Cobrar dos veces una generación, o gastar créditos sin que la persona lo haya confirmado.
- Un producto que hace cosas que no hace, o una cara que no es la del avatar elegido.
- Que haya que escribir prompts a mano para obtener algo decente.
- Que un colaborador vea vídeos de otro o use la cuenta de Higgsfield de otra persona.
- Que subir un vídeo desde el móvil con mala cobertura falle y haya que empezar de cero.

## Cómo funciona, paso a paso

1. **Conectar Higgsfield** (una vez por persona). Botón «Conectar Higgsfield»: se abre la página
   de Higgsfield, la persona da permiso y vuelve. La web guarda ese permiso cifrado y enseña
   «conectado como…» y los créditos. Nunca ve la contraseña.
2. **Fotos del producto con su papel**: artículo, embalaje, avatar, entorno u otra. Conviene una
   foto del artículo en una mano, para que salga a su tamaño real.
3. **Referencia**. Se sube el vídeo desde el móvil o el ordenador (hasta 100 MB; se envía a
   trozos y, si se corta, sigue donde iba). O se pega un enlace de Instagram o TikTok: eso solo
   funciona si el Mac de Emmanuel está encendido con un programa pequeño que descarga el vídeo y
   lo entrega a la web. La web saca fotogramas, envía un recorte del vídeo al Higgsfield de la
   persona y **no se queda con el vídeo**.
4. **Desglose**. Claude mira los fotogramas, la ficha, las fotos y las reglas, y devuelve: la
   idea del vídeo en una frase, la tabla de planos, el mapa de adaptación (qué hace el original →
   qué hace este producto → qué se ve), los riesgos (funciones que el producto no tiene, enseñar
   el producto antes de tiempo…) y dos textos: el de la **imagen** y el del **clip**. Se pueden
   leer y corregir antes de gastar nada.
5. **Imagen**. La web enseña el precio en créditos y el saldo. Al confirmar, genera 2 candidatas
   (Nano Banana, 2K, vertical). Se aprueba una, o se rechazan diciendo por qué en una línea y se
   regenera: **como mucho 2 regeneraciones**.
6. **Clip**. Igual: precio, saldo, confirmar. Seedance 2.5 usa la referencia solo para cámara,
   ritmo y acción; la imagen aprobada y las fotos ponen el producto y la persona. Movimientos
   parecidos, no idénticos; sin textos en pantalla. Máximo 2 regeneraciones. Al final, descargar.

## Dinero y seguridad

- Cada generación queda **apuntada antes de enviarse** y se envía una sola vez. Si se corta la
  conexión y no se sabe si Higgsfield la recibió, la web **no reenvía**: mira en el historial de
  Higgsfield si llegó, y solo deja repetir cuando es seguro que no.
- Si no hay créditos suficientes, se dice con cifras y no se envía.
- Por cada vídeo se ve lo gastado: créditos de Higgsfield y coste de Claude (este último sigue
  dentro del tope mensual que ya existe).
- El motivo de cada rechazo se guarda: servirá más adelante para la biblioteca de casos.

## Pantallas

- **Producto → pestaña «Vídeos»**: lista y botón «Nuevo vídeo».
- **Nuevo vídeo**, en 4 pasos: Referencia → Desglose → Imagen → Clip.
- **Ajustes**: tarjeta «Higgsfield» (conectar, con qué cuenta, créditos); para el dueño, además,
  el modelo de imagen y el estado del Mac.

Todo en español y pensado para el móvil. Un colaborador solo ve los vídeos de sus productos; solo
quien creó un vídeo puede generar en él, porque se paga con su Higgsfield.

## Riesgos e incógnitas

- **Que Higgsfield no acepte una aplicación propia.** El alta de la web como aplicación ya
  funcionó en una prueba; falta comprobar con la web publicada que deja generar. Es el riesgo
  principal: por eso es la primera tarea y la conexión va aislada, para poder cambiar la vía sin
  rehacer el resto. Además Higgsfield cambia su sistema de alta el 31/12/2026.
- **Los enlaces de Instagram necesitan el Mac.** Sin él, se sube el archivo.
- **Coste real por vídeo**: estimado, unos 4 créditos por las dos imágenes y 3 créditos por
  segundo de clip a 480p (unos 35–50 créditos por un vídeo de 10–15 s sin repetir), más unos
  céntimos de Claude. Se mide con el primer vídeo real.
- **Qué modelo de imagen**: en Higgsfield existen «Nano Banana Pro» y «Nano Banana 2.1». Se
  empieza con Pro (el de sus reglas) y se cambia en Ajustes.
- Usar un vídeo ajeno como referencia puede hacer que Higgsfield rechace el trabajo si reconoce
  marcas o caras.

## Qué tiene que hacer el dueño

1. Publicar la web en Railway siguiendo `docs/despliegue-railway.md` (ya pendiente).
2. Poner la clave de Claude en Railway.
3. Entrar en Ajustes y pulsar «Conectar Higgsfield»; estar presente en dos pruebas cortas (la
   conexión y el primer vídeo real, que gasta unos pocos créditos).
4. Opcional: instalar el programa del Mac para pegar enlaces (guía paso a paso incluida).
5. Decir qué modelo de imagen usa de verdad y revisar las tres reglas nuevas en Reglas.
