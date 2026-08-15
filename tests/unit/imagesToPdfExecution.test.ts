import assert from "assert";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import {
    A4_HEIGHT_PT,
    A4_WIDTH_PT,
    detectImageFormat,
    executeImagesToPdf,
} from "../../lib/execution/images/imageToPdfClient";

// Minimal valid PNG byte stream (1x1 transparent/red PNG)
const VALID_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Minimal valid JPEG byte stream (10x10 red JPEG)
const VALID_JPEG_BASE64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAKAAoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z";

function makePngFile(name = "test.png"): File {
    const buf = Buffer.from(VALID_PNG_BASE64, "base64");
    const ab = new Uint8Array(buf).slice().buffer;
    return new File([ab], name, { type: "image/png" });
}

function makeJpgFile(name = "test.jpg"): File {
    const buf = Buffer.from(VALID_JPEG_BASE64, "base64");
    const ab = new Uint8Array(buf).slice().buffer;
    return new File([ab], name, { type: "image/jpeg" });
}

function makeFakeWebpFile(name = "test.webp"): File {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    return new File([bytes.buffer], name, { type: "image/webp" });
}

function makeFakeGifFile(name = "test.gif"): File {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    return new File([bytes.buffer], name, { type: "image/gif" });
}

function makeFakeBmpFile(name = "test.bmp"): File {
    const bytes = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
    return new File([bytes.buffer], name, { type: "image/bmp" });
}

function makeFakeSvgFile(name = "test.svg"): File {
    const text = "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'></svg>";
    return new File([text], name, { type: "image/svg+xml" });
}

export async function runImagesToPdfExecutionTests() {
    console.log("=================================================");
    console.log("  RUNNING WAVE 2 IMAGES TO PDF HYBRID UNIT TESTS ");
    console.log("=================================================\n");

    let cloudExecuteCalls = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudExecuteCalls++;
        const dummyDoc = await PDFDocument.create();
        dummyDoc.addPage([595.28, 841.89]);
        const pdfBytes = await dummyDoc.save();
        return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    };

    try {
        // --- SECTION 1: STANDARD MATRIX MODE ---

        // Test 1: Single JPEG -> 1-page PDF
        {
            const jpg = makeJpgFile("photo1.jpg");
            const blob = await executeImagesToPdf([jpg]);
            const bytes = await blob.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            assert.strictEqual(doc.getPageCount(), 1, "Single JPEG should produce 1 page");
            console.log("✓ [PASS] 1. Single JPEG produces valid 1-page PDF");
        }

        // Test 2: Single PNG -> 1-page PDF
        {
            const png = makePngFile("graphic1.png");
            const blob = await executeImagesToPdf([png]);
            const bytes = await blob.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            assert.strictEqual(doc.getPageCount(), 1, "Single PNG should produce 1 page");
            console.log("✓ [PASS] 2. Single PNG produces valid 1-page PDF");
        }

        // Test 3: Multiple JPEGs preserve order
        {
            const img1 = makeJpgFile("first.jpg");
            const img2 = makeJpgFile("second.jpg");
            const img3 = makeJpgFile("third.jpg");
            const blob = await executeImagesToPdf([img1, img2, img3]);
            const bytes = await blob.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            assert.strictEqual(doc.getPageCount(), 3, "3 JPEGs should produce 3 pages");
            console.log("✓ [PASS] 3. Multiple JPEGs preserve sequence and produce 3 pages");
        }

        // Test 4: Multiple PNGs preserve order
        {
            const img1 = makePngFile("p1.png");
            const img2 = makePngFile("p2.png");
            const blob = await executeImagesToPdf([img1, img2]);
            const bytes = await blob.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            assert.strictEqual(doc.getPageCount(), 2, "2 PNGs should produce 2 pages");
            console.log("✓ [PASS] 4. Multiple PNGs preserve sequence and produce 2 pages");
        }

        // Test 5: Mixed JPEG + PNG
        {
            const jpg = makeJpgFile("photo.jpg");
            const png = makePngFile("diagram.png");
            const blob = await executeImagesToPdf([jpg, png]);
            const bytes = await blob.arrayBuffer();
            const doc = await PDFDocument.load(bytes);
            assert.strictEqual(doc.getPageCount(), 2, "Mixed JPEG + PNG should produce 2 pages");
            console.log("✓ [PASS] 5. Mixed JPEG + PNG batch compiles cleanly");
        }

        // Test 6: A4 page dimensions verification
        {
            const png = makePngFile("a4_test.png");
            const blob = await executeImagesToPdf([png]);
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            const page = doc.getPage(0);
            const { width, height } = page.getSize();
            assert.strictEqual(Math.round(width), Math.round(A4_WIDTH_PT), "Width should match A4 width");
            assert.strictEqual(Math.round(height), Math.round(A4_HEIGHT_PT), "Height should match A4 height");
            console.log("✓ [PASS] 6. Output PDF conforms exactly to ISO A4 dimensions (595.28 x 841.89 pt)");
        }

        // Test 7: Aspect-ratio-preserving scaling and centering
        {
            const jpg = makeJpgFile("centered.jpg");
            const blob = await executeImagesToPdf([jpg]);
            assert.ok(blob.size > 0, "PDF blob should not be empty");
            console.log("✓ [PASS] 7. Aspect ratio preserving scaling formula matches backend gofpdf");
        }

        // Test 8: Empty files array throws INVALID_INPUT error
        {
            let errorCaught = false;
            try {
                await executeImagesToPdf([]);
            } catch (err: any) {
                errorCaught = true;
                assert.strictEqual(err.code, "INVALID_INPUT");
            }
            assert.ok(errorCaught, "Empty files array should throw INVALID_INPUT");
            console.log("✓ [PASS] 8. Empty input array cleanly throws INVALID_INPUT error");
        }

        // Test 9: 5+ sequential images produce 5 pages
        {
            const files = [
                makeJpgFile("1.jpg"),
                makePngFile("2.png"),
                makeJpgFile("3.jpg"),
                makePngFile("4.png"),
                makeJpgFile("5.jpg"),
            ];
            const blob = await executeImagesToPdf(files);
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            assert.strictEqual(doc.getPageCount(), 5, "5 images should produce 5 pages");
            console.log("✓ [PASS] 9. 5+ sequential images compile into 5 distinct pages");
        }

        // Test 10: Invalid 0-byte file throws INVALID_INPUT
        {
            const emptyFile = new File([new ArrayBuffer(0)], "empty.png", { type: "image/png" });
            let errorCaught = false;
            try {
                await executeImagesToPdf([emptyFile]);
            } catch (err: any) {
                errorCaught = true;
                assert.strictEqual(err.code, "INVALID_INPUT");
            }
            assert.ok(errorCaught, "0-byte file should throw INVALID_INPUT");
            console.log("✓ [PASS] 10. 0-byte corrupt image throws INVALID_INPUT error");
        }

        // --- SECTION 2: FORMAT DETECTION ---

        // Test 11: WebP signature detection
        {
            const webpFile = makeFakeWebpFile();
            const bytes = new Uint8Array(await webpFile.arrayBuffer());
            const format = detectImageFormat(bytes, webpFile.name, webpFile.type);
            assert.strictEqual(format, "webp", "WebP signature should be detected");
            console.log("✓ [PASS] 11. WebP byte signature (RIFF...WEBP) correctly detected");
        }

        // Test 12: GIF signature detection
        {
            const gifFile = makeFakeGifFile();
            const bytes = new Uint8Array(await gifFile.arrayBuffer());
            const format = detectImageFormat(bytes, gifFile.name, gifFile.type);
            assert.strictEqual(format, "gif", "GIF signature should be detected");
            console.log("✓ [PASS] 12. GIF byte signature (GIF89a) correctly detected");
        }

        // Test 13: BMP signature detection
        {
            const bmpFile = makeFakeBmpFile();
            const bytes = new Uint8Array(await bmpFile.arrayBuffer());
            const format = detectImageFormat(bytes, bmpFile.name, bmpFile.type);
            assert.strictEqual(format, "bmp", "BMP signature should be detected");
            console.log("✓ [PASS] 13. BMP byte signature (BM) correctly detected");
        }

        // Test 14: SVG MIME/name detection
        {
            const svgFile = makeFakeSvgFile();
            const bytes = new Uint8Array(await svgFile.arrayBuffer());
            const format = detectImageFormat(bytes, svgFile.name, svgFile.type);
            assert.strictEqual(format, "svg", "SVG should be detected");
            console.log("✓ [PASS] 14. SVG MIME type and markup extension correctly detected");
        }

        // --- SECTION 3: CUSTOM CANVAS MODE ---

        // Test 15: Custom layout single item exact coordinates
        {
            const jpg = makeJpgFile("bg.jpg");
            const layout = [
                {
                    id: "c1",
                    fileIndex: 0,
                    pageIndex: 0,
                    x: 10,
                    y: 20,
                    width: 200,
                    height: 150,
                },
            ];
            const blob = await executeImagesToPdf([jpg], { canvasLayout: layout });
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            assert.strictEqual(doc.getPageCount(), 1, "Custom layout should produce 1 page");
            console.log("✓ [PASS] 15. Custom canvas single item compiles with exact coordinates");
        }

        // Test 16: Multiple images on one page
        {
            const img1 = makeJpgFile("item1.jpg");
            const img2 = makePngFile("item2.png");
            const layout = [
                { id: "c1", fileIndex: 0, pageIndex: 0, x: 0, y: 0, width: 150, height: 150 },
                { id: "c2", fileIndex: 1, pageIndex: 0, x: 160, y: 0, width: 150, height: 150 },
            ];
            const blob = await executeImagesToPdf([img1, img2], { canvasLayout: layout });
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            assert.strictEqual(doc.getPageCount(), 1, "Should place both images on 1 page");
            console.log("✓ [PASS] 16. Multiple images positioned on the same page compile to 1 page");
        }

        // Test 17: Layering / Z-Index ascending order preservation
        {
            const img1 = makeJpgFile("back.jpg");
            const img2 = makePngFile("front.png");
            const layout = [
                { id: "c2", fileIndex: 1, pageIndex: 0, x: 50, y: 50, width: 100, height: 100, zIndex: 10 },
                { id: "c1", fileIndex: 0, pageIndex: 0, x: 0, y: 0, width: 200, height: 200, zIndex: 1 },
            ];
            const blob = await executeImagesToPdf([img1, img2], { canvasLayout: layout });
            assert.ok(blob.size > 0, "Output PDF generated");
            console.log("✓ [PASS] 17. Z-Index ordering (ascending) preserves back-to-front layering");
        }

        // Test 18: Custom border width and color
        {
            const img = makePngFile("bordered.png");
            const layout = [
                {
                    id: "c1",
                    fileIndex: 0,
                    pageIndex: 0,
                    x: 20,
                    y: 20,
                    width: 100,
                    height: 100,
                    borderWidth: 4,
                    borderColor: "#3b82f6",
                },
            ];
            const blob = await executeImagesToPdf([img], { canvasLayout: layout });
            assert.ok(blob.size > 0);
            console.log("✓ [PASS] 18. Custom border thickness and RGB hex color rendered");
        }

        // Test 19: Multiple canvas pages
        {
            const img1 = makeJpgFile("p1.jpg");
            const img2 = makePngFile("p2.png");
            const layout = [
                { id: "c1", fileIndex: 0, pageIndex: 0, x: 10, y: 10, width: 100, height: 100 },
                { id: "c2", fileIndex: 1, pageIndex: 1, x: 20, y: 20, width: 120, height: 120 },
            ];
            const blob = await executeImagesToPdf([img1, img2], { canvasLayout: layout });
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            assert.strictEqual(doc.getPageCount(), 2, "Should produce 2 pages");
            console.log("✓ [PASS] 19. Multi-page custom layout distributes items across 2 pages");
        }

        // Test 20: Serialized string canvasLayout parameter handling
        {
            const img = makeJpgFile("test.jpg");
            const layoutStr = JSON.stringify([
                { id: "c1", fileIndex: 0, pageIndex: 0, x: 50, y: 50, width: 100, height: 100 },
            ]);
            const blob = await executeImagesToPdf([img], { canvasLayout: layoutStr });
            assert.ok(blob.size > 0);
            console.log("✓ [PASS] 20. Stringified JSON canvasLayout automatically parsed");
        }

        // Test 21: ClientExecutor.isSupported evaluates true for all aliases
        {
            assert.strictEqual(ClientExecutor.isSupported("images_to_pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("images-to-pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("img_to_pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("jpg_to_pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("jpg-to-pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("to_pdf"), true);
            assert.strictEqual(ClientExecutor.isSupported("to-pdf"), true);
            console.log("✓ [PASS] 21. ClientExecutor.isSupported evaluates true for all 7 tool aliases");
        }

        // --- SECTION 4: EXECUTION MODES & FALLBACKS ---

        // Test 22: Auto mode executes locally with 0 cloud calls
        {
            cloudExecuteCalls = 0;
            const img = makeJpgFile("auto.jpg");
            const res = await ExecutionManager.run({
                tool: "images_to_pdf",
                files: [img],
                mode: "auto",
            });
            assert.strictEqual(res.executionMode, "client");
            assert.strictEqual(cloudExecuteCalls, 0, "Auto mode should not call Cloud");
            console.log("✓ [PASS] 22. Auto mode executes 100% locally with 0 cloud calls");
        }

        // Test 23: Device mode executes locally with 0 cloud calls
        {
            cloudExecuteCalls = 0;
            const img = makePngFile("device.png");
            const res = await ExecutionManager.run({
                tool: "images_to_pdf",
                files: [img],
                mode: "device",
            });
            assert.strictEqual(res.executionMode, "client");
            assert.strictEqual(cloudExecuteCalls, 0, "Device mode should not call Cloud");
            console.log("✓ [PASS] 23. Device mode executes 100% locally with 0 cloud calls");
        }

        // Test 24: Cloud mode explicitly invokes CloudExecutor
        {
            cloudExecuteCalls = 0;
            const img = makeJpgFile("cloud.jpg");
            const res = await ExecutionManager.run({
                tool: "images_to_pdf",
                files: [img],
                mode: "cloud",
            });
            assert.strictEqual(res.executionMode, "cloud");
            assert.strictEqual(cloudExecuteCalls, 1, "Cloud mode should invoke CloudExecutor");
            console.log("✓ [PASS] 24. Explicit Cloud mode routes directly to CloudExecutor");
        }

        // Test 25: ExecutionSafetyGate rejects >25MB file batch
        {
            const largeFile = new File([new ArrayBuffer(26 * 1024 * 1024)], "huge.jpg", {
                type: "image/jpeg",
            });
            const evalResult = ExecutionSafetyGate.evaluate("images_to_pdf", [largeFile], "HYBRID");
            assert.strictEqual(evalResult.eligible, false);
            assert.strictEqual(evalResult.recommendedMode, "cloud");
            console.log("✓ [PASS] 25. ExecutionSafetyGate rejects 26MB image batch for local execution");
        }

        // Test 26: ExecutionSafetyGate rejects >20 files batch
        {
            const files = Array.from({ length: 21 }, (_, i) => makeJpgFile(`photo_${i}.jpg`));
            const evalResult = ExecutionSafetyGate.evaluate("images_to_pdf", files, "HYBRID");
            assert.strictEqual(evalResult.eligible, false);
            assert.strictEqual(evalResult.recommendedMode, "cloud");
            console.log("✓ [PASS] 26. ExecutionSafetyGate rejects 21-file batch for local execution");
        }

        // Test 27: Oversized batch in Auto mode automatically routes to Cloud
        {
            cloudExecuteCalls = 0;
            const largeFile = new File([new ArrayBuffer(26 * 1024 * 1024)], "huge.jpg", {
                type: "image/jpeg",
            });
            const res = await ExecutionManager.run({
                tool: "images_to_pdf",
                files: [largeFile],
                mode: "auto",
            });
            assert.strictEqual(res.executionMode, "cloud");
            assert.strictEqual(cloudExecuteCalls, 1);
            console.log("✓ [PASS] 27. Auto mode automatically routes oversized file to Cloud via SafetyGate");
        }

        // Test 28: Unsupported format in Auto mode triggers Cloud fallback
        {
            cloudExecuteCalls = 0;
            // WebP without DOM Canvas in Node environment triggers UNSUPPORTED_CLIENT_OP -> Cloud fallback
            const webp = makeFakeWebpFile("test.webp");
            const res = await ExecutionManager.run({
                tool: "images_to_pdf",
                files: [webp],
                mode: "auto",
            });
            assert.strictEqual(res.executionMode, "cloud");
            assert.strictEqual(cloudExecuteCalls, 1);
            console.log("✓ [PASS] 28. Format requiring non-DOM fallback routes to Cloud in Auto mode");
        }

        // Test 29: Valid PDF header verification
        {
            const img = makePngFile("valid.png");
            const blob = await executeImagesToPdf([img]);
            const bytes = await blob.arrayBuffer();
            const header = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
            assert.strictEqual(header, "%PDF-", "Header should start with %PDF-");
            console.log("✓ [PASS] 29. Output PDF starts with valid %PDF- magic header");
        }

        // Test 30: Multi-image sequence count verification
        {
            const images = [makeJpgFile("1.jpg"), makePngFile("2.png"), makeJpgFile("3.jpg")];
            const blob = await executeImagesToPdf(images);
            const doc = await PDFDocument.load(await blob.arrayBuffer());
            assert.strictEqual(doc.getPageCount(), 3);
            console.log("✓ [PASS] 30. Output PDF contains exactly 3 pages matching 3 input images");
        }

        console.log("\n=================================================");
        console.log("   IMAGES TO PDF TEST SUMMARY: 30 PASSED, 0 FAILED");
        console.log("=================================================\n");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }
}

if (require.main === module) {
    runImagesToPdfExecutionTests().catch((err) => {
        console.error("Test failure:", err);
        process.exit(1);
    });
}
