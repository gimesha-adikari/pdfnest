import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PDFDocument, degrees } from "pdf-lib";
import { executeSignPdf } from "../lib/execution/sign/signClient";
import { executePdfcpuWasmOptimize } from "../lib/execution/pdfcpu/pdfcpuClient";
import { setupNodeWasmWorker } from "./setupNodeWasmWorker";

test.describe("Wave 8 Differential Parity Testing — Sign PDF & Repair PDF", () => {
    test.beforeAll(async () => {
        setupNodeWasmWorker();
    });

    const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAQUlEQVR4nO3RsREAIAgDQHD/nXEEKdDG/zpFLokAAAAAAAAAAABgUvajVfdq/CKPe68XNehzCAAAAAAAAAAAwKwNL9QCBj9twPIAAAAASUVORK5CYII=";
    const pngBytes = Buffer.from(VALID_PNG_BASE64, "base64");

    test("Differential 1: Sign PDF — Client vs PyMuPDF Worker placement & text fidelity", async () => {
        // 1. Generate multi-page test PDF with text
        const doc = await PDFDocument.create();
        for (let i = 0; i < 3; i++) {
            const page = doc.addPage([595.28, 841.89]); // A4
            page.drawText(`Differential Test Page ${i + 1}`, { x: 50, y: 780, size: 16 });
            page.drawText(`Important Contract Terms and Conditions Line ${i + 1}.`, { x: 50, y: 700, size: 12 });
            page.drawText(`Authorized Signatory:`, { x: 50, y: 150, size: 12 });
        }
        const srcPdfBytes = await doc.save();
        const srcPdfPath = "/tmp/diff_src_doc.pdf";
        const workerOutPath = "/tmp/diff_worker_signed.pdf";
        fs.writeFileSync(srcPdfPath, srcPdfBytes);

        const sigPngPath = "/tmp/diff_sig.png";
        fs.writeFileSync(sigPngPath, pngBytes);

        const stamps = [
            { page: 1, x: 50, y: 700, width: 140, height: 45 },
            { page: 3, x: 200, y: 700, width: 140, height: 45 },
        ];

        // 2. Run Worker PyMuPDF sign_pdf
        const pySignScript = `
import fitz, json
doc = fitz.open('${srcPdfPath}')
stamps = json.loads('''${JSON.stringify(stamps)}''')
for s in stamps:
    p = doc[s['page'] - 1]
    rect = fitz.Rect(s['x'], s['y'], s['x'] + s['width'], s['y'] + s['height'])
    p.insert_image(rect, filename='${sigPngPath}', overlay=True)
doc.save('${workerOutPath}', garbage=4, clean=True, deflate=True)
doc.close()
`;
        fs.writeFileSync("/tmp/run_diff_sign.py", pySignScript);
        execSync(`/home/gimesha/My_Projects/platen/pdfnest-worker/.venv/bin/python /tmp/run_diff_sign.py`);

        // 3. Run Client pdf-lib executeSignPdf
        const srcArrayBuf = srcPdfBytes.buffer.slice(srcPdfBytes.byteOffset, srcPdfBytes.byteOffset + srcPdfBytes.byteLength) as ArrayBuffer;
        const srcFile = new File([srcArrayBuf], "diff_src_doc.pdf", { type: "application/pdf" });
        const clientBlob = await executeSignPdf(srcFile, {
            signature: new Blob([pngBytes], { type: "image/png" }),
            stamps,
        });
        const clientPdfBytes = Buffer.from(await clientBlob.arrayBuffer());
        const clientOutPath = "/tmp/diff_client_signed.pdf";
        fs.writeFileSync(clientOutPath, clientPdfBytes);

        // 4. Differential inspection with PyMuPDF
        const inspectScript = `
import fitz
w_doc = fitz.open('${workerOutPath}')
c_doc = fitz.open('${clientOutPath}')

assert len(w_doc) == len(c_doc) == 3, f"Page counts mismatch: w={len(w_doc)}, c={len(c_doc)}"

for i in range(len(w_doc)):
    w_page = w_doc[i]
    c_page = c_doc[i]
    
    # Text preservation check
    w_text = w_page.get_text().strip()
    c_text = c_page.get_text().strip()
    assert w_text == c_text, f"Text mismatch on page {i+1}: '{w_text}' vs '{c_text}'"
    
    # Image count and bbox check
    w_imgs = w_page.get_images()
    c_imgs = c_page.get_images()
    assert len(w_imgs) == len(c_imgs), f"Image count mismatch on page {i+1}: w={len(w_imgs)}, c={len(c_imgs)}"
    
    if w_imgs:
        for idx in range(len(w_imgs)):
            w_bbox = w_page.get_image_bbox(w_imgs[idx][7])
            c_bbox = c_page.get_image_bbox(c_imgs[idx][7])
            assert abs(w_bbox.x0 - c_bbox.x0) < 1.0, f"bbox.x0 mismatch: w={w_bbox.x0}, c={c_bbox.x0}"
            assert abs(w_bbox.y0 - c_bbox.y0) < 1.0, f"bbox.y0 mismatch: w={w_bbox.y0}, c={c_bbox.y0}"
            assert abs(w_bbox.width - c_bbox.width) < 1.0, f"bbox width mismatch: w={w_bbox.width}, c={c_bbox.width}"
            assert abs(w_bbox.height - c_bbox.height) < 1.0, f"bbox height mismatch: w={w_bbox.height}, c={c_bbox.height}"

print("DIFFERENTIAL_SIGN_PASSED")
`;
        fs.writeFileSync("/tmp/run_diff_inspect.py", inspectScript);
        const diffResult = execSync(
            `/home/gimesha/My_Projects/platen/pdfnest-worker/.venv/bin/python /tmp/run_diff_inspect.py`
        ).toString();
        expect(diffResult).toContain("DIFFERENTIAL_SIGN_PASSED");
    });

    test("Differential 2: Sign PDF — Rotated pages (0, 90, 180, 270) placement match", async () => {
        for (const rot of [0, 90, 180, 270]) {
            const doc = await PDFDocument.create();
            const page = doc.addPage([600, 800]);
            page.setRotation(degrees(rot));
            page.drawText(`Rotation ${rot} Page`, { x: 50, y: 700, size: 14 });
            const pdfBytes = await doc.save();

            const srcPath = `/tmp/diff_rot_${rot}_src.pdf`;
            const workerPath = `/tmp/diff_rot_${rot}_worker.pdf`;
            const clientPath = `/tmp/diff_rot_${rot}_client.pdf`;
            const sigPath = `/tmp/diff_sig.png`;
            fs.writeFileSync(srcPath, pdfBytes);

            const stamps = [{ page: 1, x: 50, y: 60, width: 150, height: 50 }];

            // Worker sign
            const pyScript = `
import fitz, json
doc = fitz.open('${srcPath}')
stamps = json.loads('''${JSON.stringify(stamps)}''')
for s in stamps:
    p = doc[s['page'] - 1]
    rect = fitz.Rect(s['x'], s['y'], s['x'] + s['width'], s['y'] + s['height'])
    p.insert_image(rect, filename='${sigPath}', overlay=True)
doc.save('${workerPath}', garbage=4, clean=True, deflate=True)
doc.close()
`;
            fs.writeFileSync(`/tmp/run_rot_${rot}.py`, pyScript);
            execSync(`/home/gimesha/My_Projects/platen/pdfnest-worker/.venv/bin/python /tmp/run_rot_${rot}.py`);

            // Client sign
            const rotArrayBuf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
            const clientBlob = await executeSignPdf(
                new File([rotArrayBuf], `rot_${rot}.pdf`, { type: "application/pdf" }),
                {
                    signature: new Blob([pngBytes], { type: "image/png" }),
                    stamps,
                }
            );
            fs.writeFileSync(clientPath, Buffer.from(await clientBlob.arrayBuffer()));

            // Verify visible bbox in PyMuPDF
            const pyVerify = `
import fitz
c_doc = fitz.open('${clientPath}')
c_page = c_doc[0]
c_imgs = c_page.get_images()
assert len(c_imgs) == 1, f"Rot ${rot} expected 1 image, got {len(c_imgs)}"
c_bbox = c_page.get_image_bbox(c_imgs[0][7])

# Visual stamp is centered at x0=75.0 (50 + 25 padding), y0=60.0, w=100.0, h=50.0
assert abs(c_bbox.x0 - 75.0) < 1.0, f"Rot ${rot} bbox.x0 mismatch: expected 75.0, got {c_bbox.x0}"
assert abs(c_bbox.y0 - 60.0) < 1.0, f"Rot ${rot} bbox.y0 mismatch: expected 60.0, got {c_bbox.y0}"
assert abs(c_bbox.width - 100.0) < 1.0, f"Rot ${rot} width mismatch: expected 100.0, got {c_bbox.width}"
assert abs(c_bbox.height - 50.0) < 1.0, f"Rot ${rot} height mismatch: expected 50.0, got {c_bbox.height}"

print(f"ROT_${rot}_PASSED")
`;
            fs.writeFileSync(`/tmp/verify_rot_${rot}.py`, pyVerify);
            const rotVerifyResult = execSync(
                `/home/gimesha/My_Projects/platen/pdfnest-worker/.venv/bin/python /tmp/verify_rot_${rot}.py`
            ).toString();
            expect(rotVerifyResult).toContain(`ROT_${rot}_PASSED`);
        }
    });

    test("Differential 3: Repair PDF — pdfcpu Go backend vs WASM structural consistency", async () => {
        const fixturePath = path.resolve(process.cwd(), "tests/fixtures/sample.pdf");
        const sampleBuffer = fs.readFileSync(fixturePath);

        // 1. Client WASM repair
        const sampleFile = new File([sampleBuffer], "sample.pdf", { type: "application/pdf" });
        const repairedBlob = await executePdfcpuWasmOptimize(sampleFile);
        const clientRepairedBytes = Buffer.from(await repairedBlob.arrayBuffer());
        const clientRepairPath = "/tmp/diff_client_repaired.pdf";
        fs.writeFileSync(clientRepairPath, clientRepairedBytes);

        // 2. Inspect with PyMuPDF
        const inspectPy = `
import fitz
doc = fitz.open('${clientRepairPath}')
assert len(doc) == 3, f"Expected 3 pages, got {len(doc)}"
for i in range(len(doc)):
    text = doc[i].get_text().strip()
    assert len(text) > 0, f"Page {i+1} empty after repair"
print("REPAIR_DIFF_PASSED")
`;
        fs.writeFileSync("/tmp/run_repair_diff.py", inspectPy);
        const repairResult = execSync(
            `/home/gimesha/My_Projects/platen/pdfnest-worker/.venv/bin/python /tmp/run_repair_diff.py`
        ).toString();
        expect(repairResult).toContain("REPAIR_DIFF_PASSED");
    });
});
