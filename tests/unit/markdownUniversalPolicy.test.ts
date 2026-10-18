import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { zlibSync } from "fflate";
import path from "node:path";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "../../lib/execution/types";
import { executeMarkdownToPdf } from "../../lib/execution/document/markdownClient";

async function main() {
// Real parsers, executors and codecs. Only the external cloud boundary is mocked.
// A policy/fallback regression, placeholder substitution or missing raster must fail.
const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#ff0000" } }).png().toBuffer();
const jpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#0000ff" } }).jpeg().toBuffer();
const uri = (format: string, bytes: Uint8Array) => `data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`;
const red = uri("png", png), blue = uri("jpeg", jpeg);
const file = (source: string) => new File([source], "synthetic.md", { type: "text/markdown" });
const policy = (e: unknown) => e instanceof ExecutionError && e.code === "MARKDOWN_RESOURCE_FORBIDDEN";
let passed = 0, failed = 0;
async function test(name: string, run: () => Promise<void>) {
    try { await run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
const originalCloud = CloudExecutor.execute, originalClient = ClientExecutor.execute;
const originalSafety = ExecutionSafetyGate.evaluate, originalFetch = globalThis.fetch;
const oldFlag = process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF;
let clouds = 0;
CloudExecutor.execute = async () => { clouds++; return new Blob(["cloud fixture"]); };
globalThis.fetch = async () => { throw new Error("Network forbidden in P12 unit fixture"); };
try {
    const destinations = ["image.png", "../image.png", "/tmp/image.png", "file:///tmp/image.png", "http://example.invalid/x", "https://example.invalid/x", "//example.invalid/x", "ftp://example.invalid/x", "", "data:image/svg+xml;base64,PHN2Zy8+", "data:image/gif;base64,R0lGODlh", "data:image/png;base64,invalid!", "data:image/png;base64,AA==", uri("jpeg", png), uri("png", jpeg), "data:image/jpg;base64," + jpeg.toString("base64")];
    for (const destination of destinations) await test(`direct client rejects ${destination.slice(0, 55)}`, async () => {
        await assert.rejects(ClientExecutor.execute({ tool: "markdown-to-pdf", files: [file(`![x](${destination})`)], mode: "device" }), policy);
    });
    for (const source of ["![x][ref]\n\n[ref]: ../image.png", "![x][]\n\n[x]: https://example.invalid/x", "![x]\n\n[x]: /tmp/image.png", "> - **![x](../image.png)**", "# [![x](../image.png)](https://example.invalid)", "| image |\n|---|\n| ![x](../image.png) |", '<img src="../image.png">', '<b>text</b>', '![x](http&#58;//example.invalid/x)', '![x](http\\://example.invalid/x)']) await test(`parsed resource rejection ${source.slice(0, 50)}`, async () => {
        await assert.rejects(executeMarkdownToPdf(file(source)), policy);
    });
    for (const mode of ["auto", "device", "cloud"] as const) for (const route of ["eligible", "flag-disabled", "safety-rejected"] as const) await test(`${mode}/${route} rejects before any cloud request`, async () => {
        clouds = 0; process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = route === "flag-disabled" ? "false" : "true";
        ExecutionSafetyGate.evaluate = () => ({ eligible: route !== "safety-rejected", recommendedMode: "cloud", reason: "synthetic gate" });
        await assert.rejects(ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("![x](../image.png)")], mode }), policy);
        assert.equal(clouds, 0);
    });
    await test("typed client policy failure cannot Auto retry through Cloud", async () => {
        clouds = 0; process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = "true";
        ExecutionSafetyGate.evaluate = () => ({ eligible: true, recommendedMode: "client" });
        ClientExecutor.execute = async () => { throw new ExecutionError("MARKDOWN_RESOURCE_FORBIDDEN", "trusted policy"); };
        try { await assert.rejects(ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# valid")], mode: "auto" }), policy); assert.equal(clouds, 0); }
        finally { ClientExecutor.execute = originalClient; }
    });
    for (const mode of ["auto", "device", "cloud"] as const) await test(`valid document retains ${mode} routing`, async () => {
        clouds = 0; process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = "true";
        ExecutionSafetyGate.evaluate = () => ({ eligible: true, recommendedMode: "client" });
        const result = await ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# valid")], mode });
        assert.equal(result.executionMode, mode === "cloud" ? "cloud" : "client"); assert.equal(clouds, mode === "cloud" ? 1 : 0);
    });
    await test("valid Device with client flag disabled preserves existing Cloud route", async () => {
        clouds = 0; process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = "false";
        const result = await ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# valid")], mode: "device" });
        assert.equal(result.executionMode, "cloud"); assert.equal(clouds, 1);
    });
    await test("valid safety-rejected Auto uses Cloud; Device rejects", async () => {
        clouds = 0; process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = "true";
        ExecutionSafetyGate.evaluate = () => ({ eligible: false, recommendedMode: "cloud", reason: "synthetic gate" });
        const result = await ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# valid")], mode: "auto" });
        assert.equal(result.executionMode, "cloud"); assert.equal(clouds, 1);
        await assert.rejects(ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# valid")], mode: "device" }), (e: ExecutionError) => e.code === "SAFETY_REJECTION");
    });
    await test("non-policy unsupported client operation still falls back exactly once", async () => {
        clouds = 0; ExecutionSafetyGate.evaluate = () => ({ eligible: true, recommendedMode: "client" });
        const result = await ExecutionManager.run({ tool: "markdown-to-pdf", files: [file("# සිංහල")], mode: "auto" });
        assert.equal(result.executionMode, "cloud"); assert.equal(clouds, 1);
    });
    await test("inert links, code, comments, escaped and malformed image-like text succeed", async () => {
        const blob = await executeMarkdownToPdf(file('# Inert\n\n[x](https://example.invalid)\n\n`![x](../image.png)`\n\n```md\n![x](../image.png)\n```\n\n\\![x](../image.png)\n\n![missing][unresolved]\n\n<!-- <img src="../image.png"> -->\n\n![unclosed(\n\n**bold** and *italic*'));
        assert.ok((await PDFDocument.load(await blob.arrayBuffer())).getPageCount() > 0);
    });
    await test("source read failure keeps safe input classification and cannot Cloud retry", async () => {
        clouds=0;const input=file("# unreadable");input.text=async()=>{throw new Error("synthetic read failure");};
        await assert.rejects(ExecutionManager.run({tool:"markdown-to-pdf",files:[input],mode:"auto"}),(e:ExecutionError)=>e.code==="INVALID_INPUT");assert.equal(clouds,0);
    });
    await test("source cap rejects before File.text", async () => {
        let read = false; const input = new File([new Uint8Array((2 << 20) + 1)], "large.md");
        input.text = async () => { read = true; return "# small"; };
        await assert.rejects(executeMarkdownToPdf(input), policy); assert.equal(read, false);
    });
    await test("image count rejects before output", async () => { await assert.rejects(executeMarkdownToPdf(file(Array(33).fill(`![x](${red})`).join("\n\n"))), policy); });
    await test("encoded image budget rejects", async () => { await assert.rejects(executeMarkdownToPdf(file(`![x](data:image/png;base64,${"A".repeat((1 << 20) + 4)})`)), policy); });
    await test("overdimension image rejected", async () => {
        const bytes = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "red" } }).png().toBuffer();
        await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("png", bytes)})`)), policy);
    });
    await test("truncated PNG and JPEG reject instead of placeholder", async () => {
        for (const [format, bytes] of [["png", png], ["jpeg", jpeg]] as const) await assert.rejects(executeMarkdownToPdf(file(`![x](${uri(format, bytes.subarray(0, bytes.length - 12))})`)), policy);
    });
    await test("early JPEG EOI cannot repair missing entropy into success", async () => {
        const start = jpeg.indexOf(Buffer.from([255,218]));
        assert.ok(start > 0); const end = start + 2 + jpeg.readUInt16BE(start + 2);
        for (const keep of [0,1,2,4]) {
            const corrupt = Buffer.concat([jpeg.subarray(0, end + keep), Buffer.from([255,217])]);
            await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("jpeg", corrupt)})`)), policy);
        }
    });
    await test("malformed PNG transparency is rejected", async () => {
        function chunk(type: string, payload: Buffer) {
            const body = Buffer.concat([Buffer.from(type), payload]); let crc = 0xffffffff;
            for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
            const output = Buffer.alloc(payload.length + 12); output.writeUInt32BE(payload.length); body.copy(output,4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0,output.length-4); return output;
        }
        const short = chunk("tRNS",Buffer.from([0])); const valid = chunk("tRNS",Buffer.alloc(6));
        for (const extra of [short, Buffer.concat([valid,valid])]) {
            const corrupt = Buffer.concat([png.subarray(0,33),extra,png.subarray(33)]);
            await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("png",corrupt)})`)),policy);
        }
    });
    await test("JPEG segment lengths and table IDs are format validated", async () => {
        const start = jpeg.indexOf(Buffer.from([255,218]));
        for (const length of [2,3,11,13]) { const corrupt = Buffer.from(jpeg); corrupt.writeUInt16BE(length,start+2); await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("jpeg",corrupt)})`)),policy); }
        const corrupt = Buffer.from(jpeg); const dqt = corrupt.indexOf(Buffer.from([255,219])); const sof = corrupt.indexOf(Buffer.from([255,192]));
        assert.ok(dqt > 0 && sof > 0); corrupt[dqt+4] = 4; corrupt[sof+12] = 4;
        await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("jpeg",corrupt)})`)),policy);
    });
    await test("indexed PNG cannot reference outside its palette", async () => {
        function chunk(type: string, payload: Uint8Array) {
            const body = Buffer.concat([Buffer.from(type),payload]); let crc = 0xffffffff;
            for (const byte of body) { crc ^= byte; for (let i=0;i<8;i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
            const output=Buffer.alloc(payload.length+12);output.writeUInt32BE(payload.length);body.copy(output,4);output.writeUInt32BE((crc^0xffffffff)>>>0,output.length-4);return output;
        }
        const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=2;header[9]=3;
        const corrupt=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("PLTE",Buffer.from([255,0,0,0,0,255])),chunk("IDAT",zlibSync(new Uint8Array([0,192]))),chunk("IEND",Buffer.alloc(0))]);
        await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("png",corrupt)})`)),policy);
    });
    await test("PNG compressed stream must end exactly without trailing junk", async () => {
        let offset = 8; const parts: Buffer[] = [png.subarray(0,8)];
        while (offset < png.length) {
            const length = png.readUInt32BE(offset), end = offset + 12 + length;
            if (png.toString("ascii",offset+4,offset+8) === "IDAT") {
                const data = png.subarray(offset+8,end-4);
                const body = Buffer.concat([Buffer.from("IDAT"),data,Buffer.from([1,2,3,4]),data.subarray(-4)]);
                let crc = 0xffffffff; for (const byte of body) { crc ^= byte; for (let b=0;b<8;b++) crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1; }
                const chunk=Buffer.alloc(body.length+8);chunk.writeUInt32BE(body.length-4);body.copy(chunk,4);chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);parts.push(chunk);
            } else parts.push(png.subarray(offset,end));
            offset=end;
        }
        await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("png",Buffer.concat(parts))})`)),policy);
    });
    await test("pixel and aggregate budgets reject bounded image references", async () => {
        const tooManyPixels=await sharp({create:{width:2001,height:2000,channels:3,background:"red"}}).png().toBuffer();
        await assert.rejects(executeMarkdownToPdf(file(`![x](${uri("png",tooManyPixels)})`)),policy);
        const large=await sharp({create:{width:2000,height:2000,channels:3,background:"red"}}).png().toBuffer();
        await assert.rejects(executeMarkdownToPdf(file(Array(5).fill(`![x](${uri("png",large)})`).join("\n\n"))),policy);
    });
    await test("impossible image table width fails instead of emitting negative image dimensions", async () => {
        const source=`|${Array(60).fill("x").join("|")}|\n|${Array(60).fill("---").join("|")}|\n|![red](${red})|${Array(59).fill("cell").join("|")}|`;
        await assert.rejects(executeMarkdownToPdf(file(source)),(e:ExecutionError)=>e.code === "UNSUPPORTED_CLIENT_OP");
    });
    await test("cancel during source read cannot return PDF", async () => {
        const controller = new AbortController(); const input = file("# cancellation");
        input.text = async () => { controller.abort(); return "# cancellation"; };
        await assert.rejects(ClientExecutor.execute({ tool: "markdown-to-pdf", files: [input], mode: "device", signal: controller.signal }), (e: ExecutionError) => e.code === "USER_CANCELLATION");
    });
    await test("PNG and JPEG are real PDF images with correct color, text order and margins", async () => {
        const blob = await executeMarkdownToPdf(file(`# Image ordering\n\nBEFORE\n\nleft ![red](${red}) middle ![blue](${blue}) AFTER\n\n- list item\n\n> quote\n\n| Key | Value |\n|---|---|\n| A | B |`), { paperSize: "letter", marginLeft: 0.5 });
        const data = new Uint8Array(await blob.arrayBuffer()); const doc = await PDFDocument.load(data);
        let imageObjects = 0;
        for (const [, obj] of doc.context.enumerateIndirectObjects()) if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) imageObjects++;
        assert.equal(imageObjects, 2, "must embed both actual raster images");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loading = pdfjs.getDocument({ data, standardFontDataUrl: path.resolve("node_modules/pdfjs-dist/standard_fonts") + "/" });
        const pdf = await loading.promise;
        try {
            const page = await pdf.getPage(1); const text = await page.getTextContent();
            const words = text.items.filter((item): item is typeof item & { str: string } => "str" in item).map(item => item.str).join(" ");
            assert.match(words, /BEFORE[\s\S]*left[\s\S]*middle[\s\S]*AFTER/); assert.doesNotMatch(words, /\[Image:/);
            const canvasPackage = "@napi-rs/canvas"; const { createCanvas } = await import(canvasPackage);
            const viewport = page.getViewport({ scale: 1 }); const canvas = createCanvas(viewport.width, viewport.height); const context = canvas.getContext("2d");
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; let reds = 0, blues = 0, redTop = Infinity, redBottom = 0, blueTop = Infinity, blueBottom = 0;
            for (let i = 0; i < pixels.length; i += 4) { const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
                if (pixels[i] > 220 && pixels[i+1] < 40 && pixels[i+2] < 40) { reds++; redTop=Math.min(redTop,y);redBottom=Math.max(redBottom,y);assert.ok(x>=36 && x<canvas.width-28); }
                if (pixels[i+2] > 220 && pixels[i] < 40 && pixels[i+1] < 40) { blues++;blueTop=Math.min(blueTop,y);blueBottom=Math.max(blueBottom,y);assert.ok(x>=36 && x<canvas.width-28); } }
            assert.ok(reds > 60 && blues > 60, `visible red and blue pixels required: ${reds}/${blues}`);
            assert.equal(viewport.width,612);assert.equal(viewport.height,792);
            assert.ok(redTop>=28 && redBottom<blueTop && blueBottom<viewport.height-28,"ordered images stay inside page margins");
            const items=text.items.filter((item):item is typeof item & {str:string;transform:number[]}=>"str" in item);
            const baseline=(word:string)=>viewport.height-items.find(item=>item.str.includes(word))!.transform[5];
            assert.ok(baseline("left")<redTop && baseline("middle")>redBottom && baseline("middle")<blueTop && baseline("AFTER")>blueBottom,"text stays before/between/after actual image positions");
        } finally { await loading.destroy(); }
    });
    await test("progressive JPEG and interlaced PNG remain real embedded images", async () => {
        const progressive=await sharp(jpeg).jpeg({progressive:true}).toBuffer();
        const interlaced=await sharp(png).png({progressive:true}).toBuffer();
        const result=await executeMarkdownToPdf(file(`![p](${uri("jpeg",progressive)})\n\n![p](${uri("png",interlaced)})`));
        const doc=await PDFDocument.load(await result.arrayBuffer());
        const images=doc.context.enumerateIndirectObjects().filter(([,obj])=>obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
        assert.equal(images.length,2);
    });
    await test("reference, list, quote and table images paginate inside margins in document order", async () => {
        const largeRed=uri("png",await sharp(png).resize(600,300).png().toBuffer());
        const largeBlue=uri("jpeg",await sharp(jpeg).resize(600,300).jpeg().toBuffer());
        const source=Array.from({length:8},(_,i)=>`# SECTION_${i}\n\n![r][red]\n\n> ![b](${largeBlue})\n\n- ![r](${largeRed})\n`).join("\n")+`\n| Image | Text |\n|---|---|\n| ![r](${red}) | TABLE_END |\n\nEND_DOCUMENT\n\n[red]: ${largeRed}`;
        const result=await executeMarkdownToPdf(file(source),{paperSize:"A4",marginTop:0.5,marginBottom:0.5,marginLeft:0.5,marginRight:0.5});
        const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loading=pdfjs.getDocument({data:new Uint8Array(await result.arrayBuffer()),standardFontDataUrl:path.resolve("node_modules/pdfjs-dist/standard_fonts")+"/"});
        const pdf=await loading.promise;let text="",redPixels=0,bluePixels=0;
        try {
            assert.ok(pdf.numPages>=4,"images must cause real page breaks");
            const canvasPackage="@napi-rs/canvas";const {createCanvas}=await import(canvasPackage);
            for(let n=1;n<=pdf.numPages;n++) {
                const page=await pdf.getPage(n);const content=await page.getTextContent();text+=content.items.filter(item=>"str" in item).map(item=>"str" in item?item.str:"").join(" ")+" ";
                const viewport=page.getViewport({scale:1}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext("2d");
                await page.render({canvasContext:context,viewport,canvas}).promise;const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
                for(let i=0;i<pixels.length;i+=4) {
                    const redPixel=pixels[i]>220&&pixels[i+1]<40&&pixels[i+2]<40,bluePixel=pixels[i+2]>220&&pixels[i]<40&&pixels[i+1]<40;
                    if(!redPixel&&!bluePixel)continue;
                    const x=(i/4)%canvas.width,y=Math.floor(i/4/canvas.width);
                    assert.ok(x>=36&&x<=viewport.width-36&&y>=35&&y<=viewport.height-35,`image escapes page ${n} margins at ${x},${y}`);
                    if(redPixel)redPixels++;if(bluePixel)bluePixels++;
                }
            }
            let last=-1;for(let i=0;i<8;i++){const next=text.indexOf(`SECTION_${i}`);assert.ok(next>last);last=next;}
            assert.ok(text.indexOf("TABLE_END")>last&&text.indexOf("END_DOCUMENT")>text.indexOf("TABLE_END"));
            assert.ok(redPixels>10000&&bluePixels>10000,"nested image pixels must actually render");assert.doesNotMatch(text,/\[Image:/);
        } finally {await loading.destroy();}
    });

} finally {
    CloudExecutor.execute = originalCloud; ClientExecutor.execute = originalClient; ExecutionSafetyGate.evaluate = originalSafety; globalThis.fetch = originalFetch;
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF; else process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF = oldFlag;
}
console.log(`Universal Markdown policy: ${passed} passed, ${failed} failed, 0 skipped.`);
process.exitCode = failed ? 1 : 0;

}
void main();
