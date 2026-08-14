import { PDFDocument, PDFName, PDFStream, PDFRawStream } from "pdf-lib";
import { unzlibSync } from "fflate";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";

async function createSecretTestPdf(): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    
    // Page 1
    const p1 = pdfDoc.addPage([600, 400]);
    p1.drawText("PAGE1_PUBLIC_DATA");
    
    // Page 2 - Secret
    const p2 = pdfDoc.addPage([600, 400]);
    p2.drawText("SECRET_KEY_PAGE2_CONFIDENTIAL");
    
    // Page 3 - Secret
    const p3 = pdfDoc.addPage([600, 400]);
    p3.drawText("SECRET_TOKEN_PAGE3_RESTRICTED");

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], "secrets.pdf", { type: "application/pdf" });
}

async function extractAllDocumentText(pdfBytes: Uint8Array): Promise<string> {
    let accumulatedText = Buffer.from(pdfBytes).toString("binary");

    try {
        const doc = await PDFDocument.load(pdfBytes);
        // @ts-ignore
        const enumObjs = doc.context.enumerateIndirectObjects();
        for (const [ref, obj] of enumObjs) {
            if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
                try {
                    const contents = (obj as any).getUnencodedContents();
                    if (contents) {
                        accumulatedText += "\n" + Buffer.from(contents).toString("binary");
                    }
                } catch {
                    try {
                        const rawContents = (obj as any).contents;
                        if (rawContents instanceof Uint8Array) {
                            const decompressed = unzlibSync(rawContents);
                            accumulatedText += "\n" + Buffer.from(decompressed).toString("binary");
                        }
                    } catch {}
                }
            }
        }
    } catch {}

    return accumulatedText;
}

async function createComplexCatalogPdf(structureKey: "AcroForm" | "Outlines" | "Names" | "PageLabels" | "Dests" | "StructTreeRoot" | "OCProperties"): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 400]);
    pdfDoc.addPage([600, 400]);

    // Attach specified catalog key
    const dummyDict = pdfDoc.context.obj({});
    pdfDoc.catalog.set(PDFName.of(structureKey), dummyDict);

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], `complex_${structureKey}.pdf`, { type: "application/pdf" });
}

export async function runB3H1IntegrityTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    function assert(condition: boolean, testName: string, detail?: string) {
        if (condition) {
            passed++;
            console.log(`✓ [PASS] ${testName}`);
        } else {
            failed++;
            const msg = `✗ [FAIL] ${testName}${detail ? `: ${detail}` : ""}`;
            console.error(msg);
            errors.push(msg);
        }
    }

    console.log("=================================================");
    console.log("  RUNNING B3 / H1 INTEGRITY & REGRESSION TESTS   ");
    console.log("=================================================\n");

    const secretFile = await createSecretTestPdf();

    // 1. B3 - Split Page 1: Verify secret text from page 2 and page 3 is 100% absent from binary
    const splitBlob = await ClientExecutor.execute({
        tool: "split",
        files: [secretFile],
        params: { pages: "1" },
        mode: "device",
    });
    const splitBytes = new Uint8Array(await splitBlob.arrayBuffer());
    const splitText = await extractAllDocumentText(splitBytes);

    const hexP1 = Buffer.from("PAGE1_PUBLIC_DATA").toString("hex");
    const hexP2 = Buffer.from("SECRET_KEY_PAGE2_CONFIDENTIAL").toString("hex");
    const hexP3 = Buffer.from("SECRET_TOKEN_PAGE3_RESTRICTED").toString("hex");

    const hasP1Text = splitText.includes("PAGE1_PUBLIC_DATA") || splitText.toLowerCase().includes(hexP1.toLowerCase());
    const hasP2Text = splitText.includes("SECRET_KEY_PAGE2_CONFIDENTIAL") || splitText.toLowerCase().includes(hexP2.toLowerCase());
    const hasP3Text = splitText.includes("SECRET_TOKEN_PAGE3_RESTRICTED") || splitText.toLowerCase().includes(hexP3.toLowerCase());

    assert(
        hasP1Text && !hasP2Text && !hasP3Text,
        "B3.1 Split page 1 output bytes contain 0% of removed page content streams"
    );

    // 2. B3 - Delete Pages 2 & 3: Verify secret text is absent from binary
    const deleteBlob = await ClientExecutor.execute({
        tool: "delete",
        files: [secretFile],
        params: { pages: "2,3" },
        mode: "device",
    });
    const deleteBytes = new Uint8Array(await deleteBlob.arrayBuffer());
    const deleteText = await extractAllDocumentText(deleteBytes);

    const delP1Text = deleteText.includes("PAGE1_PUBLIC_DATA") || deleteText.toLowerCase().includes(hexP1.toLowerCase());
    const delP2Text = deleteText.includes("SECRET_KEY_PAGE2_CONFIDENTIAL") || deleteText.toLowerCase().includes(hexP2.toLowerCase());
    const delP3Text = deleteText.includes("SECRET_TOKEN_PAGE3_RESTRICTED") || deleteText.toLowerCase().includes(hexP3.toLowerCase());

    assert(
        delP1Text && !delP2Text && !delP3Text,
        "B3.2 Delete pages 2,3 output bytes contain 0% of removed page content streams"
    );

    // 3. Complex Catalog Routing Verification (AcroForm, Outlines, Names, PageLabels, Dests)
    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        return new Blob([await secretFile.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const structures = ["AcroForm", "Outlines", "Names", "PageLabels", "Dests", "StructTreeRoot", "OCProperties"] as const;
        for (const structKey of structures) {
            const complexFile = await createComplexCatalogPdf(structKey);
            
            cloudCallCount = 0;
            const resSplit = await ExecutionManager.run({
                tool: "split",
                files: [complexFile],
                params: { pages: "1" },
                mode: "auto",
            });

            assert(
                resSplit.executionMode === "cloud" && cloudCallCount === 1,
                `B3/H1 Complex Catalog Guard: PDF with ${structKey} routes Split to Cloud for full pdfcpu processing`
            );

            cloudCallCount = 0;
            const resReorder = await ExecutionManager.run({
                tool: "reorder",
                files: [complexFile],
                params: { sequence: [2, 1] },
                mode: "auto",
            });

            assert(
                resReorder.executionMode === "cloud" && cloudCallCount === 1,
                `B3/H1 Complex Catalog Guard: PDF with ${structKey} routes Reorder to Cloud for full pdfcpu processing`
            );
        }
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    return { passed, failed, errors };
}

if (require.main === module) {
    runB3H1IntegrityTests().then(({ passed, failed, errors }) => {
        console.log(`\nB3/H1 Integrity Test Results: ${passed} passed, ${failed} failed.`);
        if (failed > 0) {
            console.error("Failures:\n" + errors.join("\n"));
            process.exit(1);
        }
    });
}
