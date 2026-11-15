/** Local-only browser handoff. Never publish generated PDFs, fonts or renders. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const [pdf,manifest,image,output]=process.argv.slice(2);
if (!pdf||!manifest||!image||!output) throw new Error('Usage: tsx tests/qualification/buildCandidateSelectionProbe.mts candidate.pdf selection.json page.png output-dir');
const root=path.resolve(output);
for (let ancestor=root; ; ancestor=path.dirname(ancestor)) {
  if (await fs.stat(path.join(ancestor,'.git')).then(()=>true,()=>false)) throw new Error('Generated browser artifacts must stay outside Git repositories');
  if (path.dirname(ancestor)===ancestor) break;
}
await fs.mkdir(root,{recursive:true});
await fs.copyFile(pdf,path.join(root,'candidate.pdf'));await fs.copyFile(manifest,path.join(root,'selection.json'));await fs.copyFile(image,path.join(root,'page.png'));
const component=path.resolve('components/tools/CandidateWordSelection.tsx');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Viewer from ${JSON.stringify(component)};
const [metadata,bytes]=await Promise.all([fetch('./selection.json').then(r=>r.json()),fetch('./candidate.pdf').then(r=>r.arrayBuffer())]);
const file=new File([bytes],'verified-candidate.pdf',{type:'application/pdf'});
createRoot(document.getElementById('viewer')).render(React.createElement(Viewer,{file,artifactSha256:metadata.artifact_sha256,metadata,page:1,imageSrc:'./page.png'}));
document.getElementById('paste').addEventListener('input',e=>{const text=e.target.value;document.getElementById('result').textContent=JSON.stringify({text,codepoints:Array.from(text,c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'))});});`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'probe.mts',loader:'ts'},bundle:true,format:'esm',target:'es2022',outfile:path.join(root,'probe.js'),alias:{'@':process.cwd()},define:{'process.env.NODE_ENV':'"development"'}});
await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Phase 5L candidate whole-word selection probe</title><style>body{font:16px system-ui;max-width:900px;margin:20px auto}#viewer>div>div:last-child{position:relative;display:inline-block}#viewer img{max-height:650px;max-width:100%;display:block}[data-candidate-word]:focus{outline:2px solid blue}.absolute{position:absolute}.inset-0{inset:0}.overflow-hidden{overflow:hidden}textarea{display:block;width:90%;height:70px}</style><h1>Candidate-derived whole-word selection — isolated prototype</h1><p>This probe does not edit the PDF. Enable selection, click a word, copy it using Ctrl+C, focus the empty paste field and use Ctrl+V. The paste field is never populated programmatically.</p><div id="viewer"></div><label for="paste">Paste the copied PDF word here</label><textarea id="paste" autocomplete="off"></textarea><pre id="result"></pre><script type="module" src="./probe.js"></script></html>`);
console.log('Local-only browser probe built:',root);
