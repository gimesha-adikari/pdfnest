import {test, expect, type Page, type BrowserContext} from "@playwright/test";
import {PDFDocument, StandardFonts} from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs";
import crypto from "node:crypto";

const target = "https://platenpdf.com";
const apiBase = "https://api.platenpdf.com";
const liveEnabled = process.env.PLATEN_LIVE_FREE_AUDIT === "I_ACKNOWLEDGE_PRODUCTION"
    && process.env.E2E_BASE_URL === target;

test.describe("GIM-33 live production guest processing pilot (no mocks)", () => {
    test.skip(!liveEnabled, "Run only with explicit production opt-in and E2E_BASE_URL=https://platenpdf.com");
    test.describe.configure({mode:"serial"});
    test.setTimeout(110_000);

    async function syntheticPdf(tag: string): Promise<Buffer> {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([420, 595]);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawText("PLATEN FREE MODE AUDIT " + tag, {x:35,y:540,size:16,font});
        page.drawText("Synthetic document; no user data", {x:35,y:515,size:12,font});
        return Buffer.from(await pdf.save());
    }

    async function freshGuest(browser: {newContext: (opts: {acceptDownloads: boolean; serviceWorkers:"block"}) => Promise<BrowserContext>}) {
        const context = await browser.newContext({acceptDownloads:true,serviceWorkers:"block"});
        const page = await context.newPage();
        const attemptedCheckouts: string[] = [];
        // The checkout safety tripwire ABORTS, not mocks processing.
        await page.route("**/api/billing/checkout**", route => {
            attemptedCheckouts.push(new URL(route.request().url()).pathname);
            return route.abort();
        });
        return {context,page,attemptedCheckouts};
    }

    async function verifyGuestFreePolicy(page: Page) {
        // Real API request from actual browser origin, carrying its guest cookies.
        const response = await page.evaluate(async api => {
            const res = await fetch(api + "/api/auth/session",{credentials:"include"});
            const json = await res.json();
            return {http:res.status,type:json.type,policy:json.billing_policy};
        }, apiBase);
        expect(response.http).toBe(200);
        expect(response.type).toBe("guest");
        expect(response.policy).toEqual({
            mode: "free",
            processing_unit_limits_enforced: false,
            purchases_enabled: false,
        });
        return response.policy;
    }

    async function downloaded(page: Page): Promise<Buffer> {
        const [download] = await Promise.all([
            page.waitForEvent("download",{timeout:25000}),
            page.getByRole("button",{name:"Download File",exact:true}).click(),
        ]);
        const onDisk = await download.path();
        expect(onDisk).toBeTruthy();
        return fs.readFileSync(onDisk!);
    }

    async function attachEvidence(info: import("@playwright/test").TestInfo, value: Record<string,unknown>) {
        await info.attach("gim33-evidence.json", {
            body: Buffer.from(JSON.stringify(value,null,2)+"\n"),
            contentType:"application/json",
        });
    }

    test("guest Merge PDF: two synthetic pages produce a real two-page download", async ({browser},info) => {
        const {context,page,attemptedCheckouts} = await freshGuest(browser);
        const observedApi: {method:string;route:string;http:number}[]=[];
        page.on("response",r=>{
            if(r.url().startsWith(apiBase+"/api/") && r.request().method()==="POST")
                observedApi.push({method:"POST",route:new URL(r.url()).pathname,http:r.status()});
        });
        try {
            await page.goto(target+"/merge-pdf",{waitUntil:"domcontentloaded"});
            const policy=await verifyGuestFreePolicy(page);
            const a=await syntheticPdf("ALPHA"),b=await syntheticPdf("BETA");
            await page.locator('input[type="file"]').first().setInputFiles([
                {name:"gim33-alpha.pdf",mimeType:"application/pdf",buffer:a},
                {name:"gim33-beta.pdf",mimeType:"application/pdf",buffer:b}
            ]);
            await expect(page).toHaveURL(/\/merge-pdf\/workspace/);
            await page.getByRole("button",{name:/merge 2 pdfs/i}).click();
            await expect(page).toHaveURL(/\/merge-pdf\/download/,{timeout:85000});
            const bytes=await downloaded(page);
            const document=await PDFDocument.load(bytes);
            expect(document.getPageCount()).toBe(2);
            expect(attemptedCheckouts).toEqual([]);
            await attachEvidence(info,{
                case:"guest-merge-pdf",status:"PASS",mode:policy.mode,outputPages:2,
                size:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
                processingApiCalls:observedApi,
                billingCreditDelta:"NOT_OBSERVABLE_FOR_GUEST",
                checkoutAttempts:attemptedCheckouts.length,
                validatedOutput:true
            });
        } finally {await context.close();}
    });

    test("guest PDF to Word: real conversion API returns DOCX with known text",async ({browser},info)=>{
        const {context,page,attemptedCheckouts}=await freshGuest(browser);
        const apiResponses:{method:string;route:string;http:number}[]=[];
        page.on("response",r=>{
            if(r.url().startsWith(apiBase+"/api/") && r.request().method()==="POST")
                apiResponses.push({method:"POST",route:new URL(r.url()).pathname,http:r.status()});
        });
        try {
            await page.goto(target+"/pdf-to-word",{waitUntil:"domcontentloaded"});
            const policy=await verifyGuestFreePolicy(page);
            const pdf=await syntheticPdf("ALPHA");
            await page.locator('input[type="file"]').first().setInputFiles(
                {name:"gim33-alpha.pdf",mimeType:"application/pdf",buffer:pdf});
            await expect(page).toHaveURL(/\/pdf-to-word\/workspace/);
            await page.getByRole("button",{name:/convert pdf to docx/i}).click();
            await expect(page).toHaveURL(/\/pdf-to-word\/download/,{timeout:85000});
            const bytes=await downloaded(page);
            const zip=await JSZip.loadAsync(bytes);
            const docFile=zip.file("word/document.xml");
            expect(docFile).not.toBeNull();
            const xml=await docFile!.async("string");
            expect(xml).toMatch(/PLATEN|Synthetic/);
            expect(apiResponses).toContainEqual({method:"POST",route:"/api/conversion/pdf-to-word",http:200});
            expect(attemptedCheckouts).toEqual([]);
            await attachEvidence(info,{
                case:"guest-pdf-to-word",status:"PASS",mode:policy.mode,
                docxContainsKnownText:true,size:bytes.length,
                sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
                processingApiCalls:apiResponses,
                billingCreditDelta:"NOT_OBSERVABLE_FOR_GUEST",
                checkoutAttempts:attemptedCheckouts.length,
                validatedOutput:true
            });
        } finally {await context.close();}
    });
});
