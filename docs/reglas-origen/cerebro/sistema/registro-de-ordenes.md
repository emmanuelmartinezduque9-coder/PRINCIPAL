# Registro de órdenes — decir siempre cuáles se pueden olvidar

Emmanuel manda 5-6 órdenes encadenadas por mensaje («y por ahí derecho…», «y otra cosa…»). Las primeras se hacen; **las últimas se evaporan**. Prometer recordarlas no sirve.

**Lo PRIMERO de cada mensaje con más de una orden**: apuntarlas todas y enseñarle la tabla con el riesgo de olvido de cada una, ANTES de ejecutar nada.

```
python3 EDITOR/ordenes.py registrar <ordenes.json>   # abre el turno y saca la tabla
python3 EDITOR/ordenes.py hecho   <n> "<qué se hizo>"
python3 EDITOR/ordenes.py aplazar <n> "<por qué no ahora>"
```

Riesgo ALTO cuando: va colgada con un conector («y por ahí derecho», «y también») · es una regla permanente sin entregable visible («siempre», «nunca») · él mismo avisa («recuerda») · depende de que otra cosa termine primero.

El hook Stop del [[sistema/guardia]] **impide terminar el turno con órdenes pendientes**: cada una acaba HECHA o APLAZADA con motivo, y se le dice en la respuesta. Las órdenes marcadas como corrección alimentan además [[sistema/lecciones-aprendizaje-forzado]].

Aplicada por: EDITOR/ordenes.py + EDITOR/guardia.py (Stop)
