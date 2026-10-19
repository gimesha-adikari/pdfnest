// Run with: npx tsx tests/serveCodeWorkspaceHarness.mts
// Controlled browser fixture, never an application route or production backend.
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import pdfLib from "pdf-lib";
const { PDFDocument, StandardFonts } = pdfLib;

const directory = mkdtempSync(path.join(os.tmpdir(), "platen-code-browser-"));
const hostileName = 'source.x"><img src=x onerror=alert(1)>';
for (const name of ["A.ts", "retry.ts", hostileName]) writeFileSync(path.join(directory, name), "const synthetic = 42; // inert fixture\n");
// A bounded synthetic source just above the deployed raw-source limit.
writeFileSync(path.join(directory, "oversized.ts"), Buffer.alloc(16 * 1024 * 1024 + 1, 32));
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Courier);
pdf.addPage().drawText("const synthetic = 42; // loopback fixture", { x: 40, y: 780, size: 12, font });
const pdfBytes = await pdf.save();
const observations: Array<{ filename: string; disposition: string }> = [];
let posts = 0;
const mocks: Record<string, string> = {
    "next/navigation": `export const useRouter=()=>({push:u=>window.codeHarness.navigate(u),replace:u=>window.codeHarness.navigate(u)}); export const useParams=()=>({toolId:'code-to-pdf'}); export const notFound=()=>{throw Error('Not found')};`,
    "@/context/AuthContext": `export const useAuth=()=>({billingPolicy:{mode:'free'},requireAuth:action=>window.codeHarness.delayAuth?window.codeHarness.authCallbacks.push(action):action()});`,
    "@/context/ToolContext": `export const useTools=()=>({getToolByHref:()=>({title:'Code to PDF',accept:'*'}),tools:[],isLoading:false});`,
    "@/context/BackendHealthContext": `export const useBackendHealth=()=>({status:'online'});`,
    "@/context/WorkflowContext": `export const useWorkflow=()=>({setPendingTransfer:()=>{},clearTransfer:()=>{}});`,
    "@/context/RepositoryAnalyzerContext": `export const RepositoryAnalyzerProvider=({children})=>children;`,
    "@/components/pdf/BackendOnlyToolGuard": `export const BackendOnlyToolGuard=({children})=>children;`,
    "@/components/SEO/ToolFAQ": `export default ()=>null;`,
    "@/components/SEO/ToolSchema": `export default ()=>null;`,
    "@/components/tools/RepositoryAnalyzerDownload": `export default ()=>null;`,
};
const server = createServer(async (request, response) => {
    try {
        const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        if (request.url === "/observations") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ posts, observations })); return;
        }
        if (request.method === "POST" && request.url === "/api/conversion/code-to-pdf") {
            posts++;
            if (Number(request.headers["content-length"]) > 16 * 1024 * 1024) {
                response.writeHead(413, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ code: "CODE_SOURCE_TOO_LARGE", message: "synthetic diagnostic /private/fixture" }));
                request.resume(); return;
            }
            const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const body = Buffer.concat(chunks);
            const form = await new Request(origin, {method:"POST",headers:{"Content-Type":request.headers["content-type"]!},body}).formData();
            const file = form.get("file") as File;
            observations.push({ filename: file.name, disposition: body.toString("utf8").split("\r\n").find(line => line.startsWith("Content-Disposition:")) || "" });
            response.writeHead(200, { "Content-Type": "application/pdf" }); response.end(pdfBytes); return;
        }
        if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle); return; }
        if (request.url === "/pdf.worker.mjs") { response.setHeader("Content-Type", "text/javascript"); response.end(readFileSync("public/pdf.worker.mjs")); return; }
        if (request.url !== "/") { response.writeHead(404); response.end(); return; }
        response.setHeader("Content-Type", "text/html");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'");
        response.end('<!doctype html><html><title>Code ownership local fixture</title><style>body{font:14px system-ui;max-width:1000px;margin:24px auto}button,select,input{margin:6px;padding:6px}img{max-height:480px}svg{height:20px}.sr-only{position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden}</style><div id="root"></div><script src="/bundle.js"></script></html>');
    } catch (error) { console.error(error); response.writeHead(500); response.end("Fixture failed"); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const result = await build({ entryPoints: ["tests/fixtures/codeWorkspaceBrowser.tsx"], bundle: true, write: false, platform: "browser", format: "iife", target: "es2022",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(origin) },
    plugins: [{ name: "framework-fixtures", setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? {path:args.path, namespace:"fixture"} : null);
        builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"jsx"}));
    } }],
});
const bundle = result.outputFiles[0].contents;
console.log(JSON.stringify({ origin, directory, hostileName }));
const cleanup = () => { server.close(); rmSync(directory, { recursive: true, force: true }); process.exit(); };
process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
