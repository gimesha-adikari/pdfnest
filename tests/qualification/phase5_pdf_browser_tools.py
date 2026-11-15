"""Synthetic fixture/mask/PDF gates for the local Phase 5 browser acceptance.

Generated documents and evidence must stay outside Git. No live baseline is
modified; masks resolve genuine completed General Editor extraction records.
"""
from pathlib import Path
import argparse, hashlib, json, math, sys, tempfile, subprocess, shutil

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'pdfnest-worker'))
import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw
from tests.test_word_edits_script_compilation import _source_pdf, _searchable_source_pdf
from tests.test_scanned_word_compiler import _fixture_pdf
from app.core.word_edits import validate_word_edit_request, resolve_word_edit_targets
from app.core.scanned_word_compiler import _prepare_target
from tests.qualification.phase5l_candidate_verification import image, compare


def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def private_path(value):
    p=Path(value).resolve()
    if any((a/'.git').exists() for a in (p,*p.parents)):
        raise ValueError('Generated documents/evidence must be outside Git')
    return p


def aligned_searchable(path):
    # Derive each hidden word box independently from visible source raster ink.
    # Font metrics then fit that measured box; production tolerances are unchanged.
    with fitz.open() as visible:
        page=visible.new_page(width=595,height=842)
        page.insert_text((60,80),'Ministry of Education, Higher',fontname='helv',fontsize=18)
        words=page.get_text('words');pix=page.get_pixmap(dpi=288,alpha=False)
        raster=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        image_bytes=pix.tobytes('png')
    with fitz.open() as doc:
        page=doc.new_page(width=595,height=842);page.insert_image(page.rect,stream=image_bytes)
        font=fitz.Font('helv')
        boxes=[]
        for word in words:
            box=fitz.Rect(word[:4]);cropbox=(math.floor(box.x0*4),math.floor(box.y0*4),math.ceil(box.x1*4),math.ceil(box.y1*4))
            crop=raster.crop(cropbox);ink=ImageChops.difference(crop,Image.new('RGB',crop.size,'white')).getbbox();assert ink
            boxes.append(((cropbox[0]+ink[0])/4,(cropbox[1]+ink[1])/4,(cropbox[0]+ink[2])/4,(cropbox[1]+ink[3])/4))
        # Hidden OCR has whole-word semantics, not character-accurate visible
        # glyph positions. Use an unscaled Base14 trace whose metric box fits
        # the independently measured ink line, at each measured word's origin.
        # Horizontal text scaling inflates MuPDF trace font size and can exceed
        # the compiler's strict replacement fit gate; it is not used here.
        top=min(box[1] for box in boxes);bottom=max(box[3] for box in boxes)
        size=(bottom-top)/(font.ascender-font.descender);baseline=top+font.ascender*size
        for word,(x0,y0,x1,y1) in zip(words,boxes):
            page.insert_text((x0,baseline),word[4],fontsize=size,fontname='helv',render_mode=3)
        actual_words=page.get_text('words');traces=page.get_texttrace()
        assert len(actual_words)==len(traces)==len(words)
        for word,trace in zip(actual_words,traces):
            rect=fitz.Rect(word[:4]);rect=fitz.Rect(rect.x0-.1,rect.y0-.1,rect.x1+.1,rect.y1+.1)
            assert all(rect.contains(fitz.Rect(char[3])) for char in trace['chars'])
        doc.save(path)


def fixtures(directory):
    directory.mkdir(parents=True,exist_ok=True)
    for name,fn in [('native',_source_pdf),('searchable',aligned_searchable),('native-second',_source_pdf)]:
        p=directory/(name+'.pdf');fn(p)
        with fitz.open(p) as d:
            page=d.new_page(width=595,height=842)
            page.insert_text((60,120),'Control page '+('B' if name=='native-second' else 'unchanged')+'.',fontsize=18,fontname='ControlFixture',fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
            data=d.tobytes(deflate=True)
        p.write_bytes(data)
    targets={}
    scan=directory/'scan.pdf';_fixture_pdf(scan)
    with fitz.open(scan) as d:
        d.new_page(width=595,height=842).insert_text((60,120),'Control page unchanged.',fontsize=18,fontname='ControlFixture',fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        data=d.tobytes(deflate=True)
    scan.write_bytes(data)
    for name,kwargs in [('table',{'border':True}),('handwriting',{'handwriting':True})]:
        targets[name]=_fixture_pdf(directory/(name+'.pdf'),**kwargs)
    for name,transform in [('rotated-image',b'594.977 5.192 -7.348 841.968 7.348 0 cm'),('sheared-image',b'595 0 20 842 0 0 cm')]:
        initial=directory/(name+'-initial.pdf');targets[name]=_fixture_pdf(initial)
        with fitz.open(initial) as d:
            found=False
            for x in d[0].get_contents():
                stream=d.xref_stream(x);changed=stream.replace(b'595 0 0 842 0 0 cm',transform)
                if stream!=changed:d.update_stream(x,changed);found=True
            assert found
            d.save(directory/(name+'.pdf'),deflate=True)
        initial.unlink()
    initial=directory/'aligned-initial.pdf';targets['misaligned-ocr']=_searchable_source_pdf(initial)
    with fitz.open(initial) as d:
        changed=False
        for x in d[0].get_contents():
            stream=d.xref_stream(x)
            if b'3 Tr' in stream:
                shifted=stream.replace(b'1 0 0 1 60 ',b'1 0 0 1 65 ')
                assert shifted!=stream;d.update_stream(x,shifted);changed=True
        assert changed;d.save(directory/'misaligned-ocr.pdf',deflate=True)
    with fitz.open(initial) as d:
        for x in d[0].get_contents():
            if b'3 Tr' in d.xref_stream(x):d.update_stream(x,b'')
        d[0].insert_text((60,80),'Ministry',fontname='helv',fontsize=18)
        d.save(directory/'visible-conflict.pdf',deflate=True)
    initial.unlink()
    # A searchable scan with deliberately unverified arbitrary hidden content:
    # it may remain image-only; no semantic region is inferred from this text.
    # Stable synthetic document IDs make fixture bytes reproducible across runs.
    for p in directory.glob('*.pdf'):
        fixed=hashlib.sha256(('platen-phase5-browser-v1:'+p.name).encode()).hexdigest()[:32]
        with fitz.open(p) as d:
            d.xref_set_key(-1,'ID',f'[<{fixed}><{fixed}>]')
            data=d.tobytes(deflate=True,no_new_id=True)
        p.write_bytes(data)
    (directory/'manifest.json').write_text(json.dumps({'targets':targets,'sources':{p.name:sha(p) for p in directory.glob('*.pdf')}},indent=2))


def mask(source,jobfile,text,original,word_id,output):
    transport=json.loads(Path(jobfile).read_text());assert transport['status']=='succeeded'
    # Go/JS JSON round trips serialize e.g. Python 1.0 as 1; the opaque baseline
    # digest must be recomputed only from the actual server-held projection.
    # Read this one already-owned, captured job ID; never enumerate or mutate jobs.
    from app.jobs.store import get_job
    trusted=get_job(transport['id']);assert trusted is not None
    job=trusted.model_dump(mode='json')
    assert job['id']==transport['id'] and job['payload']['source_key']==transport['payload']['source_key']
    assert job['result']['word_edit_baseline']==transport['result']['word_edit_baseline']
    assert job['result']['pages']==transport['result']['pages']
    layout=job['result'];matches=[]
    for p in layout['pages']:
        if p['page_num'] != 1: continue
        for e in p['elements']:
            for w in e.get('word_geometry',[]):
                if w['id']==word_id:matches.append((p,e,w))
    assert len(matches)==1
    page,element,word=matches[0];assert word['text']==original
    request={'edit_protocol':'platen_word_edits.v1','source_tracker':job['payload']['source_key'],'extraction_job_id':job['id'],'baseline_digest':layout['word_edit_baseline']['digest'],'edits':[{'page_num':page['page_num'],'element_id':element['id'],'word_id':word['id'],'expected_original_text':original,'replacement_text':text,'style_override':None,'fit_policy':'preserve_neighbors'}]}
    validated=validate_word_edit_request(request,job)
    resolved=resolve_word_edit_targets(validated,layout)
    assert sha(source)==layout['word_edit_baseline']['source_sha256']
    with fitz.open(source) as d:
        plan,reason=_prepare_target(d,resolved[0])
    record={'declared_before_compile':True,'source_sha256':sha(source),'request':request,'target':resolved[0],'mask':list(plan['allowed_rect']) if plan else None,'planning_refusal':reason,'threshold':2,'raster_band_px':1}
    Path(output).write_text(json.dumps(record,ensure_ascii=False,indent=2))


def _validate_materialized(source,candidate,declaration,output):
    frozen=json.loads(Path(declaration).read_text());assert frozen['declared_before_compile'] and frozen['mask']
    assert sha(source)==frozen['source_sha256']
    q=subprocess.run(['qpdf','--check',str(candidate)],capture_output=True,text=True);assert q.returncode==0,q.stderr
    edit=frozen['request']['edits'][0];target_page=edit['page_num']-1;text=edit['replacement_text'];old=edit['expected_original_text'];mask=frozen['mask']
    poppler=subprocess.check_output(['pdftotext','-enc','UTF-8',str(candidate),'-'],text=True)
    rows=[]
    with fitz.open(source) as a,fitz.open(candidate) as b:
        assert len(a)==len(b)
        assert all((p.mediabox,p.cropbox,p.rotation)==(q.mediabox,q.cropbox,q.rotation) for p,q in zip(a,b))
        ann=lambda d:[[(x.type,list(x.rect)) for x in (p.annots() or [])] for p in d]
        assert ann(a)==ann(b)
        stream=lambda d:[d.xref_stream_raw(i[0]) for p in d for i in p.get_images()]
        assert all(s in stream(b) for s in stream(a))
        extracted=b[target_page].get_text();assert extracted.count(text)==1 and old not in extracted
        assert poppler.count(text)==1 and old not in poppler
        source_words=[w[4] for w in a[target_page].get_text('words')]
        candidate_words=[w[4] for w in b[target_page].get_text('words')]
        assert candidate_words==([text if w==old else w for w in source_words] if source_words else [text])
        hits=b[target_page].search_for(text);assert len(hits)==1
        records=lambda p:[(w[4],tuple(round(v,2) for v in w[:4])) for w in p.get_text('words') if not fitz.Rect(w[:4]).intersects(fitz.Rect(mask))]
        assert records(a[target_page])==records(b[target_page])
        for n in range(len(a)):
            if n!=target_page:assert a[n].get_text()==b[n].get_text()
            for renderer in ['MuPDF','Poppler']:
                for dpi in [72,144,288]:
                    v=compare(image(a[n],dpi,renderer,source,n+1),image(b[n],dpi,renderer,candidate,n+1),mask if n==target_page else None,dpi)
                    assert v['outside']==0,(renderer,dpi,n,v)
                    if n!=target_page:assert v['changed']==0
                    rows.append({'renderer':renderer,'dpi':dpi,'page':n+1,**v})
    result={'source_sha256':sha(source),'candidate_sha256':sha(candidate),'qpdf':True,'mupdf_exact':True,'poppler_exact':True,'search_hits':1,'text':text,'codepoints':[f'U+{ord(ch):04X}' for ch in text],'mask':mask,'measurements':rows,'source_images_retained':True,'neighbor_records_preserved':True,'page_geometry_preserved':True,'annotations_preserved':True,'reading_order_preserved':True}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2))


def validate(source,candidate,declaration,output):
    # Host qpdf/Poppler policy cannot open hidden cache paths. Materialize exact
    # bytes in a private temporary directory; do not alter any sandbox policy.
    expected=sha(candidate)
    with tempfile.TemporaryDirectory(prefix='platen-browser-pdf-gate-') as td:
        a=Path(td)/'source.pdf';b=Path(td)/'candidate.pdf'
        shutil.copyfile(source,a);shutil.copyfile(candidate,b)
        assert sha(a)==sha(source) and sha(b)==expected
        _validate_materialized(a,b,declaration,output)
    assert sha(candidate)==expected


if __name__=='__main__':
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    f=sub.add_parser('fixtures');f.add_argument('directory')
    m=sub.add_parser('mask');m.add_argument('source');m.add_argument('job');m.add_argument('replacement');m.add_argument('original');m.add_argument('word_id');m.add_argument('output')
    v=sub.add_parser('validate');v.add_argument('source');v.add_argument('candidate');v.add_argument('declaration');v.add_argument('output')
    args=p.parse_args()
    if args.command=='fixtures':fixtures(private_path(args.directory))
    elif args.command=='mask':mask(args.source,args.job,args.replacement,args.original,args.word_id,private_path(args.output))
    else:validate(args.source,args.candidate,args.declaration,private_path(args.output))
