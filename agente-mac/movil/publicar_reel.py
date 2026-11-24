#!/usr/bin/env python3
import sys
sys.dont_write_bytecode = True
from movil import *
def flujo(m,a):
    texto=pathlib.Path(a.texto).read_text(encoding='utf-8')
    if not texto.strip(): raise ValueError('Descripción vacía')
    importar(m,a.archivo,video=True)
    m.session(APPS[a.app])
    m.home(a.app)
    if a.app=='instagram':
        m.tap(['create','Crea un post, una storia o un video in diretta','Crear','Create'])
        m.tap(['Reel','REEL'])
    else: m.facebook_reel()
    # Deliberately require an explicit asset selection before proceeding.
    m.wait(['Recenti','Recientes','Recents'] if a.app=='instagram' else ['Galleria','Galería','Gallery'])
    m.select_recent(video=True,app=a.app)
    if a.app=='instagram':
        if not m.find(['gallery-header-title','current-camera-mode']): raise PantallaInesperada('No está la galería de reel de Instagram')
        advance=m.wait(['reels-gallery-selection-next'],types=['XCUIElementTypeButton'])
        if advance.get('name')!='reels-gallery-selection-next' or m.find(['caption-cell-text-view']):
            raise PantallaInesperada('La selección ha saltado una pantalla: no se avanza hacia una posible publicación')
        m.tap(['reels-gallery-selection-next'])
        m.tap(['sundial-right-chevron-avanti-button'])
    else:
        m.wait(['media_preview'])
        m.tap(['next_button'])
    m.tap(['sharesheet-description-text-view','caption-cell-text-view','Aggiungi una didascalia...','Scrivi una didascalia...','Escribe un pie de foto...','Write a caption...','Descrivi il tuo reel...','Descrivi il tuo reel','Aggiungi una descrizione...','Escribe una descripción...','Add a description...','Describe tu reel...','Describe your reel...'])
    m.type(texto)
    fields=[n.attrib for n in m.nodes() if n.attrib.get('type') in ('XCUIElementTypeTextView','XCUIElementTypeTextField') and n.attrib.get('visible')=='true']
    if not any(n.get('value','').strip()==texto.strip() for n in fields): raise PantallaInesperada('La descripción escrita no coincide con el archivo')
    if a.app=='instagram':
        m.wait(['Didascalia','Pie de foto','Caption'])
        m.tap(['OK','Fine','Listo','Done'])
    else:
        m.wait(['Nuovo reel','Nuevo reel','New reel'])
        m.finish_facebook_caption(texto)
    finalizar(m,a)

def finalizar(m,a):
    publish=['Condividi ora','Compartir ahora','Share now','Condividi','Pubblica','Compartir','Publicar','Share','Publish']
    final=m.find(['share-sheet-share-button']) if a.app=='instagram' else []
    next_boundary=bool(final and final[0].get('label') in ('Avanti','Siguiente','Next'))
    if final and not next_boundary and final[0].get('label') not in publish:
        raise PantallaInesperada('Acción final de Instagram no reconocida')
    if not next_boundary: m.wait(publish)
    m.shot(a.app+'-reel-prima-di-pubblicare')
    if a.simular:
        print('Simulación: vídeo y descripción preparados; no se pulsa '+('Avanti (acción de compartir)' if next_boundary else 'Compartir/Publicar')+'.')
        return
    # Only this branch is authorized to perform an action that could publish.
    m.tap(['share-sheet-share-button'] if next_boundary else publish)
    m.shot(a.app+'-reel-invio')
    success=['Il tuo reel è stato condiviso.','Il tuo reel è stato condiviso','Reel condiviso','Tu reel se ha compartido','Your reel has been shared']
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        if m.find(success):
            m.shot(a.app+'-reel-risultato'); return
        # Some Instagram versions have a second explicit sharing confirmation.
        # Never press Avanti twice or retry a submission.
        if next_boundary and m.find(['Nuovo reel','Nuevo reel','New reel']) and m.find(['caption-cell-text-view']) and m.find(publish):
            m.tap(publish); next_boundary=False
        time.sleep(1)
    raise PantallaInesperada('No llegó confirmación de publicación. Comprobar la cuenta antes de repetir: el envío podría haberse realizado.')
if __name__=='__main__': raise SystemExit(run(flujo,cli('reel')))
