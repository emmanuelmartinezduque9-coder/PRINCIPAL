Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/frame.py y /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/frame_model.py

# Puerta de frames: listas y comprobaciones (frame.py, frame_model.py)

## Modelo y parámetros

```
LEGACY='nano_banana_pro'
DEFAULT='nano_banana_2_1'
FIELDS=('image_model','resolution','thinking_level','is_inpaint')
def command(task,operation='create',*,prompt=None,refs=None,aspect=None):
    if operation not in ('create','cost'):raise ValueError('Unsupported image operation')
    p=parameters(task)
    cmd=['higgsfield','generate',operation,p['image_model'],'--prompt',task.get('prompt') if prompt is None else prompt,
         '--resolution',p['resolution'],'--aspect-ratio',aspect or task.get('aspecto') or '9:16','--json']
    if 'thinking_level' in p:cmd+=['--thinking-level',p['thinking_level']]
    if 'is_inpaint' in p:cmd+=['--is-inpaint','false']
    for ref in task.get('refs',[]) if refs is None else refs:cmd+=['--image-references',ref]
    return cmd
```
## Tope de intentos

```
TOPE_INTENTOS = 2
```
## LISTA_NEGRA

```
LISTA_NEGRA = re.compile(
    r"\bcinematic\b|\bstudio[- ]?lit\b|\bstudio light|\bsoftbox\b|three[- ]point light|"
    r"\bgolden hour\b|\bcolor grading\b|teal and orange|\bmoody\b|dramatic lighting|"
    r"professional photograph|product photograph|\bcommercial\b|\beditorial\b|\bstock photo\b|"
    r"hyper[- ]?realistic|ultra[- ]?realistic|\b8k\b|\bmasterpiece\b|award[- ]winning|"
    r"\bstunning\b|\bbreathtaking\b|octane render|unreal engine|subsurface scattering|"
    r"\bbokeh\b|shallow depth of field|flawless skin|perfect skin|\bdewy\b|\bporcelain\b|"
    r"\bairbrushed\b|glowing skin|\bradiant\b", re.I)
```
## BLOQUES

```
BLOQUES = re.compile(r"^[A-Z][A-Z /—\-\[\]0-9]{6,}:", re.M)
```
## SIN_OVERLAY

```
SIN_OVERLAY = re.compile(r"only lettering visible|no on-screen text|carries no text|"
                         r"no caption|without any text over|no text overlay|"
                         r"no interface|unedited snapshot with nothing added", re.I)
```
## OCULTO

```
OCULTO = re.compile(r"completely hidden|stays hidden|fully cover|stays fully covered|"
                    r"nothing of (it|the product|the contents) (shows|is visible)|"
                    r"do not uncover|must stay (completely )?hidden|opaque and stays closed|"
                    r"sheet is opaque", re.I)
```
## Mensajes de las comprobaciones de `preparar()` (literal)

- [{…}] ya se han gastado {…} imágenes en este frame y no vale. REGLA DE EMMANUEL: se para en dos, no se genera una tercera. Enséñale lo que hay, dile qué no consigues y que decida él. Si él pide otra, añade "insistir": "me lo ha pedido él".
- [{…}] {…} y {…} son EL MISMO PRODUCTO: adaptar entre ellas es solo cambiar el idioma del prompt, NO se generan frames nuevos. Reutiliza los frames del concepto original.
- [{…}] falta «prompt_archivo»: el prompt de un frame vive en un fichero, no suelto, para poder volver a usarlo y auditarlo.
- [{…}] el CEREBRO veta «{…}» y el prompt lo dice en positivo (línea {…}: «{…}»)
- [{…}] falta «en_pantalla»: hay que declarar QUÉ SE VE del producto en el frame — embalaje / articulo / articulo_en_mano — o [] con «sin_producto».
- [{…}] «articulo_en_mano» NO se adjunta a ninguna generacion. Las imagenes validas son la referencia y el MOCKUP del producto (y el embalaje si sale la caja). Usa "articulo".
- [{…}] hay varias imágenes de «{…}» ({…}): declara la variante, p.ej. "{…}:rosa"
- [{…}] «{…}» es {…}, un FRAME del panel: un frame no se adjunta jamás como imagen de producto.
- [{…}] el prompt dice que el producto queda OCULTO en este frame y aun así declaras que se ve {…}. Si va tapado, no se adjunta su imagen: empuja al modelo a dibujarlo. Usa "en_pantalla": [] y "sin_producto": "va tapado, es el arranque de un reveal".
- [{…}] declaras que se ve el ARTÍCULO pero el prompt nunca lo enseña, solo habla de cajas. Si lo que se ve es la caja, es «embalaje».
- [{…}] «estudio» no vale para un AVATAR: su cara se usa en contenido orgánico y no puede tener acabado de estudio.
- [{…}] este frame sale de un vídeo del lote de Mañana y su escena dice: «{…}». Hay que declararlo en "analisis_escena" y que el prompt lo respete: el frame tiene que tener sentido con lo que pasa en el vídeo.
- [{…}] lo declarado en «analisis_escena» no se parece a lo que dice el análisis del vídeo: «{…}».
- [{…}] no se declara nada visible y no se dice por qué. Pon "sin_producto": "<motivo>".
- [{…}] la referencia del mensaje apunta a {…}, que es un FRAME del panel: arrastra su escena entera. Usa una foto del objeto, no un frame.
- [{…}] el avatar apunta a {…}, que es un FRAME del panel. Un frame entero no se adjunta: arrastra su escena. Usa una foto de la persona.
- [{…}] se adjunta un avatar pero el prompt no dice que de ahí sale la identidad de la persona. Sin esa frase el modelo mezcla las dos caras: tiene que decir «the person is the woman in image [N] and only her».
- [{…}] la referencia de realismo es {…}, un frame del panel: usa una foto real, no una generada.
- [{…}] se adjunta una referencia de REALISMO pero el prompt no dice que sea solo de estilo. Sin esa frase el modelo copia sus objetos. Tiene que aparecer «REALISM REFERENCE ONLY».
- [{…}] ya se eligió un avatar para este frame: quitar «{…}» de extras para no mezclar identidades
- ⛔ {…}: falta el scope estable del motor; preparar/enviar mediante production_engine, no generar directamente
- ⛔ {…}: workspace histórico desconocido; reconciliar antes de consultar o subir
- ⛔ {…}: descarga distinta del original guardado; conservar ambos y revisar: {…}
- ⛔ {…}: no se pudo conservar el original sin sobrescribir; guardar descarga y revisar: {…} ({…})
- ⛔ {…}: workspace histórico desconocido; reconciliar antes de subir, no asumir la cuenta actual
