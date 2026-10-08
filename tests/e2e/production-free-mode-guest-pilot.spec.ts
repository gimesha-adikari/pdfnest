/**
 * GIM-32: real production processing. NO route.fulfill() and NO fake billing policy.
 * Not in normal CI. Runs only after explicit opt-in to live production.
 */
import {test,expect,type Page,type TestInfo} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {PDFDocument} from "pdf-lib";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {AUDIT_TEXT,AUDIT_DIR,createSyntheticFixtures} from "../production-free-audit/fixtures";

const active=process.env.PLATEN_PRODUCTION_AUDIT==="RUN_REAL_PRODUCTION_TESTS"
 && process.env.E2E_BASE_URL?.replace(/\/$/,"")==="https://platenpdf.com";
test.describe.configure({mode:"serial"});
test.skip(!active,"Real production is opt-in and must target https://platenpdf.com");

function trackCheckout(page:Page) {
 const seen:string[]=[];
 page.on("request",req=>{
  if(req.method()==="POST" && /\/billing\/(checkout|checkout-credits)/.test(req.url()))
   seen.push(new URL(req.url()).pathname);
 });
 return seen;
}
async function actualGuestPolicy(page:Page) {
 const sessionResponse=page.waitForResponse(r=>/\/auth\/session(?:\?|$)/.test(r.url())
  && r.request().method()==="GET",{timeout:45000});
 await page.goto("/",{waitUntil:"domcontentloaded"});
 const response=await sessionResponse;
 expect(response.status()).toBe(200);
 const session=await response.json();
 expect(session.type).toBe("guest");
 expect(session.billing_policy).toEqual({
  mode:"free",processing_unit_limits_enforced:false,purchases_enabled:false
 });
 return session.billing_policy;
}
async function output(page:Page,slug:string):Promise<Buffer> {
 await expect(page).toHaveURL(new RegExp("/"+slug+"/download(?:\\?.*)?$"),{timeout:90000});
 await expect(page.getByRole("heading",{name:"Task completed successfully!"})).toBeVisible();
 const pending=page.waitForEvent("download",{timeout:20000});
 await page.getByRole("button",{name:"Download File"}).click();
 const download=await pending;
 const file=path.join(AUDIT_DIR, "validated-"+slug+".pdf");
 await download.saveAs(file);
 return fs.readFileSync(file);
}
async function validPdf(bytes:Buffer,pages:number,words:string[]) {
 expect(bytes.subarray(0,5).toString("ascii")).toBe("%PDF-");
 const pdf=await PDFDocument.load(bytes);
 expect(pdf.getPageCount()).toBe(pages);
 const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 let text="";
 for(let n=1;n<=doc.numPages;n++){
  const items=await (await doc.getPage(n)).getTextContent();
  text+=items.items.map(item=>("str" in item? item.str:"")).join(" ")+"\n";
 }
 // PDF.js uses the document proxy only for this tiny synthetic fixture.
 for(const word of words)expect(text).toContain(word);
 return {pages,textValidated:true};
}
async function evidence(info:TestInfo,record:Record<string,unknown>) {
 await info.attach("real-processing-evidence.json",{body:Buffer.from(JSON.stringify({
  ...record, frontendSource:"0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b",origin:"https://platenpdf.com",
 },null,2)),contentType:"application/json"});
}
test.beforeAll(async()=>{if(active)await createSyntheticFixtures()});

test("guest DOCX to PDF calls live cloud and validates resulting text", async({browser},info)=>{
 const ctx=await browser.newContext({acceptDownloads:true});
 const page=await ctx.newPage(),checkout=trackCheckout(page);
 const processing:string[]=[];
 page.on("response",r=>{if(/\/api\/conversion\/word-to-pdf(?:\?|$)/.test(r.url()))
  processing.push(r.request().method()+":"+r.status());});
 try {
  await actualGuestPolicy(page);
  await page.goto("/word-to-pdf");
  await page.locator('input[type="file"]').first().setInputFiles(path.join(AUDIT_DIR,"audit.docx"));
  await expect(page).toHaveURL(/\/word-to-pdf\/workspace/);
  await page.getByRole("button",{name:"Convert to PDF Format"}).click();
  const bytes=await output(page,"word-to-pdf");
  const checked=await validPdf(bytes,1,[AUDIT_TEXT]);
  expect(processing).toContain("POST:200");
  expect(checkout).toEqual([]);
  await evidence(info,{tool:"/word-to-pdf",identity:"guest",result:"PROCESSING_AND_OUTPUT_PASS",
   billingLedger:"UNVERIFIED—guest backend ledger not exposed",requests:processing,bytes:bytes.length,
   sha256:crypto.createHash("sha256").update(bytes).digest("hex"),checked});
 }finally{await ctx.close()}
});

test("guest merges synthetic files and validates both pages", async({browser},info)=>{
 const ctx=await browser.newContext({acceptDownloads:true});
 const page=await ctx.newPage(),checkout=trackCheckout(page);
 try {
  await actualGuestPolicy(page);
  await page.goto("/merge-pdf");
  await page.locator('input[type="file"]').first().setInputFiles([
   path.join(AUDIT_DIR,"audit-a.pdf"),path.join(AUDIT_DIR,"audit-b.pdf")
  ]);
  await expect(page).toHaveURL(/\/merge-pdf\/workspace/);
  await page.getByRole("button",{name:/Merge 2 PDFs/i}).click();
  const bytes=await output(page,"merge-pdf");
  const checked=await validPdf(bytes,2,["PAGE ALPHA","PAGE BETA"]);
  expect(checkout).toEqual([]);
  await evidence(info,{tool:"/merge-pdf",identity:"guest",result:"PROCESSING_AND_OUTPUT_PASS",
   billingLedger:"NOT_APPLICABLE—client preferred execution",bytes:bytes.length,
   sha256:crypto.createHash("sha256").update(bytes).digest("hex"),checked});
 }finally{await ctx.close()}
});
