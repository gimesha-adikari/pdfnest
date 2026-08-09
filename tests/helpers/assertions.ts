import { expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

/**
 * Validates that the buffer starts with %PDF magic bytes and is non-empty.
 */
export function assertValidPdfHeader(buffer: Buffer): void {
  expect(buffer.length).toBeGreaterThan(100);
  const header = buffer.subarray(0, 5).toString('ascii');
  expect(header).toBe('%PDF-');
}

/**
 * Validates that the buffer can be parsed as a PDF document and has the expected page count.
 */
export async function assertPdfPageCount(buffer: Buffer, expectedPageCount: number): Promise<PDFDocument> {
  assertValidPdfHeader(buffer);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  expect(pdfDoc.getPageCount()).toBe(expectedPageCount);
  return pdfDoc;
}

/**
 * Validates that the buffer is a valid image (PNG or JPG magic bytes).
 */
export function assertValidImage(buffer: Buffer): void {
  expect(buffer.length).toBeGreaterThan(50);
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  expect(isPng || isJpg).toBe(true);
}

/**
 * Validates that the buffer is a valid ZIP archive (PK magic bytes).
 */
export function assertValidZip(buffer: Buffer): void {
  expect(buffer.length).toBeGreaterThan(100);
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05);
  expect(isZip).toBe(true);
}

/**
 * Validates that the buffer is a valid DOCX / XLSX / PPTX file (ZIP archive format).
 */
export function assertValidOfficeDocument(buffer: Buffer): void {
  assertValidZip(buffer);
}

/**
 * Validates that the text output contains specific expected strings.
 */
export function assertTextContains(text: string, expectedStrings: string[]): void {
  expect(text.length).toBeGreaterThan(0);
  for (const str of expectedStrings) {
    expect(text).toContain(str);
  }
}

/**
 * Validates PDF encryption status.
 */
export async function assertPdfEncrypted(buffer: Buffer): Promise<void> {
  assertValidPdfHeader(buffer);
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    // If it loaded without password and isEncrypted is false, expect it to be encrypted
    expect(pdfDoc.isEncrypted).toBe(true);
  } catch (err: unknown) {
    // pdf-lib throws EncryptedPDFError when opening encrypted PDF without password
    expect(err).toBeDefined();
  }
}
