import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

async function main() {
    const outDir = path.resolve(__dirname, "../tests/fixtures");

    // 1. normal_text.pdf (3 pages)
    {
        const doc = await PDFDocument.create();
        for (let i = 1; i <= 3; i++) {
            const page = doc.addPage([595, 842]);
            page.drawText(`Sample Text Document - Page ${i}`, { x: 50, y: 780, size: 20, color: rgb(0.1, 0.1, 0.1) });
            page.drawText(`This is paragraph content on page ${i} used for verifying text highlight, underline, and strikeout previews.`, { x: 50, y: 720, size: 12, color: rgb(0.2, 0.2, 0.2) });
        }
        fs.writeFileSync(path.join(outDir, "normal_text.pdf"), await doc.save());
    }

    // 2. scanned_page.pdf (simulating pure image/scanned content)
    {
        const doc = await PDFDocument.create();
        const page = doc.addPage([600, 800]);
        // 1x1 transparent/colored PNG
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64"
        );
        const image = await doc.embedPng(pngBytes);
        page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
        fs.writeFileSync(path.join(outDir, "scanned_page.pdf"), await doc.save());
    }

    // 3. mixed_doc.pdf (Page 1 text, Page 2 image/scanned, Page 3 text)
    {
        const doc = await PDFDocument.create();
        const page1 = doc.addPage([595, 842]);
        page1.drawText("Page 1: Digital Text Content", { x: 50, y: 750, size: 18, color: rgb(0, 0, 0) });

        const page2 = doc.addPage([600, 800]);
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64"
        );
        const image = await doc.embedPng(pngBytes);
        page2.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });

        const page3 = doc.addPage([595, 842]);
        page3.drawText("Page 3: Another Digital Text Page", { x: 50, y: 750, size: 18, color: rgb(0, 0, 0) });

        fs.writeFileSync(path.join(outDir, "mixed_doc.pdf"), await doc.save());
    }

    // 4. large_multipage.pdf (15 pages)
    {
        const doc = await PDFDocument.create();
        for (let i = 1; i <= 15; i++) {
            const page = doc.addPage([500, 700]);
            page.drawText(`Multi-page Sheet #${i}`, { x: 40, y: 650, size: 16, color: rgb(0.2, 0.2, 0.8) });
        }
        fs.writeFileSync(path.join(outDir, "large_multipage.pdf"), await doc.save());
    }

    console.log("Fixtures generated successfully.");
}

main();
