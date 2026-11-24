#!/usr/bin/env python3
import sys
sys.dont_write_bytecode = True
from movil import *
def flujo(m,a):
    importar(m,a.archivo)
    m.session(APPS[a.app])
    if a.app=='facebook':
        facebook(m,a); return
    m.tap(['profile-tab','Profilo','Perfil','Profile'])
    m.tap(['Modifica','Editar perfil','Edit profile'])
    m.tap(['Modifica immagine o avatar','Editar foto o avatar','Edit picture or avatar'])
    m.tap(['Scegli dalla libreria','Elegir de la biblioteca','Choose from library'])
    m.tap(['Fine','Listo','Done'])
    end=time.monotonic()+60
    while True:
        if m.find(['Modifica profilo','Editar perfil','Edit profile']):
            m.tap(['BackButton','Indietro','Atrás','Back']); break
        visible_text=' '.join(n.attrib.get('label','') for n in m.nodes() if n.attrib.get('visible')=='true').lower()
        known_meta='meta' in visible_text and any(s in visible_text for s in ('mantieni aggiornata la tua immagine','mantén actualizada tu foto','keep your profile picture up to date'))
        if known_meta:
            m.tap(['Chiudi','Cerrar','Close','close-button']); break
        if time.monotonic()>end: raise PantallaInesperada('La foto no terminó de cargar')
        time.sleep(1)
    m.wait(['profile-tab','Profilo','Perfil','Profile'])
    m.shot('foto-profilo-risultato')
def facebook(m,a):
    m.tap(['Profilo','Perfil','Profile'])
    m.tap(["Modifica immagine del profilo",'Editar foto del perfil','Edit profile picture'])
    m.wait(['Seleziona foto','Seleccionar foto','Select photo'])
    m.select_recent(video=False,app='facebook')
    # This checkbox belongs to this photo update, not account settings.
    feed=['Condividi il tuo aggiornamento nel feed','Compartir tu actualización en el feed','Share your update to Feed']
    m.wait(['Anteprima','Vista previa','Preview'])
    options=m.find(feed)
    if len(options)!=1 or options[0].get('value') not in ('0','1',None): raise PantallaInesperada('No se identifica la opción de publicación en el feed')
    if options and options[0].get('value')=='1':
        m.tap(feed)
        if m.wait(feed).get('value')=='1': raise PantallaInesperada('No se desactivó la publicación de la foto en el feed')
    switches=[n.attrib for n in m.nodes() if n.attrib.get('type')=='XCUIElementTypeSwitch' and n.attrib.get('visible')=='true' and n.attrib.get('value')=='1']
    if switches: raise PantallaInesperada('Facebook propone compartir la foto: revisar sin cambiar ajustes')
    m.tap(['Salva','Guardar','Save'])
    m.wait(['Modifica profilo','Editar perfil','Edit profile'],timeout=60)
    m.shot('foto-facebook-risultato')
if __name__=='__main__': raise SystemExit(run(flujo,cli('foto')))
