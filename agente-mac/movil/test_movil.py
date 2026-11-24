import unittest
from unittest.mock import patch
from movil import Movil, PantallaInesperada, servir
import urllib.request
class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.m=Movil(salida='resultados')
    def node(self,label,x='10'):
        import xml.etree.ElementTree as ET
        return ET.Element('Button',{'type':'XCUIElementTypeButton','name':'shared','label':label,'visible':'true','enabled':'true','x':x,'y':'10','width':'20','height':'20'})
    def test_duplicate_bounds_are_one_target(self):
        with patch.object(self.m,'nodes',return_value=[self.node('Fine'),self.node('Fine')]): self.assertEqual(len(self.m.find(['Fine'])),1)
    def test_different_bounds_stop(self):
        with patch.object(self.m,'nodes',return_value=[self.node('Fine'),self.node('Fine','40')]):
            with self.assertRaises(PantallaInesperada): self.m.wait(['Fine'],timeout=0)
    def test_permission_stops(self):
        import xml.etree.ElementTree as ET
        with patch.object(self.m,'nodes',return_value=[ET.Element('Alert',{'type':'XCUIElementTypeAlert','visible':'true'}),self.node('Fine')]):
            with self.assertRaises(PantallaInesperada): self.m.wait(['Fine'],timeout=0)
    def test_facebook_menu_must_be_complete_and_enabled(self):
        import xml.etree.ElementTree as ET
        labels=['Post, 1 di 5','Storia, 2 di 5','Reel, 3 di 5','Diretta, 4 di 5','Nota, 5 di 5']
        nodes=[ET.Element('Button',{'type':'XCUIElementTypeButton','label':label,'enabled':'true','visible':'false','width':'130','height':'44'}) for label in labels]
        nodes[2].set('enabled','false')
        with patch.object(self.m,'nodes',return_value=nodes), patch.object(self.m,'tap'), patch.object(self.m,'call') as call:
            with self.assertRaises(PantallaInesperada): self.m.facebook_reel()
            call.assert_not_called()
    def test_wrong_recent_media_never_selected(self):
        with patch.object(self.m,'wait',return_value={'label':'Foto, 24 nov 2026'}), patch.object(self.m,'tap') as tap:
            with self.assertRaises(PantallaInesperada): self.m.select_recent(video=True,app='facebook')
            tap.assert_not_called()
    def test_caption_permission_overlay_stops(self):
        import xml.etree.ElementTree as ET
        nodes=[ET.Element('Alert',{'type':'XCUIElementTypeAlert','visible':'true'})]
        with patch.object(self.m,'nodes',return_value=nodes), patch.object(self.m,'call') as call:
            with self.assertRaises(PantallaInesperada): self.m.finish_facebook_caption('Test')
            call.assert_not_called()
    def test_http_ranges_and_no_listing(self):
        with patch.dict('os.environ',{'MOVIL_HOST_IP':'127.0.0.1'}):
            with servir('pruebas/prueba.mp4') as url:
                req=urllib.request.Request(url,headers={'Range':'bytes=0-7'})
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(response.status,206); self.assertEqual(len(response.read()),8)
                with self.assertRaises(urllib.error.HTTPError): urllib.request.urlopen(url.rsplit('/',1)[0]+'/')

class SimulationTests(unittest.TestCase):
    def test_simulation_never_taps_publish(self):
        from types import SimpleNamespace
        import publicar_reel
        class Fake:
            def __init__(self): self.taps=[]; self.shots=[]
            def session(self,*args): pass
            def home(self,*args): pass
            def facebook_reel(self): pass
            def finish_facebook_caption(self,text): pass
            def tap(self,labels,**kwargs): self.taps.append(labels)
            def wait(self,labels,**kwargs): return getattr(self,'target',{'name':'reels-gallery-selection-next'} if 'reels-gallery-selection-next' in labels else {})
            def select_recent(self,**kwargs): pass
            def type(self,text): self.text=text
            def nodes(self):
                import xml.etree.ElementTree as ET
                return [ET.Element('Field',{'type':'XCUIElementTypeTextView','visible':'true','value':self.text})]
            def find(self,labels,**kwargs): return [{}] if 'gallery-header-title' in labels else []
            def shot(self,name): self.shots.append(name)
        for app in ('instagram','facebook'):
            m=Fake(); args=SimpleNamespace(texto='pruebas/texto.txt',archivo='pruebas/prueba.mp4',app=app,simular=True)
            with patch.object(publicar_reel,'importar'): publicar_reel.flujo(m,args)
            self.assertFalse(any('Pubblica' in labels or 'Condividi' in labels for labels in m.taps))
            self.assertIn(app+'-reel-prima-di-pubblicare',m.shots)
        m=Fake(); args.app='instagram'
        original_find=m.find
        m.find=lambda labels,**kwargs: [{'label':'Avanti'}] if 'share-sheet-share-button' in labels else original_find(labels,**kwargs)
        with patch.object(publicar_reel,'importar'):
            publicar_reel.flujo(m,args)
        self.assertFalse(any('share-sheet-share-button' in labels for labels in m.taps))
        m=Fake(); m.target={'name':'share-sheet-share-button'}
        with patch.object(publicar_reel,'importar'):
            with self.assertRaises(PantallaInesperada): publicar_reel.flujo(m,args)
        self.assertFalse(any('Avanti' in labels or 'reels-gallery-selection-next' in labels or 'share-sheet-share-button' in labels for labels in m.taps))

if __name__=='__main__': unittest.main()
