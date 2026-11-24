import json,sys,urllib.request,base64,os
W="http://192.168.1.139:8100"
SF=os.path.join(os.path.dirname(__file__),"wda_session")
def req(m,p,b=None,t=60):
    r=urllib.request.Request(W+p,method=m,data=json.dumps(b).encode() if b is not None else None,headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=t))
def sid(): return open(SF).read().strip()
cmd=sys.argv[1]
if cmd=="new":
    v=req("POST","/session",{"capabilities":{"alwaysMatch":{"bundleId":sys.argv[2]}}})
    s=v.get("sessionId") or v["value"]["sessionId"]; open(SF,"w").write(s); print(s)
elif cmd=="url": print(req("POST",f"/session/{sid()}/url",{"url":sys.argv[2]}))
elif cmd=="shot":
    d=req("GET","/screenshot")["value"]; open(sys.argv[2],"wb").write(base64.b64decode(d)); print("ok")
elif cmd=="tap": print(req("POST",f"/session/{sid()}/wda/tap",{"x":float(sys.argv[2]),"y":float(sys.argv[3])}))
elif cmd=="hold": print(req("POST",f"/session/{sid()}/wda/touchAndHold",{"x":float(sys.argv[2]),"y":float(sys.argv[3]),"duration":float(sys.argv[4]) if len(sys.argv)>4 else 1.5}))
elif cmd=="size": print(req("GET",f"/session/{sid()}/window/size"))
elif cmd=="src": print(req("GET",f"/session/{sid()}/source?format=description",t=120)["value"][:int(sys.argv[2]) if len(sys.argv)>2 else 6000])
elif cmd=="launch": print(req("POST",f"/session/{sid()}/wda/apps/launch",{"bundleId":sys.argv[2]}))
elif cmd=="type": print(req("POST",f"/session/{sid()}/wda/keys",{"value":list(sys.argv[2])}))
if cmd=="click":
    v=req("POST",f"/session/{sid()}/elements",{"using":"predicate string","value":sys.argv[2]})["value"]
    print(len(v))
    if v:
        e=v[0].get("ELEMENT") or list(v[0].values())[0]
        print(req("POST",f"/session/{sid()}/element/{e}/click",{}))
