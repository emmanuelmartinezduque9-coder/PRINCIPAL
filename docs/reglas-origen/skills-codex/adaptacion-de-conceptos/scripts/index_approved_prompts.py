"""Index exact sent prompts with current image approval; no generation/state edits."""
import argparse,hashlib,json
from pathlib import Path

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def index(root):
 rows=[];seen=set()
 for order in sorted(root.glob('*')):
  inventory=order/'EDITOR/rondas'/(order.name+'.json');generated=order/'EDITOR/frames_generados.json'
  try:inv=read(inventory);jobs=read(generated)
  except (OSError,ValueError):continue
  if not isinstance(jobs,list):continue
  for slot,row in inv.get('items',{}).items():
   if row.get('tipo')!='frame' or row.get('estado')!='aprobado' or row.get('sha256')!=row.get('presented_sha'):continue
   try:
    ap=row['evidencia_usuario'];apath=Path(ap['archivo']);image=Path(row['archivo_local'])
    if sha(image)!=row['sha256'] or sha(apath)!=ap['sha256']:continue
    matches=[r for r in jobs if r.get('job')==row['job'] and r.get('lote_global')==order.name and r.get('item_lote')==slot and r.get('sha256')==row['sha256']]
    if len(matches)!=1:continue
    r=matches[0];text=r['prompt_exacto'];transport=Path(r['transport_receipt']);receipt=read(transport)
    if not text or receipt.get('state')!='accepted' or receipt.get('provider_id')!=row['job']:continue
    h=hashlib.sha256(text.encode()).hexdigest();key=(row['job'],h)
    if key in seen:continue
    seen.add(key);rows.append(dict(order=order.name,item=row.get('item_app'),slot=slot,job=row['job'],account=row['cuenta'],status='human_approved_frame_requires_visual_selection_for_reuse',prompt=dict(text=text,sha256=h,source_registry=str(generated),registry_sha256=sha(generated)),image=dict(path=str(image),sha256=row['sha256']),approval=dict(path=str(apath),sha256=ap['sha256']),transport=dict(path=str(transport),sha256=sha(transport)),reference_roles=r.get('reference_roles_aplicado'),limitations='Image approval only. Observe image and check later corrections before reuse. No video/commercial validation.'))
   except (OSError,ValueError,KeyError,TypeError):continue
 return dict(version=2,scope='Exact sent prompts from existing current evidence-bound approved frames; not all historical successes',entries=rows)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path('/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation'));p.add_argument('--output',type=Path,required=True);a=p.parse_args();data=index(a.root);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2));print(json.dumps(dict(entries=len(data['entries']),output=str(a.output))))
