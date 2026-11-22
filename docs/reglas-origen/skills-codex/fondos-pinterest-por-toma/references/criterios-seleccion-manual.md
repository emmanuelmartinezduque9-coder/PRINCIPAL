# Evidencia y criterio visual · 17/11/2026

## Alcance comprobado
Revisados 160 encargos inmutables y 87 borradores/lotes del propietario Emmanuel, más dos referencias aportadas expresamente en este chat. Se recuperaron y observaron 49 imágenes únicas: 44 referencias positivas de entorno, tres referencias de producto/ingredientes y dos con rechazos registrados. No es una exportación completa de su cuenta de Pinterest ni acredita todos los pines elegidos en toda su historia.

La evidencia positiva es selección manual en tarjetas más la confirmación del usuario en el encargo actual, o instrucciones expresas del chat. No confundirla con un botón histórico de aprobación de frame. Los pines originales no están verificados en este corpus; conservar esa limitación, aunque Emmanuel indique su procedencia Pinterest. No inventar URLs ni ubicaciones.

Archivo persistente completo: `/Volumes/T7/AUTOMATIZACION SEGA/Referencias/Pinterest-seleccion-Emmanuel-20261117/inventario.json`. Incluye fuentes, tarjetas, notas, decisiones, clasificación, ruta y SHA256. Observaciones por imagen en `revision.md` del mismo directorio; originales inalterados en `originales/`. Contactos `sheet-0.jpg`, `sheet-12.jpg`, `sheet-24.jpg`, `sheet-36.jpg` muestran R00–R46. R47/R48 corresponden a Target/IKEA aportados en el chat. Para inspeccionar un ejemplo abrir su archivo por ID en el inventario; las hojas sirven de índice, no sustituyen observar el candidato real.

## Patrones observados y aplicación
| Familia | Evidencia visual | Aplicación y límite |
|---|---|---|
| EisWerk: disfrutar en casa | R01, R16–18, R20, R22, R26–28, R30–31, R33, R35–41: sofás, mantas, TV, mesas, POV desde asiento, profundidad y objetos cotidianos | Escena habitada, cercana y creíble, superficie para servir. No todos los planos deben ser POV ni llevar TV. |
| EisWerk: preparación | R02, R23–24, R43: islas y encimeras, ventanas, horno/fregadero, luz plausible | La preparación necesita superficie útil, espacio para manos/máquina; personas incidentales no son avatares. |
| Frío y almacenamiento | R29: congelador de supermercado con recipientes | La función manda. Para una cocina doméstica buscar congelador doméstico compatible, no sustituirlo por sofá ni copiar un congelador comercial sin motivo. |
| Compra y regalo | R09, R12, R21, R25, R32, R47, R48: mercancía, etiquetas, pasillos y carros | Comercio real con perspectiva compatible; verificar cadena y mercado. R47 muestra Target; R48 IKEA. R04 muestra Liverpool, no Target. |
| FableSeat | R05–06: rincones de escritorio blancos/pastel, pantallas, silla, decoración personal | Afinidad con princesas y uso de silla; espacio donde realmente encaja el producto, no palacio arbitrario. |
| HaarZauber | R14: peluquería en uso con espejos, sillas, puestos y personas | Entorno funcional cotidiano, no vestíbulo de hotel. Solo hay una muestra de esta cuenta: no atribuir una preferencia amplia no demostrada. |
| Coche/frío | R11, R45–46: interior real, nieve en coches y calle | Coherencia de POV, volante, clima y problema. R46 es nocturna pero la nota pide mañana: la instrucción prevalece. Ubicación sin verificar. |
| Otros espacios | R00 dormitorio, R13/R15 salones, R44 recepción clínica | Transferir función, encuadre y cotidianeidad; no el mismo decorado a todo producto. |

Navidad aparece mucho por el periodo del corpus: árbol, mantas y luz cálida expresan contexto de temporada, no una obligación perpetua. Los ejemplos de día y de noche son ambos válidos; flash solo cuando lo piden las notas (R31). R34 tiene acabado más editorial y fue una selección manual: no ignorar la elección expresa ni usarla para promover arquitectura de catálogo automáticamente.

## Exclusiones
- R03: camiseta/producto; R19: textura/receta de helado; R42: paquete Oreo/ingrediente. Aunque figuraban con rol fondo, no entrenar el criterio de escenarios con ellas.
- R07 y R08: rechazos explícitos registrados. Excluir del conjunto positivo. No sabemos el motivo exacto: no afirmar que el usuario rechaza todos los salones nocturnos o todos los POV.
- No copiar caras de personas, mensajes superpuestos, marcas accidentales ni películas como identidad del producto.

## Traducción a búsquedas (ejemplos, no pines ya verificados)
- Consumo doméstico navideño EisWerk: `gemütliches Wohnzimmer Weihnachten Sofa Perspektive Couchtisch`.
- Preparación EisWerk: `Küche Arbeitsplatte Alltag Fenster Tageslicht`; añadir Navidad solo si procede.
- HaarZauber: `Friseursalon Deutschland Bedienplatz Spiegel Innenansicht Alltag`.
- FableSeat EE. UU.: `pastel blue pink cozy desk setup real room chair`.
- Sacar del congelador: `open home freezer kitchen eye level photo`; comprobar puertas, escala y gesto.
- Tienda: nombre real + país/ciudad + `interior checkout aisle photo`; abrir y contrastar fuente.

Para cualquier producto nuevo identificar primero su uso, audiencia y acción, elegir la familia funcional más cercana y buscar un entorno propio del producto. Registrar qué rasgo se transfiere; no asumir que una máquina, un peine y una alarma necesitan el mismo salón.
