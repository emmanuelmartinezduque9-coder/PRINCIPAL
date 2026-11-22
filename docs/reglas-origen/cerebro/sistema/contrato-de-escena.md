# Contrato de escena — obligatorio al adaptar

Todo trabajo de vídeo con `sustituciones` (se está ADAPTANDO el escenario) debe declarar:

`"escena": {"personas": N, "lugar": "...", "objeto": "..."}`

y la puerta ([[sistema/una-sola-puerta-para-video]]) **coteja el prompt final** contra esa declaración. Sin contrato, adaptar = bloqueado.

Qué caza:
- **personas: 1** pero el prompt dice «both», «employees», «two people», «second person»…
- **lugar** declarado (dormitorio/salón/cocina) pero el prompt menciona «store», «aisle», «the cart», «warehouse»… (y al revés: «tienda» con «bedroom», «fairy lights», «the bed»).
- **objeto** único («una/one/single») pero el prompt dice «stacked», «pallet», «rows of», «multiple identical»…

**Por qué**: nace del fallo del 1,2,3 (2026-08-31): al adaptar «quién habla» quedaron «both employees», «the cart» y un palet de cajas apiladas… en un dormitorio con una sola mujer. La lógica no puede depender de que yo la piense: se DECLARA la escena y la máquina coteja. Ver [[lecciones/2026-09-01-adaptar-es-declarar-la-escena]].

Aplicada por: EDITOR/lanzar.py › contrato_escena()
