# Inventario y exportación del sistema antiguo (fase 1)

Generado el 22/11/2026 en el Mac del dueño. Solo lectura sobre el sistema antiguo; no se ha tocado la web PRINCIPAL ni su base de datos ni Finanzas.

- **Paquete de exportación:** `/Volumes/T7/PRINCIPAL/importacion/` (en el Mac, disco T7).
- **Tamaño total del paquete:** 825,039,962 bytes (787 MiB), 323 ficheros de medios (fotos, canciones, avatares, capturas de textos) más 6 JSON/MD.
- **Scripts y registros:** `~/.principal-tools/importacion/` (`exportar.py` es el exportador; se puede relanzar, es idempotente).
- **Datos reales en este repositorio:** `docs/importacion/datos/` (`manifest`, `productos`, `canciones`, `avatares`, `textos-ganadores` completos; `conceptos` solo muestra, ver más abajo).

## 1. Recuento por categoría

| Categoría | Cantidad | Detalle |
|---|---|---|
| Productos / cuentas | 74 | 47 cuentas del sistema de vídeo (active 36, retired 2, hidden 8, unclear 1) + 27 productos testeados que solo figuran en PRODUCTOS COMPARTIDOS / InventarioProductos (sin cuenta ni assets propios) |
| Fotos copiadas al paquete | 237 | 245 entradas de foto, 237 archivos únicos (una misma imagen puede cumplir varios roles); jpg/png/webp ≤ 8 MB, sin convertir; sha256 verificado de cada una |
| Fotos sin archivo local | 46 | solo existe el id de Higgsfield (no se descargó nada) |
| Canciones (por sha256 único) | 57 | 56 archivos MP3 en la biblioteca, varios duplicados por contenido; 31 tienen marcador de drop guardado a mano |
| Conceptos de referencia | 323 | 495 clips; 58 conceptos con enlace de reel de origen; 172 con al menos un clip con archivo final |
| Referencias virales EisWerk | 10 | TOP 10 de @eiswerrk (enlace, vistas, hash); los MP4 no se copian |
| Textos ganadores | 10 | familias de la biblioteca del 14/11/2026, con su captura PNG |
| Avatares | 21 | 19 con archivo exportado; 2 omitidos por pesar más de 8 MB |

### Formato del paquete (resumen para quien escriba el importador)

El importador de productos ya existe: `scripts/importar-productos.ts`; cómo lanzarlo desde el Mac contra Railway en `docs/importacion/importador.md`.

- `productos.json`: array; cada producto: `slug, origin ('cuenta'|'producto-testeado'), name, status, statusBasis, statusEvidence, language, countries, summary, sharedWith, variants, avatarLibraryIds, photos[], missingRoles, photosAvailableFromShared`. Cada foto: `role (articulo|embalaje|avatar|otro), label, key, higgsfieldId, file (relativo al paquete, o null), sha256, source (ruta original), primary, bytes, missing?, notes?`. No existe ningún asset `entorno` por cuenta en el sistema antiguo (ver 6).
- `canciones.json`: `songs[]` con `id, title, aliases, numbers, durationS, sha256, suggestedStartS, dropSeconds, drops[] (histórico de revisiones), r2Approved, usedBy[], file`; más `reglaR2` y `notaLicencia`.
- `conceptos.json` (≈2,0 MB; no copiado aquí entero): `concepts[]` (cuenta, número, nombre, descripción de CONCEPTOS.md, tipo, estructura, motores, enlaces, vídeos fuente, `delivered`, clips con prompt), `viralReferences[]`, `accountSections`. Esquema y 14 ejemplos en `datos/conceptos.sample.json`; resumen por cuenta en `datos/resumen-conceptos.json`.
- `conceptos.json` real: 1.997.285 bytes, sha256 `2c6fb3e86e7148626f853497e8701e33bdaedc4858fa23b2943c521a51eab7e1`.
- Los JSON de `datos/` son los del paquete reescritos sin sangrado (mismo contenido; se comprobó el sha256 de cada copia).

## 2. Cuentas y productos

Fotos: A = artículo, E = embalaje, V = avatar (cara fija), O = otros (logo, web, mockups, variantes) con archivo real copiado. «Faltan» = rol sin ningún archivo local.

| Cuenta | Estado | Idioma | Producto (una frase, fuente en `summarySource`) | Fotos | Faltan | Compartido / variantes |
|---|---|---|---|---|---|---|
| BrauForm (`brauform`) | active | de | Maquillaje de cejas con polvo, pincel y plantillas | A1 E1 V1 O0 | — | — |
| DISCOMAGIA (`discomagia`) | retired | it | discos magneticos musicales para nevera | A0 E0 V0 O0 | articulo, embalaje, avatar | — |
| EisMeister (`eismeister`) | retired | de | mini maquina de helados menta (variante), marca independiente de EisWerk | A1 E1 V1 O2 | — | — |
| EisWerk (`eiswerk`) | active | de | mini maquina de helados rosa | A6 E4 V2 O2 | — | mismo producto que gelatovivo; variantes: azul, azul_turquesa, fresa, rosa, virutas |
| EisZwilling (`eiszwilling`) | active | de | máquina de helados blanca con dos recipientes independientes para preparar dos porciones simultáneamente | A1 E1 V1 O2 | — | — |
| FableSeat (`fableseat`) | active | en | Princess Chair · azul con carruaje bordado | A1 E1 V1 O1 | — | — |
| FalterPfote (`falterpfote`) | active | de | Collar con módulo cilíndrico de dos extremos ópticos y proyección bilateral de alas de mariposa | A1 E1 V0 O2 | avatar | — |
| FaltLiebling (`faltliebling`) | active | de | Bolso plegable de nailon en llavero con mosquetón; variante marrón | A1 E1 V2 O1 | — | — |
| FastLuxus (`fastluxus`) | active | de | Tote con impresión plana de bolso caro como broma visual; no contiene un bolso de lujo real | A1 E1 V1 O2 | — | — |
| FensterFunkeln (`fensterfunkeln`) | active | de | Cortina blanca translúcida de tela con luces LED cálidas integradas y mando, sin dibujos; definición corregida expresame | A1 E1 V1 O2 | — | — |
| FlauschNest (`flauschnest`) | hidden | de | sudadera oversize de borreguito con bolsillo canguro para perro pequeno | A2 E2 V2 O2 | — | variantes: panel |
| FrechFlausch (`frechflausch`) | active | de | Dispensador de pañuelos del Grinch | A1 E1 V1 O2 | — | — |
| Gelatovivo (`gelatovivo`) | active | it | mismos assets que EisWerk excepto logo | A0 E0 V1 O0 | articulo, embalaje | mismo producto que eiswerk; variantes: azul, rosa; fotos de eiswerk |
| GlasLiebe (`glasliebe`) | active | de | Vaso con forma de Hello Kitty, tapa gorro rosa y bufanda | A1 E1 V2 O2 | — | — |
| Goldpfötchen (`goldpfotchen`) | active | ? | Calendario de adviento de figuras Golden Retriever; referencia @goldieadvents | A3 E1 V0 O1 | avatar | variantes: charm_1, charm_2, charm_3 |
| HaarFein (`haarfein`) | active | de | Mini cepillo alisador negro y rosa cobrizo con tapa | A2 E2 V1 O2 | — | variantes: rosa |
| HaarZauber (`haarzauber`) | active | de | Mini cepillo portátil de peinado rosa con tapa y cabezal negro | A3 E1 V1 O2 | — | variantes: blanco, negro |
| HerzPfote (`herzpfote`) | hidden | de | peluche de perezoso con latido de corazón simulado, para perros que se quedan solos en casa | A2 E1 V0 O2 | avatar | variantes: solo_peluche, con_corazon |
| HüpfPanda (`hupfpanda`) | active | de | Juguete infantil de panda con trampolín | A1 E1 V0 O1 | avatar | — |
| KaffeeBild (`kaffeebild`) | active | de | Accesorio de decoración de café con apariencia de cámara, no cámara real | A1 E1 V1 O2 | — | — |
| KuschelGrinch (`kuschelgrinch`) | hidden | de | Peluche verde KuschelGrinch | A2 E1 V1 O2 | — | — |
| LaserBande (`laserbande`) | active* | de | Alemania. Set infantil laser tag con cuatro pistolas y cuatro sensores pectorales. | A1 E1 V1 O2 | — | — |
| LichterFreude (`lichterfreude`) | active | de | Decoración navideña USB con luces y proyector en la punta del árbol | A1 E1 V1 O2 | — | — |
| NagelFunkel (`nagelfunkel`) | active | de | Rotuladores de doble punta para decoración de uñas, set de 12 colores | A1 E1 V2 O2 | — | — |
| NagelKlar (`nagelklar`) | active | de | Aparato rosa y negro para retirar gel de uñas; variante eléctrica y consumible sin confirmar | A1 E1 V1 O2 | — | — |
| Nailuna (`nailuna`) | active | de | Set de uñas con aplicador rosa y luz de curado blanca | A1 E1 V0 O1 | avatar | — |
| NikolausLicht (`nikolauslicht`) | hidden | de | Lámpara colgante de gorro navideño rojo con luces y adornos | A2 E1 V1 O2 | — | — |
| PistenGrins (`pistengrins`) | active | de | Pasamontañas con cuatro estampados de caras | A8 E1 V1 O2 | — | variantes: 1, 2, 3, 4 |
| PlattenZauber (`plattenzauber`) | hidden | de | reproductor magnetico para nevera con 9 discos de villancicos | A1 E1 V1 O1 | — | — |
| RadBlink (`radblink`) | active* | de | Intermitentes de bicicleta | A0 E0 V0 O0 | articulo, embalaje, avatar | — |
| RentierGlanz (`rentierglanz`) | hidden | de | Luces decorativas de pared con silueta de reno y halo cálido | A3 E1 V1 O2 | — | variantes: mano_lateral_20260908 |
| RiccioVivo (`ricciovivo`) | active | it | Cepillo rosa portátil con tapa | A1 E1 V1 O2 | — | — |
| RufZeit (`rufzeit`) | hidden | de | Auricular rojo de teléfono retro conectado al móvil por cable en espiral | A2 E1 V1 O1 | — | — |
| SchutzKlingel (`schutzklingel`) | active | de | Alarma personal con mosquetón y luz; variantes turquesa, rosa y negra | A1 E1 V0 O1 | avatar | — |
| StillWohl (`stillwohl`) | active | de | Cojín rosa de apoyo para lactancia y alimentación con correa | A1 E1 V1 O2 | — | — |
| TargetAlarm (`targetalarm`) | active | en | despertador con diana y blaster de juguete: suena la alarma, disparas a la diana y se apaga | A0 E0 V0 O1 | articulo, embalaje, avatar | mismo producto que zielalarm; fotos de zielalarm |
| WärmeNest (`waermenest`) | active | de | Manta calefactora eléctrica beige tipo capa con cremallera | A1 E1 V1 O2 | — | — |
| WärmePlatz (`waermeplatz`) | active* | de | Alemania. Asiento calefactor portátil negro acolchado con respaldo y reposabrazos. | A1 E1 V1 O2 | — | — |
| WeihnachtsPfote (`weihnachtspfote`) | hidden | de | Atuendo navideño para mascotas; perros y gatos, variantes verde y roja | A1 E1 V2 O2 | — | — |
| WichtelLaune (`wichtellaune`) | active | de | Calendario de adviento del Grinch con adornos colgantes | A1 E1 V0 O4 | avatar | — |
| Taufänger (`winterdurchblick`) | active | de | Bolsa desecante amarilla de 100 g con gel de sílice e indicador de humedad para el interior del coche | A1 E1 V0 O2 | avatar | — |
| WinterTasse (`wintertasse`) | active | de | Taza blanca navideña de asa roja, oso, tapa de madera y calentador cuadrado verde. | A1 E1 V1 O2 | — | — |
| WolkenWonne (`wolkenwonne`) | active | de | Edredón acolchado blanco voluminoso tipo nube | A1 E1 V0 O2 | avatar | — |
| ZauberSchirm (`zauberdach`) | active | de | Sombrilla con cortina transparente envolvente, diseño mágico azul y dorado sin texto Harry Potter | A1 E1 V1 O1 | — | — |
| ZehenWonne (`zehenwonne`) | active | de | Zapatillas calefactables, variante apricot seleccionada; conservar gray si otra fuente la muestra | A1 E1 V1 O2 | — | — |
| ZielAlarm (`zielalarm`) | active | de | despertador con diana y blaster de juguete: suena la alarma, disparas a la diana y se apaga | A1 E1 V0 O1 | avatar | mismo producto que targetalarm |
| ZweigGlanz (`zweigglanz`) | unclear | de | Ramas decorativas con pequeñas luces cálidas | A2 E1 V1 O2 | — | — |

Estado: `active`, `hidden` (en `PANEL/cuentas_ocultas.json`), `retired` (marcada retirada en el registro/nota pero no en la lista de ocultas), `unclear`. El asterisco indica «activa» por defecto: no figura oculta ni retirada pero tampoco tiene estado explícito.

### Productos testeados sin cuenta (27)

Solo aparecen en `PRODUCTOS COMPARTIDOS` o `InventarioProductos-20261115` (nombre, tipo de producto, mercado). Se exportan en `productos.json` con `origin: producto-testeado` y `status: unclear`.

| Producto | Mercado | Qué es |
|---|---|---|
| BildFreude | DE | Impresora fotográfica |
| BlitzKumpel | DE | Juego de proyección |
| Bolsa desecante | DE | Bolsa desecante para coche |
| CollieZauber | DE,US | Calendario Border Collie |
| DinoDuell | DE,US | Proyector de dinosaurios |
| FellBrise / FurBreezy | DE,US | Recinto de secado para mascotas |
| FestFrech | DE | Ropa navideña humorística |
| FestKapuze | DE | Sudadera Grinch con máscara |
| FlauschHafen | DE | Edredón acolchado |
| FlimmerZwerg | DE | Mini televisor retro |
| FlitzPfote / Patefouce | DE | Pelota motorizada para perros |
| GlaceMalice | ? | Máquina de helados |
| HeckSchalk | DE | Grinch para limpiaparabrisas |
| HoofHolly | US | Calendario de caballos |
| PfotenSchalk | DE | Disfraz Grinch jinete para perros |
| PurrHuddle | US | Alfombrilla calefactora para gatos |
| PuzzleStube | DE | Mesa para puzles |
| ReiseKuscheln | DE | Almohada corporal de viaje |
| RiccioVivo / BoucleMalice | IT | Cepillo térmico portátil |
| RollPfote | DE,US | Pelota motorizada con cuerda |
| RottFreude | DE | Calendario Rottweiler |
| SitzPfote | DE | Asiento de coche para perros |
| SohlenPause | DE | Masajeador de pies |
| WichtelWitz | DE | Pantalones navideños estampados |
| WimperWolke | DE | Protector de pestañas para ducha |
| YorkieZauber | DE | Calendario Yorkshire |
| ZauberSchirm | DE | Sombrilla con plástico envolvente |

## 3. Canciones

Biblioteca real: `~/Movies/CapCut/Resources/Biblioteca musical Nano Banana` (+ `NanoBanana/_EDICIONES/music-library`). El marcador de drop sale de `T7/.../MUSICA_DROPS/emmanuel/<sha256>.json` (origen `human_saved_marker`; se conserva el historial de revisiones). Regla R2 aprobada por Emmanuel el 25/10/2026 (`REGLAS_EDICION/MUSICA_R2_APROBADA`, no en un `MUSICA_R2_APROBADA` de la raíz de T7): el drop es un ancla que se alinea con el primer fotograma real del cuerpo; música continua y a nivel constante.

| Id | Título | Duración (s) | Drop (s) | R2 | Usada por (solo lo que consta) |
|---|---|---|---|---|---|
| cancion-01 | EisWerk C1 · recetas (+3 copias) | 180.7 | 32.57 |  | eiswerk, lista: eiswerk |
| cancion-02 | navideña1 (+2 copias) | 63.8 | 9.32 |  | zauberschirm, —, lista: navideñas |
| cancion-03 | navideña2 (+2 copias) | 259.8 | 17.74 |  | eiswerk, —, lista: navideñas |
| cancion-04 | telefono rojo1 (+2 copias) | 42.6 | 10.95 | sí | — |
| cancion-05 | navideña3 (+2 copias) | 60.0 | 7.1 |  | eiswerk, —, lista: navideñas |
| cancion-06 | Rockin' Around The Christmas Tree (+2 copias) | 60.0 | 6.94 |  | eiswerk, wintertasse, —, lista: navideñas |
| cancion-07 | Can Can (Arr. By Helmuth Brandenburg) (+2 copias) | 18.3 | — |  | eiszwilling, lista: eiszwilling |
| cancion-09 | Back In Black (+2 copias) | 60.0 | — |  | zielalarm, lista: zielalarm |
| cancion-10 | Free Bird (+2 copias) | 60.0 | — |  | zielalarm, lista: zielalarm |
| cancion-11 | Let It Snow! Let It Snow! Let It Snow! (+2 copias) | 60.0 | 7.49 |  | sin dato |
| cancion-12 | CHANEL | 22.3 | 5.78 |  | — |
| cancion-13 | It's the Most Wonderful Time of the Year | 60.0 | 2.39 |  | sin dato |
| cancion-14 | GIRLS | 60.0 | — |  | sin dato |
| cancion-15 | hate that i made you love me | 60.0 | — |  | sin dato |
| cancion-16 | The Fate of Ophelia | 60.0 | 20.8 |  | sin dato |
| cancion-17 | Be My Baby | 60.0 | 33.67 |  | sin dato |
| cancion-18 | Be My Baby | 60.0 | — |  | sin dato |
| cancion-19 | Rockin' Around The Christmas Tree | 60.0 | 6.94 |  | sin dato |
| cancion-20 | navideña1 | 63.8 | — |  | sin dato |
| cancion-21 | telefono rojo1 | 42.6 | — |  | sin dato |
| cancion-22 | original sound - yshi | 19.7 | — |  | sin dato |
| cancion-23 | original sound - yshi | 19.7 | — |  | sin dato |
| cancion-24 | Be My Baby | 60.0 | — |  | sin dato |
| cancion-25 | Jingle Bell Rock | 60.0 | 7.79 |  | sin dato |
| cancion-26 | Jingle Bell Rock | 60.0 | — |  | sin dato |
| cancion-27 | navideña2 | 259.8 | — |  | sin dato |
| cancion-28 | Be My Baby | 60.0 | 33.98 |  | sin dato |
| cancion-29 | settle | 560.6 | — |  | sin dato |
| cancion-30 | Dracula (with JENNIE) | 52.0 | — |  | sin dato |
| cancion-31 | Dracula (with JENNIE) | 52.0 | — |  | sin dato |
| cancion-32 | original sound - Blue Music | 23.2 | — |  | sin dato |
| cancion-33 | original sound - Blue Music | 23.2 | — |  | sin dato |
| cancion-34 | navideña3 | 60.0 | — |  | sin dato |
| cancion-35 | original sound | 31.3 | — |  | sin dato |
| cancion-36 | The Fate of Ophelia | 60.0 | 20.77 |  | sin dato |
| cancion-37 | It's the Most Wonderful Time of the Year | 60.0 | 2.63 |  | sin dato |
| cancion-38 | You're A Mean One, Mr. Grinch | 60.0 | 4.61 |  | sin dato |
| cancion-39 | original sound - Maria.Marie | 60.1 | 12.03 |  | sin dato |
| cancion-40 | golden hour | 60.0 | 6.4 |  | sin dato |
| cancion-41 | It's Beginning to Look a Lot like Christmas | 60.0 | — |  | sin dato |
| cancion-42 | Who Let The Dogs Out - Original | 60.0 | 3.75 |  | sin dato |
| cancion-43 | Christmas (Baby Please Come Home) | 60.0 | — |  | sin dato |
| cancion-44 | The Christmas Song (Merry Christmas To You) | 60.0 | — |  | sin dato |
| cancion-45 | Underneath the Tree (Christmas Songs - One day,  | 60.0 | 5.33 |  | sin dato |
| cancion-46 | rock that body x outside | 40.9 | 4.06 |  | sin dato |
| cancion-47 | Originalton - beitman | 19.2 | 3.31 |  | — |
| cancion-48 | original sound | 20.5 | 11.61 |  | — |
| cancion-49 | so this is love | 59.0 | 3.82 |  | sin dato |
| cancion-50 | A Dream Is a Wish Your Heart Makes - From "Cinde | 60.0 | — |  | sin dato |
| cancion-51 | tale as old as time | 34.8 | 1.74 |  | sin dato |
| cancion-52 | Love Me Again | 60.0 | 9.11 |  | sin dato |
| cancion-53 | original sound | 546.9 | — |  | sin dato |
| cancion-54 | So Easy (To Fall In Love) | 60.0 | 2.94 |  | sin dato |
| cancion-55 | original sound | 213.2 | 63.46 |  | sin dato |
| cancion-56 | Mambo #5 | 60.0 | 7.24 |  | sin dato |
| cancion-57 | original sound - lyricwave4 | 62.3 | 33 |  | sin dato |
| cancion-08 | Culture of Gen X (+1 copias) | 480.1 | — |  | zielalarm, lista: zielalarm |

Nota de licencia: son capturas de sonidos de TikTok (ssstik.io); no consta licencia comercial de ninguna (el propio registro lo dice para EisWerk C1 recetas).

## 4. Conceptos de referencia por cuenta

`delivered` = algún clip del concepto tiene `archivo_final` registrado. El registro no guarda un campo de aprobación uniforme: solo se exporta lo que hay (`approvedFlag`, `reviewStates`, `conceptNote`). No se juzga calidad. El tipo de gancho no está registrado como campo: la descripción procede de `CONCEPTOS.md` (32 conceptos) y del nombre del concepto.

| Cuenta | Conceptos | Clips | Con vídeo final | Con enlace de reel | Motores |
|---|---|---|---|---|---|
| eiswerk | 78 | 140 | 54 | 9 | genjutsu, kling, seedance, seedance_2_0 |
| zielalarm | 58 | 96 | 35 | 2 | kling, seedance |
| nailuna | 34 | 41 | 14 | 13 | genjutsu, kling, seedance |
| kaffeebild | 18 | 21 | 12 | 0 | genjutsu, kling, seedance |
| targetalarm | 15 | 21 | 9 | 0 | kling, seedance |
| rufzeit | 13 | 13 | 7 | 4 | genjutsu, seedance |
| gelatovivo | 12 | 20 | 2 | 0 | genjutsu, kling, seedance |
| waermenest | 12 | 25 | 3 | 8 | genjutsu, seedance |
| nagelklar | 10 | 10 | 8 | 0 | genjutsu, kling, seedance |
| rentierglanz | 10 | 10 | 2 | 3 | genjutsu, seedance |
| eiszwilling | 8 | 18 | 7 | 0 | kling, seedance |
| kuschelgrinch | 8 | 9 | 0 | 7 | genjutsu, seedance |
| zweigglanz | 7 | 8 | 1 | 7 | genjutsu, seedance |
| nikolauslicht | 6 | 6 | 5 | 0 | genjutsu, seedance |
| fensterfunkeln | 5 | 6 | 5 | 0 | genjutsu, seedance |
| flauschnest | 5 | 11 | 0 | 0 | kling, seedance |
| weihnachtspfote | 5 | 5 | 3 | 2 | genjutsu, seedance |
| discomagia | 4 | 13 | 0 | 0 | kling3_0, seedance_2_0 |
| eismeister | 4 | 8 | 0 | 0 | kling, seedance |
| zauberdach | 4 | 4 | 4 | 0 | seedance |
| wintertasse | 3 | 4 | 0 | 0 | genjutsu, seedance |
| pistengrins | 2 | 2 | 0 | 2 | genjutsu |
| brauform | 1 | 3 | 1 | 0 | genjutsu, seedance |
| glasliebe | 1 | 1 | 0 | 1 | genjutsu |

Cuentas del sistema sin ningún concepto en el registro (23): FableSeat, FalterPfote, FaltLiebling, FastLuxus, FrechFlausch, Goldpfötchen, HaarFein, HaarZauber, HerzPfote, HüpfPanda, LaserBande, LichterFreude, NagelFunkel, PlattenZauber, RadBlink, RiccioVivo, SchutzKlingel, StillWohl, WärmePlatz, WichtelLaune, Taufänger, WolkenWonne, ZehenWonne. Sus pruebas viven en los pedidos por chat (`PRODUCTOS COMPARTIDOS/TESTEOS`, 35 encargos cuya asociación con la marca no siempre está demostrada); no se han leído.

### Referencias virales EisWerk (10)

Los 10 reels más vistos de @eiswerrk (895 mil a 292 mil vistas, revisión del 20/11/2026), en `conceptos.json > viralReferences` con enlace, duración y sha256; los MP4 siguen en `T7/AUTOMATIZACION SEGA/EisWerk - TOP 10 virales - 2026-11-20/`.

### Textos ganadores (10)

Biblioteca global del 14/11/2026 (sin cuenta asignada; se elige según lo que ocurre en el vídeo). Selección de Emmanuel, **sin métricas aportadas**. Entradas: «Do NOT show this to a Skier...»; «“Babe stop buying stupid sh*t for the do»; «Send this to a NY GIANTS fan»; «“It’s just a hoodie”»; «“The perfect gift for a grandma doesn’t »; «Every Book lover NEEDS this...»; «AOT fans I made this for you»; «Snoopy X Costco»; «“Men are so hard to gift” / Me:»; «POV: you bought the best ski mask ever».

## 5. Avatares

| Id | Descripción registrada | Cuentas | Archivo |
|---|---|---|---|
| hombre-1 | Pelo corto y barba canosa, camiseta verde oliva | — | avatares/hombre-1.png |
| hombre-2 | Barba castaña, camiseta negra sin mangas | — | avatares/hombre-2.png |
| hombre-3 | Hombre central con chaqueta gris y camisa blanca | — | avatares/hombre-3.png |
| hombre-4 | Pelo claro rizado y barba, camisa a rayas | — | avatares/hombre-4.png |
| hombre-5 | Pelo oscuro y barba, sonrisa y pulsera roja | — | avatares/hombre-5.png |
| hombre-6 | Pelo rubio, camisa azul de cuadros | — | avatares/hombre-6.jpg |
| mujer-1 | Blusa azul marino, pelo rubio | eiswerk | avatares/mujer-1.png |
| mujer-2 | Blusa estampada azul y blanca | rufzeit, zielalarm | avatares/mujer-2.png |
| mujer-3 | Camiseta turquesa, selfie en coche | nikolauslicht | avatares/mujer-3.png |
| mujer-4 | Bufanda crema, pelo castaño | rentierglanz | avatares/mujer-4.png |
| mujer-5 | Pelo corto castaño y gafas | eiszwilling | avatares/mujer-5.png |
| mujer-6 | Pelo recogido, jersey gris | gelatovivo | avatares/mujer-6.png |
| mujer-7 | Pelo pelirrojo recogido, jersey verde | plattenzauber | avatares/mujer-7.png |
| mujer-8 | Pelo ondulado castaño, jersey crema | herzpfote | NO exportado (> 8 MB) |
| mujer-9 | Pelo recogido y camiseta beige | flauschnest | NO exportado (> 8 MB) |
| mujer-10 | Avatar alternativo del selfie C2 | eiswerk | avatares/mujer-10.jpg |
| mujer-11 | Pelo rubio, cárdigan gris y camiseta negra | — | avatares/mujer-11.png |
| mujer-12 | Pelo rubio ondulado, chaqueta negra acolchada | — | avatares/mujer-12.png |
| mujer-13 | Pelo rubio, jersey azul con rayas blancas | — | avatares/mujer-13.png |
| mujer-14 | cc48489a2e19ada12415cb52aaa14056 (1).jpg | — | avatares/mujer-14.jpg |
| mujer-15 | Pelo corto claro, gafas rectangulares y chaqueta azul; selfie en coche | kaffeebild | avatares/mujer-15.png |

## 6. Lo que NO se pudo exportar y por qué

- **46 fotos sin archivo local**: solo existe el id de Higgsfield (no se descarga). Las más relevantes: `articulo` y `embalaje` base de EisWerk/GelatoVivo (hay archivos de las variantes rosa/azul/fresa/virutas), la cara fija de Nailuna, DiscoMagia entero (retirada) y los `reference_element_*` (elementos de referencia sin archivo local). Lista completa en `INFORME.md` del paquete.
- **Ficheros de más de 8 MB** (límite del encargo): avatares `mujer-8` (HerzPfote) y `mujer-9` (FlauschNest); cara fija de HerzPfote, WinterDurchblick y WolkenWonne.
- **Marcado incorrecto por el propio dueño**: `embalaje_fresa` de EisWerk (rechazado: «horizontal kraft is not actual strawberry packaging»; sustituido por `embalaje_fresa_oficial_2688`, que sí se exporta).
- **Assets `entorno`**: no existen por cuenta; el fondo se define por regla de texto (campo `environmentRule`, solo EisWerk y EisMeister). Las referencias de entorno reales (Pinterest selección 17/11, `NanoBanana/_referencias`) son globales y no se exportan.
- **Vídeos** (clips finales, TOP 10 virales, vídeos fuente): no se copian; solo ruta, hash y metadatos.
- **Capturas de textos** 11.18.36 (sin texto, contextual) y 14.51.14 (resumen de las 10 familias): no son entradas.
- **Fuera de alcance por no ser datos de producto**: `Audio/Bandit-v2` (repositorio y entorno de ML), `Modelos`, `AudioImport-20261106`, `BatchMusicLibrary-20261026`, `NanoBanana/_COMPARTIDO` (contiene `access.json`). No se abrió ningún `.env`, credencial, token, cookie ni base de datos.
- Ficheros `._*` y `.DS_Store`: excluidos; el exFAT los vuelve a generar al copiar y se borraron del paquete.

## 7. Preguntas abiertas para el dueño

1. **ZweigGlanz**: el registro y la nota dicen ACTIVA, pero `CONCEPTOS.md` dice «retiradas de la app el 29/09/2026: ZweigGlanz, KuschelGrinch, WeihnachtsPfote, NikolausLicht, RentierGlanz y RufZeit» y no está en `cuentas_ocultas.json` (las otras cinco sí). ¿Oculta o activa?
2. **Retiradas vs. ocultas**: DiscoMagia y EisMeister están retiradas en el registro pero no en la lista de ocultas; HerzPfote, FlauschNest y PlattenZauber están en la lista de ocultas sin constar en `CONCEPTOS.md` como retiradas. ¿Se importan todas como ocultas?
3. **Sin estado explícito**: LaserBande, RadBlink y WärmePlatz solo se han dado por activas por defecto. RadBlink tiene nota pero ningún asset ni concepto en el sistema.
4. **27 productos testeados sin cuenta** (lista en la sección 2): ¿se importan como productos «sin cuenta» o solo los que tengan assets? (FestFrech, PuzzleStube y HupfPanda sí tienen imágenes en PRODUCTOS COMPARTIDOS).
5. **Producto compartido**: se tomó EisWerk = GelatoVivo y ZielAlarm = TargetAlarm (nota de cuenta + encargo). GelatoVivo y TargetAlarm no tienen archivos propios de artículo/embalaje; el campo `photosAvailableFromShared` apunta a la cuenta hermana. ¿Se duplican las fotos o se enlaza el producto? Pendiente también: ¿RiccioVivo es la versión italiana de HaarZauber (ambos «cepillo rosa portátil con tapa»)? No hay evidencia escrita.
6. **Variantes de EisWerk**: `articulo_azul` (foto del pedido, embalaje pendiente) y `articulo_azul_turquesa` (mockup, con embalaje) parecen la misma variante azul; ¿se unifican? Variante principal asumida: rosa.
7. **Canciones**: solo 13 de 57 tienen cuenta o lista asociada con evidencia; el resto no consta en ningún registro (el uso real está en pedidos/lotes que no se han leído). Hay duplicados por contenido (p. ej. cuatro cortes distintos de «Be My Baby», 17/18/24/28) y 26 canciones sin drop guardado. La regla R2 solo ampara explícitamente la canción 4 «teléfono rojo1» (drop 10,95 s). ¿Qué canciones están autorizadas para producción y cuáles son solo pruebas?
8. **Licencias**: ninguna canción tiene licencia comercial registrada (son sonidos de TikTok). ¿Se marca el uso permitido en la web nueva?
9. **Avatares**: `mujer-14` solo tiene como descripción un nombre de archivo; `mujer-8` y `mujer-9` pesan más de 8 MB. ¿Subimos el límite para avatares o se reduce el archivo?
10. **Conceptos**: no hay un campo de aprobación uniforme ni de «tipo de gancho»; 14 conceptos no tienen nombre. ¿Basta con `delivered` (hay archivo final) y la descripción de CONCEPTOS.md, o hay otra fuente de aprobación (lotes/pedidos de T7)?
11. **Textos ganadores**: la biblioteca no está asignada a cuentas ni trae métricas; ¿se importa como biblioteca global?
12. **TOP 10 virales de EisWerk**: ¿quieres copiar los 10 MP4 (como referencias en la web) o basta con el enlace?
