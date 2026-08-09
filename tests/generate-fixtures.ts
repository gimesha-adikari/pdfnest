import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

async function generatePdfFixtures() {
  // 1. Standard 3-Page PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 3; i++) {
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(`PDFNEST_TEST_PAGE_${i}`, {
      x: 50,
      y: 350,
      size: 24,
      font,
      color: rgb(0.1, 0.1, 0.9),
    });
    page.drawText(`This is page ${i} content for automated E2E testing.`, {
      x: 50,
      y: 300,
      size: 14,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const samplePdfPath = path.join(FIXTURES_DIR, 'sample.pdf');
  fs.writeFileSync(samplePdfPath, pdfBytes);
  console.log(`Generated: ${samplePdfPath} (${pdfBytes.length} bytes)`);

  // Second distinct PDF file for multi-file merge testing
  const pdfDoc2 = await PDFDocument.create();
  const font2 = await pdfDoc2.embedFont(StandardFonts.Helvetica);
  const p1 = pdfDoc2.addPage([600, 400]);
  p1.drawText(`PDFNEST_TEST_PAGE_4_MERGE`, { x: 50, y: 350, size: 24, font: font2 });
  const pdfBytes2 = await pdfDoc2.save();
  const samplePdfPath2 = path.join(FIXTURES_DIR, 'sample2.pdf');
  fs.writeFileSync(samplePdfPath2, pdfBytes2);
  console.log(`Generated: ${samplePdfPath2} (${pdfBytes2.length} bytes)`);
}

async function generateDocxFixture() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "PDFNEST_TEST_DOCX_HEADER",
                bold: true,
                size: 32,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun("This is a test Word document for PDFNest conversion."),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const sampleDocxPath = path.join(FIXTURES_DIR, 'sample.docx');
  fs.writeFileSync(sampleDocxPath, buffer);
  console.log(`Generated: ${sampleDocxPath} (${buffer.length} bytes)`);
}

function generateTextFixtures() {
  // Markdown
  const mdContent = `# PDFNEST_TEST_MARKDOWN

Welcome to **PDFNest** Markdown to PDF test document.

- Feature 1: Fast conversion
- Feature 2: High quality typography

\`\`\`javascript
console.log("Hello from Markdown!");
\`\`\`
`;
  const mdPath = path.join(FIXTURES_DIR, 'sample.md');
  fs.writeFileSync(mdPath, mdContent);
  console.log(`Generated: ${mdPath}`);

  // Source Code
  const codeContent = `// PDFNEST_TEST_SOURCE_CODE
function calculateTotal(items: { price: number }[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

const cart = [{ price: 29.99 }, { price: 49.99 }];
console.log("Total:", calculateTotal(cart));
`;
  const codePath = path.join(FIXTURES_DIR, 'sample.py');
  fs.writeFileSync(codePath, codeContent);
  console.log(`Generated: ${codePath}`);
}

function generateImageFixtures() {
  // Simple valid PNG with red rectangle & text signature
  // 1x1 red PNG base64 representation or simple PNG binary
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(base64Png, 'base64');
  const pngPath = path.join(FIXTURES_DIR, 'sample.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`Generated: ${pngPath}`);

  const jpgPath = path.join(FIXTURES_DIR, 'sample.jpg');
  fs.writeFileSync(jpgPath, pngBuffer);
  console.log(`Generated: ${jpgPath}`);
}

import JSZip from 'jszip';

async function generateOfficeFixtures() {
  // Minimal valid XLSX ZIP container
  const xlsxZip = new JSZip();
  xlsxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');
  xlsxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  xlsxZip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>');
  
  const xlsxBuffer = await xlsxZip.generateAsync({ type: 'nodebuffer' });
  const sampleXlsxPath = path.join(FIXTURES_DIR, 'sample.xlsx');
  fs.writeFileSync(sampleXlsxPath, xlsxBuffer);
  console.log(`Generated: ${sampleXlsxPath} (${xlsxBuffer.length} bytes)`);

  // Minimal valid PPTX ZIP container
  const pptxZip = new JSZip();
  pptxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');
  pptxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  pptxZip.file('ppt/presentation.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
  
  const pptxBuffer = await pptxZip.generateAsync({ type: 'nodebuffer' });
  const samplePptxPath = path.join(FIXTURES_DIR, 'sample.pptx');
  fs.writeFileSync(samplePptxPath, pptxBuffer);
  console.log(`Generated: ${samplePptxPath} (${pptxBuffer.length} bytes)`);
}

async function main() {
  console.log('Generating test fixtures...');
  await generatePdfFixtures();
  await generateDocxFixture();
  await generateOfficeFixtures();
  generateTextFixtures();
  generateImageFixtures();
  console.log('Fixtures generation complete!');
}

main().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
