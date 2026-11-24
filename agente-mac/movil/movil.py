"""Cliente WDA sin dependencias. Cada paso exige un elemento visible inequívoco."""
import argparse, base64, contextlib, http.server, json, os, pathlib, socket, threading, time, urllib.request, urllib.parse, urllib.error, xml.etree.ElementTree as ET
ROOT = pathlib.Path(__file__).resolve().parent
APPS = {'instagram':'com.burbn.instagram', 'facebook':'com.facebook.Facebook'}
class PantallaInesperada(Exception): pass
class Movil:
    def __init__(self, url=None, salida=None):
        self.url=(url or os.environ.get('WDA_URL','http://192.168.1.139:8100')).rstrip('/')
        self.salida=pathlib.Path(salida or ROOT/'resultados'); self.salida.mkdir(exist_ok=True, parents=True)
        self.sid=None; self.paso='inicio'
    def req(self, method, path, data=None):
        r=urllib.request.Request(self.url+path, method=method, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=90) as f: v=json.load(f)
        except urllib.error.HTTPError as e:
            try: message=json.load(e).get('value',{}).get('message',str(e))
            except Exception: message=str(e)
            raise RuntimeError(f'WDA {e.code} {path}: {message[:1000]}') from None
        if isinstance(v.get('value'),dict) and v['value'].get('error'): raise RuntimeError(v['value'])
        return v
    def session(self, bundle):
        v=self.req('POST','/session',{'capabilities':{'alwaysMatch':{'bundleId':bundle,'shouldWaitForQuiescence':False,'autoAcceptAlerts':False,'autoDismissAlerts':False}}})
        self.sid=v.get('sessionId') or v['value']['sessionId']
        self.call('POST','/appium/settings',{'settings':{'waitForIdleTimeout':0,'animationCoolOffTimeout':0,'respectSystemAlerts':True,'snapshotMaxDepth':90}})
        return self
    def call(self, method, path, data=None): return self.req(method,f'/session/{self.sid}'+path,data)['value']
    def source(self): return self.call('GET','/source')
    def nodes(self): return list(ET.fromstring(self.source()).iter())
    def find(self, labels, types=None):
        if isinstance(labels,str): labels=[labels]
        matches=[]
        nodes=self.nodes()
        if any(n.attrib.get('type')=='XCUIElementTypeAlert' and n.attrib.get('visible')=='true' for n in nodes):
            # Único aviso que se resuelve solo: un borrador de reel que quedó a medias. Se guarda como
            # borrador (no se borra ni se continúa) o se empieza uno nuevo. Cualquier otro aviso se para.
            safe=['Salva come bozza','Guardar como borrador','Save as draft','Avvia nuovo video','Iniciar nuevo vídeo','Start new video']
            btn=[n.attrib for n in nodes if n.attrib.get('type')=='XCUIElementTypeButton' and n.attrib.get('label') in safe and n.attrib.get('visible')=='true']
            if btn:
                b=btn[0]; self.call('POST','/wda/tap',{'x':float(b['x'])+float(b['width'])/2,'y':float(b['y'])+float(b['height'])/2})
                time.sleep(2); return self.find(labels,types)
            raise PantallaInesperada('Aviso del sistema: requiere revisión humana')
        for n in nodes:
            a=n.attrib
            if a.get('visible')!='true' or a.get('enabled')=='false': continue
            if types and a.get('type') not in types: continue
            if any(s in (a.get('label'),a.get('name'),a.get('value')) for s in labels):
                if float(a.get('width',0))>0 and float(a.get('height',0))>0: matches.append(a)
        # Parent and child may expose same label; prefer actual buttons.
        accessible=[a for a in matches if a.get('accessible')=='true']
        matches=accessible or matches
        buttons=[a for a in matches if a.get('type')=='XCUIElementTypeButton']
        unique={}
        for a in buttons or matches:
            unique[tuple(a.get(k) for k in ('type','name','label','x','y','width','height'))]=a
        return list(unique.values())
    def wait(self, labels, timeout=15, types=None):
        end=time.monotonic()+timeout
        while True:
            found=self.find(labels,types)
            if len(found)==1: return found[0]
            if time.monotonic()>end: raise PantallaInesperada(f'{self.paso}: esperado {labels}; coincidencias {len(found)}')
            time.sleep(.7)
    def tap(self, labels, timeout=15, types=None):
        self.paso='tocar '+str(labels); print(self.paso,flush=True); a=self.wait(labels,timeout,types)
        # Locate by accessibility label/name, never a fixed coordinate.
        val=a.get('name') or a.get('label'); pred='name == '+json.dumps(val,ensure_ascii=False)+' AND label == '+json.dumps(a.get('label',''),ensure_ascii=False)+' AND type == '+json.dumps(a['type'])+' AND visible == true'
        if a.get('value') is not None: pred+=' AND value == '+json.dumps(a['value'],ensure_ascii=False)
        es=self.call('POST','/elements',{'using':'predicate string','value':pred})
        if not es: raise PantallaInesperada('Elemento desaparecido: '+val)
        if len(es)>1:
            # WDA exposes duplicate accessibility nodes at identical bounds.
            current=self.find(labels,types)
            if len(current)!=1: raise PantallaInesperada('Elemento ambiguo: '+val)
            a=current[0]
            self.call('POST','/wda/tap',{'x':float(a['x'])+float(a['width'])/2,'y':float(a['y'])+float(a['height'])/2}); return
        e=es[0].get('ELEMENT') or es[0].get('element-6066-11e4-a52e-4f735466cecf')
        self.call('POST',f'/element/{e}/click',{})
    def select_recent(self, video=True, app='instagram'):
        if app=='instagram':
            self.tap(['gallery-video-cell-0' if video else 'gallery-photo-cell-0'],types=['XCUIElementTypeCell']); return
        identifiers=['camera_roll_item_0'] if video else ['camera-roll-item-0','camera_roll_item_0']
        a=self.wait(identifiers)
        prefix=a.get('label','').lower()
        valid=('video','vídeo') if video else ('foto','photo','image')
        if not prefix.startswith(valid): raise PantallaInesperada('El medio más reciente no es del tipo importado')
        self.tap(identifiers)
    def facebook_reel(self):
        self.tap(['trep-composer-button','Crea','Crear','Create'])
        groups=[['Post, 1 di 5','Storia, 2 di 5','Reel, 3 di 5','Diretta, 4 di 5','Nota, 5 di 5'],['Post, 1 of 5','Story, 2 of 5','Reel, 3 of 5','Live, 4 of 5','Note, 5 of 5'],['Publicación, 1 de 5','Historia, 2 de 5','Reel, 3 de 5','En vivo, 4 de 5','Nota, 5 de 5']]
        expected=groups[0]
        deadline=time.monotonic()+15
        while True:
            nodes=self.nodes()
            if any(n.attrib.get('type')=='XCUIElementTypeAlert' and n.attrib.get('visible')=='true' for n in nodes): raise PantallaInesperada('Aviso sobre el menú de Facebook')
            matched=None
            for group in groups:
                candidates=[n.attrib for n in nodes if n.attrib.get('label') in group]
                if len(candidates)==5 and sorted(a['label'] for a in candidates)==sorted(group):
                    matched=(group,candidates); break
            if matched:
                expected,entries=matched; break
            if time.monotonic()>deadline: raise PantallaInesperada('Menú de creación de Facebook distinto del comprobado')
            time.sleep(.5)
        if any(n.attrib.get('visible')=='true' and n.attrib.get('type') in ('XCUIElementTypeButton','XCUIElementTypeTextView','XCUIElementTypeTextField') and n.attrib.get('label') not in expected for n in nodes):
            raise PantallaInesperada('Otra pantalla está sobre el menú de Facebook')
        # Verified WDA bug: all five menu entries report visible/hittable=false.
        # Only this exact observed menu is exempt; use its unique element, not XY.
        if not all(a.get('enabled')=='true' and float(a.get('width',0))>0 and float(a.get('height',0))>0 for a in entries): raise PantallaInesperada('Menú incompleto')
        es=self.call('POST','/elements',{'using':'predicate string','value':'label == '+json.dumps(expected[2],ensure_ascii=False)+' AND enabled == true'})
        if len(es)!=1: raise PantallaInesperada('Reel ambiguo en el menú de Facebook')
        e=es[0].get('ELEMENT') or es[0].get('element-6066-11e4-a52e-4f735466cecf')
        self.call('POST',f'/element/{e}/click',{})
    def finish_facebook_caption(self, text):
        nodes=self.nodes()
        if any(n.attrib.get('type')=='XCUIElementTypeAlert' and n.attrib.get('visible')=='true' for n in nodes): raise PantallaInesperada('Aviso sobre el editor de descripción')
        if not any(n.attrib.get('name')=='sharesheet-description-text-view' and n.attrib.get('value','').strip()==text.strip() and n.attrib.get('visible')=='true' for n in nodes): raise PantallaInesperada('No está la descripción esperada de Facebook')
        if not any(n.attrib.get('label') in ('Nuovo reel','Nuevo reel','New reel') and n.attrib.get('visible')=='true' for n in nodes): raise PantallaInesperada('No está la pantalla de reel')
        # The visible blue keyboard checkmark is incorrectly marked disabled by WDA.
        es=self.call('POST','/elements',{'using':'predicate string','value':'(label == "selezionato" OR label == "seleccionado" OR label == "selected") AND visible == true'})
        if len(es)!=1: raise PantallaInesperada('Cierre del teclado de Facebook no inequívoco')
        e=es[0].get('ELEMENT') or es[0].get('element-6066-11e4-a52e-4f735466cecf')
        self.call('POST',f'/element/{e}/click',{})
    def instant_control(self, identifier, attempts=5):
        """Recover hidden Quick Look chrome and tap fresh, stable bounds.

        Retrying is restricted to the verified Files video preview. Never retry
        after the share sheet/another screen has replaced that preview.
        """
        self.paso='control Quick Look '+identifier
        last='control oculto'
        def preview():
            if not self.find(['QLPreviewControllerView']):
                raise PantallaInesperada('No está la vista previa de Quick Look')
        def touch(a):
            self.call('POST','/wda/tap',{'x':float(a['x'])+float(a['width'])/2,
                                       'y':float(a['y'])+float(a['height'])/2})
        for attempt in range(attempts):
            preview()
            # Pausing prevents playback from auto-hiding the overlay. Do not
            # toggle an already paused player back into playback.
            pause=self.find(['Pausa','Pause','Pausar'],types=['XCUIElementTypeButton'])
            if len(pause)==1:
                touch(pause[0])
            target=self.find([identifier],types=['XCUIElementTypeButton'])
            if not target:
                video=self.wait(['Video'],timeout=2,types=['XCUIElementTypeOther'])
                self.call('POST','/wda/tap',{'x':float(video['x'])+float(video['width'])/4,
                                           'y':float(video['y'])+float(video['height'])/4})
                pause=self.find(['Pausa','Pause','Pausar'],types=['XCUIElementTypeButton'])
                if len(pause)==1: touch(pause[0])
            deadline=time.monotonic()+15
            previous=None
            while time.monotonic()<deadline:
                current=self.find([identifier],types=['XCUIElementTypeButton'])
                if len(current)>1:
                    raise PantallaInesperada('Control Quick Look ambiguo: '+identifier)
                if current:
                    a=current[0]
                    bounds=tuple(a[k] for k in ('x','y','width','height'))
                    if bounds==previous:
                        # Use the bounds just observed, avoiding WDA's stale
                        # cached element lookup/click race on fading controls.
                        touch(a)
                        time.sleep(.25)
                        if identifier=='QLOverlayDefaultActionButtonAccessibilityIdentifier':
                            if self.find(['Salva video','Guardar vídeo','Save Video'],types=['XCUIElementTypeCell']):
                                return
                        elif not self.find(['QLPreviewControllerView']):
                            return
                        preview()
                        last='el toque no abrió el control'
                        break
                    previous=bounds
                else:
                    previous=None
                    last='el control desapareció'
                time.sleep(.15)
            print(f'Quick Look: reintento {attempt+1}/{attempts}: {last}',flush=True)
        raise PantallaInesperada(f'Quick Look: {identifier}: {last} tras {attempts} intentos')
    def shot(self,name='pantalla'):
        p=self.salida/(name+'.png'); p.write_bytes(base64.b64decode(self.req('GET','/screenshot')['value'])); return p
    def hold(self,x,y):
        self.call('POST','/actions',{'actions':[{'type':'pointer','id':'finger','parameters':{'pointerType':'touch'},'actions':[{'type':'pointerMove','duration':0,'x':int(x),'y':int(y)},{'type':'pointerDown','button':0},{'type':'pause','duration':2000},{'type':'pointerUp','button':0}]}]})
    def type(self,text):
        if any(n.attrib.get('type')=='XCUIElementTypeSecureTextField' and n.attrib.get('visible')=='true' for n in self.nodes()):
            raise PantallaInesperada('Pantalla de contraseña: no se escribe texto')
        self.call('POST','/wda/keys',{'value':list(text)})
    def home(self,app):
        self.call('POST','/wda/apps/launch',{'bundleId':APPS[app]})
        self.tap(['mainfeed-tab','Feed principale','Inicio','Home'] if app=='instagram' else ['Home','Inicio'])
    def evidence(self,error):
        stamp=time.strftime('%Y%m%d-%H%M%S'); p=self.salida/('bloqueo-'+stamp+'.png')
        capture_error=None
        try: self.shot(p.stem)
        except Exception as e: capture_error=str(e)
        try: nodes=[n.attrib for n in self.nodes() if n.attrib.get('visible')=='true' and (n.attrib.get('label') or n.attrib.get('name'))]
        except Exception as e: nodes=[{'error':str(e)}]
        p.with_suffix('.json').write_text(json.dumps({'error':str(error),'paso':self.paso,'captura':str(p) if not capture_error else None,'error_captura':capture_error,'pantalla':nodes},ensure_ascii=False,indent=2))
        return p.with_suffix('.json')
@contextlib.contextmanager
def servir(path, peer="192.168.1.139"):
    path=pathlib.Path(path).resolve()
    if not path.is_file(): raise ValueError(f'No existe {path}')
    filename='movil-'+str(time.time_ns())+path.suffix.lower()
    ip=os.environ.get('MOVIL_HOST_IP')
    if not ip:
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
            sock.connect((peer,8100)); ip=sock.getsockname()[0]
    # Only this single asset is exposed, on a random port; no directory listing.
    class Handler(http.server.BaseHTTPRequestHandler):
        def handle(self):
            try: super().handle()
            except (BrokenPipeError,ConnectionResetError): pass
        def do_GET(self):
            if self.path!='/'+filename: self.send_error(404); return
            size=path.stat().st_size; start=0; end=size-1
            range_header=self.headers.get('Range')
            if range_header:
                import re
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',range_header)
                if not match: self.send_error(416); return
                start=int(match[1]); end=min(int(match[2]) if match[2] else size-1,size-1)
                if start>end: self.send_error(416); return
            self.send_response(206 if range_header else 200)
            self.send_header('Content-Type','video/mp4' if path.suffix.lower()=='.mp4' else 'image/jpeg' if path.suffix.lower() in ('.jpg','.jpeg') else 'image/png')
            self.send_header('Accept-Ranges','bytes')
            if path.suffix.lower()=='.mp4': self.send_header('Content-Disposition','attachment; filename='+filename)
            self.send_header('Content-Length',str(end-start+1))
            if range_header: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            with path.open('rb') as f:
                f.seek(start); remaining=end-start+1
                while remaining:
                    data=f.read(min(65536,remaining))
                    if not data: break
                    try: self.wfile.write(data)
                    except (BrokenPipeError,ConnectionResetError): break
                    remaining-=len(data)
        def log_message(self,*args): pass
    server=http.server.ThreadingHTTPServer(('0.0.0.0',0),Handler)
    t=threading.Thread(target=server.serve_forever,daemon=True); t.start()
    try: yield f'http://{ip}:{server.server_port}/{filename}'
    finally: server.shutdown(); server.server_close(); t.join()
def importar(m,path,video=False):
    path=pathlib.Path(path)
    allowed=('.mp4',) if video else ('.jpg','.jpeg','.png')
    if not path.is_file() or path.suffix.lower() not in allowed: raise ValueError('Archivo inexistente o formato no admitido: '+str(path))
    m.session('com.apple.mobilesafari')
    with servir(path,peer=urllib.parse.urlparse(m.url).hostname) as url:
        m.call('POST','/url',{'url':url}); time.sleep(5)
        if video:
            name=url.rsplit('/',1)[1]
            m.wait([f'Vuoi scaricare “{name}”?',f'Do you want to download “{name}”?',f'¿Quieres descargar “{name}”?'],types=['XCUIElementTypeTextView'])
            m.tap(['Scarica','Descargar','Download'])
            time.sleep(3)
            m.session('com.apple.DocumentsApp')
            if m.find(['Video'],types=['XCUIElementTypeOther']):
                m.instant_control('QLOverlayDoneButtonAccessibilityIdentifier')
            file_labels=[name[:-4]+', mp4',name[:-4],name]
            in_downloads=m.find(['Download, Menu Azioni','Downloads, Actions Menu','Descargas, Menú de acciones'])
            if not in_downloads and not m.find(file_labels,types=['XCUIElementTypeCell']):
                if not m.find(['Download','Descargas','Downloads'],types=['XCUIElementTypeCell']):
                    if not m.find(['DOC.sidebar.item.iCloud Drive']):
                        m.tap(['Sfoglia','Explorar','Browse'])
                    if m.find(['DOC.sidebar.item.iCloud Drive']):
                        m.tap(['DOC.sidebar.item.iCloud Drive'],types=['XCUIElementTypeCell'])
                m.tap(['Download','Descargas','Downloads'],types=['XCUIElementTypeCell'])
            # Files' context menu keeps Share visible, unlike video playback.
            asset=None
            for _ in range(8):
                found=m.find(file_labels,types=['XCUIElementTypeCell'])
                if len(found)==1:
                    asset=found[0]; break
                if len(found)>1: raise PantallaInesperada('Archivo importado ambiguo')
                print('Archivos: desplazar para localizar '+name,flush=True)
                view=m.wait(['File View'],types=['XCUIElementTypeCollectionView'])
                tabs=m.wait(['DOC.browsingModeTabBar'])
                x=float(view['x'])+float(view['width'])/2
                bottom=min(float(view['y'])+float(view['height']),float(tabs['y']))
                top=float(view['y'])
                m.call('POST','/actions',{'actions':[{'type':'pointer','id':'finger',
                    'parameters':{'pointerType':'touch'},'actions':[
                    {'type':'pointerMove','duration':0,'x':int(x),'y':int(bottom-60)},
                    {'type':'pointerDown','button':0},
                    {'type':'pointerMove','duration':500,'x':int(x),'y':int(top+(bottom-top)/3)},
                    {'type':'pointerUp','button':0}]}]})
            if asset is None: raise PantallaInesperada('No aparece el MP4 descargado en Archivos')
            # A cell may extend under the tab bar while WDA reports visible.
            tabs=m.wait(['DOC.browsingModeTabBar'])
            top=float(asset['y']); bottom=min(top+float(asset['height']),float(tabs['y']))
            if bottom<=top: raise PantallaInesperada('Archivo fuera del área visible')
            m.hold(float(asset['x'])+float(asset['width'])/2,(top+bottom)/2)
            m.tap(['Condividi','Compartir','Share'],types=['XCUIElementTypeButton'])
            m.tap(['Salva video','Guardar vídeo','Save Video'],types=['XCUIElementTypeCell'])

        else:
            nodes=m.nodes()
            if any(n.attrib.get('type')=='XCUIElementTypeAlert' and n.attrib.get('visible')=='true' for n in nodes): raise PantallaInesperada('Aviso sobre la imagen de Safari')
            images=[n.attrib for n in nodes if n.attrib.get('type')=='XCUIElementTypeImage' and n.attrib.get('visible')=='true']
            if len(images)!=1: raise PantallaInesperada('Safari: imagen no inequívoca')
            a=images[0]; m.hold(float(a['x'])+float(a['width'])/2,float(a['y'])+float(a['height'])/2)
            try:
                m.wait(['Salva in Foto','Guardar en Fotos','Save to Photos'],timeout=4)
            except PantallaInesperada:
                images=[n.attrib for n in m.nodes() if n.attrib.get('type')=='XCUIElementTypeImage' and n.attrib.get('visible')=='true']
                if len(images)!=1: raise
                a=images[0]; m.hold(float(a['x'])+float(a['width'])/2,float(a['y'])+float(a['height'])/2)
            m.tap(['Salva in Foto','Guardar en Fotos','Save to Photos'])
        time.sleep(3)
def cli(kind):
    p=argparse.ArgumentParser(description='Automatización WDA: se detiene ante pantallas inesperadas.'); p.add_argument('archivo'); p.add_argument('--app',choices=APPS,default='instagram'); p.add_argument('--salida'); p.add_argument('--wda');
    if kind=='reel': p.add_argument('--texto',required=True); p.add_argument('--simular',action='store_true')
    return p.parse_args()
def run(fn,args):
    m=Movil(args.wda,args.salida)
    try: fn(m,args); return 0
    except Exception as e:
        try: artifact=m.evidence(e)
        except Exception as capture_error: artifact=f'No se pudo capturar: {capture_error}'
        print(f'Detenido: {e}\nEvidencia: {artifact}'); return 3
