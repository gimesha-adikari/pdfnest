/** Synthetic classic PDF with an ambiguous trailer Root. PDF.js rejects it;
 * pdfcpu's relaxed structural rewrite retains the valid Root and recovers it.
 * No binary fixture or external generator is needed at test runtime. */
export function repairablePdf(): Uint8Array<ArrayBuffer> {
    const content = "BT /F1 14 Tf 40 100 Td (F01_REPAIRED_CONTENT) Tj ET\n";
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        `<< /Length ${content.length} >>\nstream\n${content}endstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let text = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(text.length);
        text += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = text.length;
    text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    text += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R /Root null >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(text);
}
