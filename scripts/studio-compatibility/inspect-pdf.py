#!/usr/bin/env python3
import argparse, hashlib, json, math, os, re, subprocess, sys, tempfile
from pathlib import Path
import fitz
from PIL import Image
import numpy as np

def sha(data):
    return hashlib.sha256(data).hexdigest()

def words_and_mask(source, target, mode):
    doc = fitz.open(source)
    if not len(doc):
        raise ValueError("source has no pages")
    page = doc[0]
    if mode == "scan-line":
        with tempfile.TemporaryDirectory(prefix="studio-mask-") as td:
            prefix = str(Path(td) / "source")
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-r", "300", "-png", source, prefix], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            tsv = subprocess.run(["tesseract", prefix + ".png", "stdout", "--psm", "6", "tsv"], check=True, capture_output=True, text=True).stdout
        rows = [line.split("\t") for line in tsv.splitlines()[1:] if line.strip()]
        target_tokens = [part.casefold() for part in target.split()]
        groups = {}
        for row in rows:
            if len(row) >= 12 and row[11].strip():
                groups.setdefault(tuple(row[2:5]), []).append(row)
        group = next((items for items in groups.values()
                      if all(any(token in row[11].strip().casefold() for row in items) for token in target_tokens)), None)
        if not group:
            raise ValueError("pre-compilation OCR baseline did not contain the complete mask target line")
        x0=min(int(r[6]) for r in group); y0=min(int(r[7]) for r in group)
        x1=max(int(r[6])+int(r[8]) for r in group); y1=max(int(r[7])+int(r[9]) for r in group)
        rect=fitz.Rect(x0*72/300,y0*72/300,x1*72/300,y1*72/300)
        chosen={"mode":"scan-line","tokens":[r[11] for r in group]}
    else:
        ws=page.get_text("words", sort=True)
        target_tokens=target.split()
        candidates=[]
        for i in range(0, max(0,len(ws)-len(target_tokens)+1)):
            slice_=ws[i:i+len(target_tokens)]
            if [w[4] for w in slice_] == target_tokens:
                candidates.append(slice_)
        if not candidates:
            # Target may be a single token substring when OCR/pdf extraction adds punctuation.
            candidates=[[w] for w in ws if w[4].strip(".,:;") == target.strip(".,:;")]
        if not candidates:
            raise ValueError("frozen source PDF text did not contain the mask target")
        selected=candidates[0]
        if mode == "line":
            block,line=selected[0][5],selected[0][6]
            selected=[w for w in ws if w[5]==block and w[6]==line]
        rect=fitz.Rect(min(w[0] for w in selected),min(w[1] for w in selected),max(w[2] for w in selected),max(w[3] for w in selected))
        chosen={"mode":mode,"tokens":[w[4] for w in selected]}
        if page.rotation:
            rect=rect * page.rotation_matrix
    rect=rect & page.rect
    margin=4.0
    rect=fitz.Rect(max(page.rect.x0,rect.x0-margin),max(page.rect.y0,rect.y0-margin),min(page.rect.x1,rect.x1+margin),min(page.rect.y1,rect.y1+margin))
    result={"source_sha256":sha(Path(source).read_bytes()),"page_index":0,"page_rect":[page.rect.x0,page.rect.y0,page.rect.x1,page.rect.y1],"source_rotation":page.rotation,"mask_points":[round(rect.x0,4),round(rect.y0,4),round(rect.x1,4),round(rect.y1,4)],"margin_points":margin,"antialias_band_pixels":1,"channel_delta_threshold":2,"source_baseline":chosen,"declared_before_compile":True}
    doc.close()
    return result

def qpdf(path):
    p=subprocess.run(["qpdf","--check",path],capture_output=True,text=True)
    if p.returncode:
        raise ValueError("qpdf structural validation failed")
    return {"exit_code":p.returncode,"summary":"qpdf --check passed"}

def page_geometry(path):
    d=fitz.open(path); out=[]
    for p in d:
        out.append({"media_box":[round(x,4) for x in p.mediabox],"crop_box":[round(x,4) for x in p.cropbox],"rotation":p.rotation,"page_rect":[round(x,4) for x in p.rect],"annotations":len(list(p.annots() or [])),"links":len(p.get_links())})
    d.close()
    return out

def images_sha(path):
    d=fitz.open(path); out=[]
    for p in d:
        for item in p.get_images(full=True):
            xref=item[0]
            try: out.append(sha(d.extract_image(xref)["image"]))
            except Exception: pass
    d.close()
    return sorted(set(out))

def page_texts(path):
    d=fitz.open(path); out=[p.get_text("text",sort=True) for p in d]; d.close()
    return out

def render_mupdf(path,page_no,dpi,out):
    p=subprocess.run(["mutool","draw","-q","-F","png","-r",str(dpi),"-o",str(out),path,str(page_no+1)],capture_output=True,text=True)
    if p.returncode: raise ValueError("MuPDF render failed")
def render_poppler(path,page_no,dpi,prefix):
    p=subprocess.run(["pdftoppm","-f",str(page_no+1),"-l",str(page_no+1),"-singlefile","-r",str(dpi),"-png",path,str(prefix)],capture_output=True,text=True)
    if p.returncode: raise ValueError("Poppler render failed")
    return str(prefix)+".png"

def pixel_diff(src, cand, mask, dpi):
    a=np.asarray(Image.open(src).convert("RGB"),dtype=np.int16)
    b=np.asarray(Image.open(cand).convert("RGB"),dtype=np.int16)
    if a.shape != b.shape: raise ValueError("render dimensions changed")
    changed=np.max(np.abs(a-b),axis=2)>2
    allow=np.zeros(changed.shape,dtype=bool)
    if mask:
        x0,y0,x1,y1=mask
        # One raster-pixel antialias allowance is fixed in the source-declared mask.
        px=1
        left=max(0,math.floor(x0*dpi/72)-px); top=max(0,math.floor(y0*dpi/72)-px)
        right=min(changed.shape[1],math.ceil(x1*dpi/72)+px); bottom=min(changed.shape[0],math.ceil(y1*dpi/72)+px)
        allow[top:bottom,left:right]=True
    return {"changed_pixels":int(changed.sum()),"changed_outside_mask":int((changed & ~allow).sum()),"changed_inside_mask":int((changed & allow).sum()),"render_dimensions":[int(a.shape[1]),int(a.shape[0])],"mask_raster_box":None if mask is None else [left,top,right,bottom]}

def validate(args):
    source_hash=sha(Path(args.source).read_bytes())
    mask=json.loads(Path(args.mask).read_text())
    if not mask.get("declared_before_compile") or mask.get("source_sha256") != source_hash:
        raise ValueError("mask is not bound to the unchanged source fixture")
    source_geometry=page_geometry(args.source); candidate_geometry=page_geometry(args.candidate)
    if len(source_geometry)!=int(args.pages) or len(candidate_geometry)!=int(args.pages):
        raise ValueError("PDF page count differs from the declared fixture")
    if source_geometry!=candidate_geometry:
        raise ValueError("page boxes, rotation, annotations, links or page size changed")
    qsource=qpdf(args.source); qcand=qpdf(args.candidate)
    source_text=page_texts(args.source); candidate_text=page_texts(args.candidate)
    all_text="\n".join(candidate_text)
    if args.mode=="scan":
        with tempfile.TemporaryDirectory(prefix="studio-candidate-ocr-") as td:
            prefix=str(Path(td)/"candidate")
            subprocess.run(["pdftoppm","-f","1","-l","1","-singlefile","-r","300","-png",args.candidate,prefix],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            ocr=subprocess.run(["tesseract",prefix+".png","stdout","--psm","6"],check=True,capture_output=True,text=True).stdout
        visible=ocr
    else:
        visible=all_text
    if args.expected not in visible: raise ValueError("candidate logical/visible extraction missed the expected replacement")
    if args.stale and args.stale in visible: raise ValueError("candidate extraction still contains the obsolete target")
    if args.neighbor and args.neighbor not in all_text: raise ValueError("candidate extraction lost the declared neighboring/control text")
    src_images=images_sha(args.source); dst_images=images_sha(args.candidate)
    image_streams_preserved = not src_images or set(src_images).issubset(set(dst_images))
    if src_images and not image_streams_preserved and not args.allow_image_reencoding:
        raise ValueError("original image stream was not preserved")
    metrics=[]
    for dpi in (72,144,288):
        for renderer in ("mupdf","poppler"):
            for page_no in range(len(source_geometry)):
                with tempfile.TemporaryDirectory(prefix="studio-render-") as td:
                    root=Path(td)
                    if renderer=="mupdf":
                        sp=root/"s.png"; cp=root/"c.png"
                        render_mupdf(args.source,page_no,dpi,sp); render_mupdf(args.candidate,page_no,dpi,cp)
                    else:
                        sp=Path(render_poppler(args.source,page_no,dpi,root/"s"))
                        cp=Path(render_poppler(args.candidate,page_no,dpi,root/"c"))
                    region=mask["mask_points"] if page_no==0 else None
                    m=pixel_diff(sp,cp,region,dpi)
                    record={"renderer":renderer,"dpi":dpi,"page":page_no+1,**m}
                    metrics.append(record)
                    if record["changed_outside_mask"]!=0:
                        raise ValueError("unauthorized changed pixels detected outside the predeclared source mask")
                    if page_no>0 and record["changed_pixels"]!=0:
                        raise ValueError("an unedited control page is not pixel-identical")
    if args.neighbor_position:
        needle=args.neighbor_position
        sd=fitz.open(args.source); cd=fitz.open(args.candidate)
        def token(doc, needle):
            for pg in doc:
                for w in pg.get_text("words",sort=True):
                    if w[4]==needle: return [float(x) for x in w[:4]]
            return None
        a=token(sd,needle); b=token(cd,needle); sd.close(); cd.close()
        if a is None or b is None or any(abs(x-y)>1.5 for x,y in zip(a,b)):
            raise ValueError("neighbor word position changed beyond 1.5 points")
    result={"source_sha256":source_hash,"candidate_sha256":sha(Path(args.candidate).read_bytes()),"page_count":len(source_geometry),"geometry":source_geometry,"source_image_sha256":src_images,"candidate_image_sha256":dst_images,"source_image_streams_preserved":image_streams_preserved,"image_stream_policy":("source-stream-identity" if image_streams_preserved else ("representation-change-allowed; raster-preservation-required" if args.allow_image_reencoding else "source-stream-identity-required")),"qpdf_source":qsource,"qpdf_candidate":qcand,"expected_text_present":args.expected,"obsolete_target_absent":args.stale or None,"neighbor_text_present":args.neighbor or None,"visible_ocr":visible if args.mode=="scan" else None,"mask":mask,"pixel_metrics":metrics,"zero_unauthorized_changes":True,"untouched_pages_pixel_identical":True}
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    return result

def main():
    p=argparse.ArgumentParser()
    subs=p.add_subparsers(dest="cmd",required=True)
    d=subs.add_parser("declare-mask")
    d.add_argument("--source",required=True); d.add_argument("--output",required=True); d.add_argument("--target",required=True); d.add_argument("--mode",choices=["word","line","scan-line"],required=True)
    v=subs.add_parser("verify")
    for n in ("source","candidate","mask","output","expected"):
        v.add_argument("--"+n,required=True)
    for n in ("stale","neighbor","neighbor-position"):
        v.add_argument("--"+n,default="")
    v.add_argument("--pages",type=int,required=True); v.add_argument("--mode",choices=["text","scan"],required=True)
    v.add_argument("--allow-image-reencoding",action="store_true",help="For representation-changing Studio raster exports, rely on the frozen source mask, independent renderers and exact untouched-page checks instead of requiring identical embedded image streams.")
    a=p.parse_args()
    try:
        if a.cmd=="declare-mask":
            Path(a.output).write_text(json.dumps(words_and_mask(a.source,a.target,a.mode),indent=2)+"\n")
            print("source-bound mask declared before compilation")
        else:
            r=validate(a)
            print(json.dumps({"source_sha256":r["source_sha256"],"candidate_sha256":r["candidate_sha256"],"page_count":r["page_count"],"comparisons":len(r["pixel_metrics"]),"zero_unauthorized_changes":True,"untouched_pages_pixel_identical":True}))
    except Exception as e:
        print(type(e).__name__+": "+str(e),file=sys.stderr)
        sys.exit(1)

if __name__=="__main__": main()
