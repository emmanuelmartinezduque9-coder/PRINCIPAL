# Alta de producto nuevo (skill nuevo-producto)

**Disparador:** Emmanuel pasa imagen del producto + qué es + país donde lo testea. Se ejecuta la secuencia entera sin pedir nada más.

**Paso 1 — Nombres de marca** (siempre primero, sin generar nada aún): proponer 5 candidatos, cada uno con su significado y por qué transmite confianza, + UNA recomendación clara. Esperar a que elija.

**Patrón de nombres** (aprendido de sus marcas reales): dos palabras pegadas en CamelCase, en el **idioma del país**; palabra 1 = producto o beneficio, palabra 2 = refuerzo de calidad/oficio/función; 2-4 sílabas, fácil para un nativo, suena a marca real del país. Ejemplos reales: **EisWerk** (*Eis* helado + *Werk* taller/oficio, DE), **GelatoVivo** (*Gelato* + *Vivo* fresco, IT), **ZielAlarm** (*Ziel* objetivo + *Alarm*, DE), **KuschelGrinch** (*Kuschel* mimos + *Grinch*, DE), **TargetAlarm** (USA). Evitar: genéricos tipo "ShopX", inglés fuera de USA/UK, marcas registradas.

**Paso 2 — 4 assets fijos** (nano_banana_pro, 2K): **logo** (tipografía limpia + icono simple del producto, fondo blanco, aire de retail europeo), **caja** (packaging fotorrealista con el logo, texto en el idioma del país, vista 3/4), **producto-mockup** (producto SOLO sobre blanco puro, calidad e-commerce; se guarda como asset PRODUCTO y es el imgcomplemento de los vídeos — la imagen que subió Emmanuel es solo referencia) y **avatar** (persona del país, foto UGC, única fuente de rostro). Todo a `NanoBanana/[CUENTA]/_assets/`.

**Paso 3 — Alta en el sistema:** panel (ACTIVAS, ASSETS, grupos, conceptos vacíos), registro, CONCEPTOS.md, CLAUDE.md, carpetas. Confirmar que la cuenta está lista para lotes.

**Baja** ("ya no voy a testear X"): quitar de ACTIVAS → desaparece del panel. **NUNCA borrar archivos, assets ni medias.** Porqué: todo queda intacto por si se retoma (regla nº8 de [[reglas/globales]]).

Ver [[plantillas/cuenta-nueva]] y un alta real: [[cuentas/HerzPfote]].
Aplicada por: skill .claude/skills/nuevo-producto/ + PANEL/generate_panel.py.
