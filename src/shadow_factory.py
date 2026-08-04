#!/usr/bin/env python3
"""Self-contained batch factory for projection-matched shadow puzzles."""
from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
import sys
import time
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import binary_closing, binary_fill_holes, distance_transform_edt, gaussian_filter, label

ROOT = Path(__file__).resolve().parents[1]
CORNERS = np.array([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)], int)
TETS = np.array([(0,5,1,6),(0,1,2,6),(0,2,3,6),(0,3,7,6),(0,7,4,6),(0,4,5,6)], int)
EDGES = np.array([(0,1),(1,2),(2,0),(0,3),(1,3),(2,3)], int)
TRI_TABLE = {
    1:(0,3,2),2:(0,1,4),3:(1,4,2,2,4,3),4:(1,2,5),5:(0,3,5,0,5,1),
    6:(0,2,5,0,5,4),7:(5,4,3),8:(3,4,5),9:(4,5,0,5,2,0),
    10:(1,5,0,5,3,0),11:(5,2,1),12:(3,4,2,2,4,1),13:(4,1,0),14:(2,3,0),
}
CATEGORY_NAMES = {
    "A":"ORTHOGRAPHIC CSG", "B":"SMOOTH SDF BOOLEAN", "C":"FOLDED RIBBON",
    "D1":"DISC & ROD SCAFFOLD", "D2":"TUBULAR SKELETON", "D3":"ROUNDED RIBS",
    "E":"OCCLUSION STACK", "F":"DUAL-LIGHT VOLUME",
}
COLORS = {"A":(79,145,194),"B":(66,181,151),"C":(219,126,83),"D1":(205,151,48),
          "D2":(88,157,165),"D3":(154,119,197),"E":(215,162,63),"F":(111,119,198)}


@dataclass
class Metrics:
    level_id: str
    category: str
    status: str
    target_iou: float
    secondary_target_iou: float | None
    shadow_retention: float
    player_target_iou: float
    vertices: int
    triangles: int
    components: int
    boundary_edges: int
    nonmanifold_edges: int
    degenerate_triangles: int
    generation_seconds: float
    warnings: list[str]


def slug(text):
    return "".join(c.lower() if c.isalnum() else "_" for c in str(text)).strip("_")


def load_mask(path: Path, resolution: int):
    image = Image.open(path).convert("L")
    mask = np.asarray(image.resize((resolution, resolution), Image.Resampling.LANCZOS)) > 96
    mask = binary_fill_holes(binary_closing(mask, iterations=1))
    labels, count = label(mask)
    if count > 1:
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        mask = labels == int(np.argmax(sizes))
    target = Image.fromarray(np.uint8(mask)*255, "L").resize((512,512), Image.Resampling.LANCZOS)
    # Field axes are y(horizontal) and z(vertical-up).
    field_mask = np.flipud(mask).T
    sdf = gaussian_filter(distance_transform_edt(field_mask)-distance_transform_edt(~field_mask), .55)/(resolution*.5)
    return sdf.astype(np.float32), target


def make_interval(sdf, center, half):
    n = sdf.shape[0]; xs = np.linspace(-1.2, 1.2, n)[:,None,None]
    return np.minimum(sdf[None,:,:], half[None,:,:]-np.abs(xs-center[None,:,:]))


def build_field(sdf, category, seed):
    n=sdf.shape[0]; y,z=np.meshgrid(np.linspace(-1,1,n),np.linspace(-1,1,n),indexing="ij")
    phase=(seed%997)*.017
    if category == "A":
        iy=np.floor((y+1)*4); iz=np.floor((z+1)*5)
        center=.32*((iy*3+iz*2+seed)%5-2); half=.14+.025*((iy+iz+seed)%3)
        body=make_interval(sdf,center,half)
        bridge=make_interval(sdf,center*.5,np.abs(center)*.5+.075)
        return np.maximum(body,bridge)
    if category == "B":
        center=.60*np.sin(y*4.8+phase)+.25*np.cos(z*5.5-phase)+.13*np.sin((y+z)*7.4)
        half=.14+.035*(.5+.5*np.sin(y*4-z*3.5+phase))
        return np.maximum(make_interval(sdf,center,half),make_interval(sdf,center*.5,np.abs(center)*.5+.05))
    if category == "C":
        center=.66*np.sin(z*4.8+phase)+.22*np.cos(y*5.5)+.10*np.sin((y+z)*7.5-phase)
        return make_interval(sdf,center,np.full_like(center,.14))
    if category == "D1":
        waves=np.sin(y*7+phase)+np.cos(z*8-phase*.7)
        center=.52*np.tanh(1.55*waves)+.10*np.sin((y-z)*5)
        lens=.09+.075*(.5+.5*np.cos(waves*math.pi))
        return np.maximum(make_interval(sdf,center,lens),make_interval(sdf,center*.5,np.abs(center)*.5+.065))
    if category == "D2":
        center=.57*np.sin(z*5.4+phase)+.17*np.sin(y*8-phase)
        bulge=.09+.04*(.5+.5*np.cos(y*9+z*6))
        return np.maximum(make_interval(sdf,center,bulge),make_interval(sdf,center*.5,np.abs(center)*.5+.06))
    if category == "D3":
        center=.58*np.sin(z*7.2+phase)+.18*np.cos(y*6.3-phase)
        half=.12+.045*(.5+.5*np.cos(z*22+phase))
        return make_interval(sdf,center,half)
    if category == "E":
        upper=np.minimum(sdf,(z-.02)/.055)
        middle=np.minimum(sdf,np.minimum((z+.55)/.055,(.38-z)/.055))
        lower=np.minimum(sdf,(-z+.05)/.055)
        fields=[]
        for part,cx,k in ((upper,-.72,0),(middle,0,1),(lower,.72,2)):
            center=np.full_like(y,cx)+.04*np.sin(y*4.5+k+phase)+.02*np.cos(z*5.5+k)
            fields.append(make_interval(part,center,np.full_like(y,.13)))
        return np.maximum.reduce(fields)
    if category == "F":
        return np.minimum(sdf[None,:,:],sdf[::-1,None,:])
    raise ValueError(f"unknown category: {category}")


def marching_tetrahedra(field):
    shape=tuple(s-1 for s in field.shape); vertices=[]; faces=[]; offset=0
    for tet in TETS:
        vals=[]
        for corner_id in tet:
            ox,oy,oz=CORNERS[corner_id]
            vals.append(field[ox:ox+shape[0],oy:oy+shape[1],oz:oz+shape[2]])
        vals=np.stack(vals,-1); case=np.sum((vals>0)*(1<<np.arange(4)),axis=-1).astype(np.uint8)
        for code,edge_order in TRI_TABLE.items():
            base=np.argwhere(case==code)
            if not len(base): continue
            tv=vals[case==code]; points=[]
            for edge_id in edge_order:
                a,b=EDGES[edge_id]; ca=CORNERS[tet[a]].astype(float); cb=CORNERS[tet[b]].astype(float)
                va,vb=tv[:,a],tv[:,b]; den=vb-va
                t=np.clip(-va/np.where(np.abs(den)>1e-10,den,1),0,1)
                points.append(base+ca+(cb-ca)*t[:,None])
            pts=np.stack(points,1).reshape(-1,3); vertices.append(pts)
            nf=len(pts)//3; faces.append(np.arange(offset,offset+nf*3).reshape(-1,3)); offset+=nf*3
    if not vertices: raise RuntimeError("empty iso-surface")
    v=np.vstack(vertices); f=np.vstack(faces)
    mins=np.array([-1.2,-1.,-1.]); spans=np.array([2.4,2.,2.])
    v=mins+v*(spans/(np.array(field.shape)-1))
    v,inv=np.unique(np.round(v,6),axis=0,return_inverse=True); f=inv[f]
    return clean_mesh(v,f)


def clean_mesh(v,f):
    good=(f[:,0]!=f[:,1])&(f[:,1]!=f[:,2])&(f[:,2]!=f[:,0]); f=f[good]
    area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)
    f=f[area>=1e-11]
    _,keep=np.unique(np.sort(f,axis=1),axis=0,return_index=True); f=f[np.sort(keep)]
    used,inv=np.unique(f,return_inverse=True)
    return v[used],inv.reshape(f.shape).astype(np.int32)


def close_boundary_loops(v,f,max_edges=512):
    edges=np.sort(np.vstack((f[:,[0,1]],f[:,[1,2]],f[:,[2,0]])),axis=1)
    unique,counts=np.unique(edges,axis=0,return_counts=True); boundary=unique[counts==1]
    if not len(boundary): return v,f
    adjacency={}
    for a,b in boundary:
        adjacency.setdefault(int(a),[]).append(int(b)); adjacency.setdefault(int(b),[]).append(int(a))
    if any(len(x)!=2 for x in adjacency.values()): return v,f
    unused={tuple(x) for x in map(tuple,boundary)}; centers=[]; caps=[]
    while unused:
        start,current=next(iter(unused)); loop=[start]; previous=start
        while current!=start:
            loop.append(current); unused.discard(tuple(sorted((previous,current))))
            nxt=[x for x in adjacency[current] if x!=previous][0]; previous,current=current,nxt
            if len(loop)>max_edges: return v,f
        unused.discard(tuple(sorted((previous,start))))
        if len(loop)==3: caps.append(loop)
        else:
            center=len(v)+len(centers); centers.append(v[loop].mean(0))
            caps.extend([[loop[i],loop[(i+1)%len(loop)],center] for i in range(len(loop))])
    if centers: v=np.vstack((v,np.asarray(centers)))
    if caps: f=np.vstack((f,np.asarray(caps,np.int32)))
    return clean_mesh(v,f)


def topology(v,f):
    edges=np.sort(np.vstack((f[:,[0,1]],f[:,[1,2]],f[:,[2,0]])),axis=1)
    unique,counts=np.unique(edges,axis=0,return_counts=True)
    parent=np.arange(len(v))
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    for a,b in unique:
        ra,rb=find(int(a)),find(int(b))
        if ra!=rb: parent[rb]=ra
    components=len({find(int(x)) for x in np.unique(f)})
    return components,int(np.count_nonzero(counts==1)),int(np.count_nonzero(counts>2))


def graph(f,n):
    edges=np.unique(np.sort(np.vstack((f[:,[0,1]],f[:,[1,2]],f[:,[2,0]])),axis=1),axis=0)
    degree=np.bincount(edges.ravel(),minlength=n).astype(float)
    return edges,degree


def polish_depth(v,f,mode,iterations):
    if not iterations or mode in {"dual","point"}: return v.copy()
    edges,degree=graph(f,len(v)); out=v.copy()
    def lap(values):
        total=np.zeros(len(v)); np.add.at(total,edges[:,0],values[edges[:,1]]); np.add.at(total,edges[:,1],values[edges[:,0]])
        return total/np.maximum(degree,1)-values
    if mode=="point":
        q=project(v,"x","point")
    for _ in range(iterations):
        out[:,0]+=.34*lap(out[:,0]); out[:,0]-=.35*lap(out[:,0])
    if mode=="point":
        scale=(out[:,0]+60)/120; out[:,1:3]=q*scale[:,None]
    return out


def project(v,axis="x",mode="directional",player=False):
    if player:
        # Deliberately separated from every solution-light axis.
        direction=np.array([.30,-.90,.65]); direction/=np.linalg.norm(direction)
        up=np.array([0.,0.,1.]); side=np.cross(up,direction); side/=np.linalg.norm(side); up=np.cross(direction,side)
        return np.column_stack((v@side,v@up)),v@direction
    if mode=="point":
        t=120/(v[:,0]+60); return np.column_stack((v[:,1]*t,v[:,2]*t))
    if axis=="y": return np.column_stack((v[:,0],v[:,2]))
    return np.column_stack((v[:,1],v[:,2]))


def raster(q,f,size=512,bounds=(-1,1),depth=None,color=None):
    hi=size*2; lo,up=bounds
    px=(q[:,0]-lo)/(up-lo)*(hi-1); py=(up-q[:,1])/(up-lo)*(hi-1); pts=np.column_stack((px,py))
    if color is None:
        img=Image.new("L",(hi,hi),0); draw=ImageDraw.Draw(img)
        for tri in pts[f]: draw.polygon([tuple(p) for p in tri],fill=255)
        return img.resize((size,size),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.18))
    img=Image.new("RGB",(hi,hi),(8,16,24)); draw=ImageDraw.Draw(img)
    order=np.argsort(depth[f].mean(1)) if depth is not None else np.arange(len(f))
    for rank,fi in enumerate(order):
        shade=.42+.58*(rank/max(1,len(order)-1)); c=tuple(int(x*shade) for x in color)
        draw.polygon([tuple(p) for p in pts[f[fi]]],fill=c)
    return img.resize((size,size),Image.Resampling.LANCZOS)


def iou(a,b):
    aa=np.asarray(a.convert("L").resize(b.size,Image.Resampling.LANCZOS))>128; bb=np.asarray(b.convert("L"))>128
    return np.count_nonzero(aa&bb)/max(1,np.count_nonzero(aa|bb))


def write_obj(path,v,f,title):
    with path.open("w",encoding="utf-8") as out:
        out.write(f"# {title}\no shadow_puzzle\n")
        for x,y,z in v: out.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for a,b,c in f+1: out.write(f"f {a} {b} {c}\n")


def build_one(spec,defaults,out_root):
    started=time.monotonic(); level_id=str(spec["id"]); category=str(spec["category"]).upper()
    if category not in CATEGORY_NAMES: raise ValueError(f"invalid category {category}")
    path=(ROOT/spec["target"]).resolve(); n=int(spec.get("resolution",defaults["resolution"])); seed=int(spec.get("seed",1))
    sdf,target=load_mask(path,n); field=build_field(sdf,category,seed); v,f=marching_tetrahedra(field); v,f=close_boundary_loops(v,f)
    mode="point" if category=="E" else ("dual" if category=="F" else "directional")
    if mode=="dual":
        v[:,0]/=1.2
    if mode=="point":
        scale=(v[:,0]+60)/120; v[:,1]*=scale; v[:,2]*=scale
    before=v.copy(); before_f=f.copy(); iterations=int(spec.get("polish_iterations",defaults["polish_iterations"])); v=polish_depth(v,f,mode,iterations)
    v,f=clean_mesh(v,f); v,f=close_boundary_loops(v,f)
    folder=out_root/slug(level_id); folder.mkdir(parents=True,exist_ok=True)
    write_obj(folder/"model.obj",v,f,f"{level_id} {CATEGORY_NAMES[category]}")
    shadow=raster(project(v,"x",mode),f); old_shadow=raster(project(before,"x",mode),before_f)
    target.save(folder/"target.png"); shadow.save(folder/"shadow.png")
    q,depth=project(v,player=True); pad=max(np.ptp(q,axis=0))*.1; bound=max(abs(q.min()),abs(q.max()))+pad
    player=raster(q,f,bounds=(-bound,bound),depth=depth,color=COLORS[category]); player.save(folder/"player_view.png")
    player_mask=raster(q,f,bounds=(-bound,bound)); player_mask.save(folder/"player_silhouette.png")
    secondary=None
    if mode=="dual":
        shadow2=raster(project(v,"y"),f); target2=Image.fromarray(np.fliplr(np.asarray(target)),"L")
        shadow2.save(folder/"shadow_secondary.png"); target2.save(folder/"target_secondary.png"); secondary=iou(target2,shadow2)
    primary=iou(target,shadow); target_iou=min(primary,secondary) if secondary is not None else primary
    retained=iou(old_shadow,shadow); player_iou=iou(target,player_mask)
    components,boundary,nonmanifold=topology(v,f)
    area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1); deg=int(np.count_nonzero(area<1e-11))
    ac=defaults["acceptance"]; warnings=[]
    if target_iou<float(ac["min_target_iou"]): warnings.append("target_iou")
    if retained<float(ac["min_shadow_retention"]): warnings.append("shadow_retention")
    if player_iou>float(ac["max_player_target_iou"]): warnings.append("too_recognizable")
    expected=4 if category=="E" else 1
    if components>expected: warnings.append("unexpected_components")
    if boundary: warnings.append("open_boundary")
    if nonmanifold: warnings.append("nonmanifold_edges")
    if deg: warnings.append("degenerate_triangles")
    hard={"target_iou","shadow_retention","open_boundary","nonmanifold_edges","degenerate_triangles"}
    status="FAIL" if hard.intersection(warnings) else ("WARN" if warnings else "PASS")
    m=Metrics(level_id,category,status,target_iou,secondary,retained,player_iou,len(v),len(f),components,boundary,nonmanifold,deg,time.monotonic()-started,warnings)
    files={"model":"model.obj","target":"target.png","shadow":"shadow.png","player_view":"player_view.png","player_silhouette":"player_silhouette.png"}
    if secondary is not None: files|={"target_secondary":"target_secondary.png","shadow_secondary":"shadow_secondary.png"}
    payload={"schema":"shadow-factory-level/v2","id":level_id,"category":category,"category_name":CATEGORY_NAMES[category],
             "light_mode":mode,"gameplay":spec.get("gameplay","rotate_only"),"solution":spec.get("solution",{"rotation_euler_deg":[0,0,0]}),
             "files":files,"metrics":asdict(m)}
    (folder/"level.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    return m


def contact_sheet(results,out_root):
    rows=len(results); sheet=Image.new("RGB",(1200,rows*330+90),(8,16,24)); draw=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype("DejaVuSans.ttf",20); small=ImageFont.truetype("DejaVuSans.ttf",16)
    except OSError: font=small=ImageFont.load_default()
    draw.text((30,22),"SHADOW FACTORY — PRODUCTION CONTACT SHEET",fill=(240,247,245),font=font)
    for i,m in enumerate(results):
        y=75+i*330; folder=out_root/slug(m.level_id)
        for j,name in enumerate(("target.png","player_view.png","shadow.png")):
            image=Image.open(folder/name).convert("RGB"); image.thumbnail((300,250)); sheet.paste(image,(35+j*385,y+35))
        draw.text((35,y+5),f"{m.level_id} · {m.category} · {m.status}",fill=(240,247,245),font=small)
        draw.text((805,y+292),f"IoU {m.target_iou:.3f} · retained {m.shadow_retention:.4f}",fill=(126,212,186),font=small)
    sheet.save(out_root/"contact_sheet.png")


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("config",type=Path); ap.add_argument("--output",type=Path); ap.add_argument("--only"); ap.add_argument("--zip",action="store_true",dest="make_zip"); args=ap.parse_args()
    config=yaml.safe_load(args.config.read_text(encoding="utf-8")); defaults=config["defaults"]
    out=(args.output or ROOT/config.get("output","output")).resolve()
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True); wanted={x.strip() for x in args.only.split(",")} if args.only else None
    levels=[x for x in config["levels"] if wanted is None or str(x["id"]) in wanted]; results=[]
    for i,spec in enumerate(levels,1):
        print(f"[{i}/{len(levels)}] {spec['id']} ({spec['category']})",flush=True)
        try: result=build_one(spec,defaults,out)
        except Exception as exc:
            result=Metrics(str(spec["id"]),str(spec["category"]),"ERROR",0,None,0,0,0,0,0,0,0,0,0,[f"{type(exc).__name__}: {exc}"])
        results.append(result); print(f"  {result.status} IoU={result.target_iou:.4f} retained={result.shadow_retention:.4f}",flush=True)
    valid=[x for x in results if x.status!="ERROR"]
    if valid: contact_sheet(valid,out)
    payload={"schema":"shadow-factory-batch/v2","counts":{s:sum(x.status==s for x in results) for s in ("PASS","WARN","FAIL","ERROR")},"levels":[asdict(x) for x in results]}
    (out/"batch_manifest.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    with (out/"metrics.csv").open("w",newline="",encoding="utf-8-sig") as h:
        rows=[asdict(x)|{"warnings":";".join(x.warnings)} for x in results]; w=csv.DictWriter(h,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    if args.make_zip:
        archive=out.with_suffix(".zip")
        with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for p in out.rglob("*"):
                if p.is_file(): z.write(p,p.relative_to(out.parent))
        print(archive)
    if config.get("strict") and any(x.status in {"FAIL","ERROR"} for x in results): raise SystemExit(2)


if __name__=="__main__": main()
