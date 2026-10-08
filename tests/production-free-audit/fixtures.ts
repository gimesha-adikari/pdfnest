import fs from "node:fs";
import path from "node:path";
import {PDFDocument, StandardFonts} from "pdf-lib";
import {Document, Packer, Paragraph} from "docx";
import JSZip from "jszip";
export const AUDIT_TEXT = "PLATEN FREE MODE AUDIT 2026 SYNTHETIC";
export const AUDIT_DIR = path.resolve(process.cwd(),"test-results/production-free-fixtures");
async function writePdf(name:string,marker:string) {
 const doc=await PDFDocument.create(); const p=doc.addPage([360,480]);
 p.drawText(AUDIT_TEXT+" "+marker,{x:20,y:410,size:11,font:await doc.embedFont(StandardFonts.Helvetica)});
 fs.writeFileSync(path.join(AUDIT_DIR,name),await doc.save());
}
export async function createSyntheticFixtures(){
 fs.mkdirSync(AUDIT_DIR,{recursive:true});
 await writePdf("audit-a.pdf","PAGE ALPHA"); await writePdf("audit-b.pdf","PAGE BETA");
 const docx=new Document({sections:[{children:[new Paragraph(AUDIT_TEXT),new Paragraph("Synthetic fixture no personal data")]}]});
 fs.writeFileSync(path.join(AUDIT_DIR,"audit.docx"),await Packer.toBuffer(docx));
 fs.writeFileSync(path.join(AUDIT_DIR,"audit.md"),"# "+AUDIT_TEXT+"\nSynthetic markdown\n");
 fs.writeFileSync(path.join(AUDIT_DIR,"audit.js"),"// "+AUDIT_TEXT+"\nconsole.log('synthetic');\n");
 const zip=new JSZip();zip.file("README.md","# "+AUDIT_TEXT+"\n");zip.file("src/index.js","export const synthetic=true;\n");
 fs.writeFileSync(path.join(AUDIT_DIR,"audit-repository.zip"),await zip.generateAsync({type:"nodebuffer"}));
 // This 1px PNG is NOT a meaningful OCR fixture; do not mark OCR as tested.
 fs.writeFileSync(path.join(AUDIT_DIR,"audit-pixel.png"),Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WHIZ5kAAAAASUVORK5CYII=","base64"));
 return AUDIT_DIR;
}
if(process.argv[1]?.endsWith("fixtures.ts"))createSyntheticFixtures().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
