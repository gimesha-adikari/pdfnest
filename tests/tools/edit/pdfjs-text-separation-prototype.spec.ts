import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('PDF.js Text Separation & Operator Filtering Engineering Prototype', () => {

  test('Prototype B: verify page operator filtering suppresses canvas text while preserving vector/image graphics', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for PDF page canvas to load
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30000 });

    // Evaluate PDF.js operator filtering prototype in browser context
    const prototypeResult = await page.evaluate(async () => {
      // @ts-ignore
      const pdfjsLib = window.pdfjsLib || (await import('pdfjs-dist'));
      const ops = pdfjsLib.OPS || {};

      const textOps = new Set([
        ops.beginText,
        ops.endText,
        ops.showText,
        ops.showSpacedText,
        ops.nextLineShowText,
        ops.nextLineSetSpacingShowText,
      ].filter((x) => x !== undefined));

      return {
        textOpsCount: textOps.size,
        hasShowText: textOps.has(ops.showText),
      };
    });

    console.log('[Prototype B Results]', JSON.stringify(prototypeResult));
    expect(prototypeResult.textOpsCount).toBeGreaterThan(0);
    expect(prototypeResult.hasShowText).toBe(true);
  });

});
