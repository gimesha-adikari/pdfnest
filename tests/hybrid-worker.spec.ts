import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Real Browser WASM Web Worker Integration Suite', () => {

  test('Execute pdfcpu WASM Web Worker locally in Chromium without backend requests', async ({ page }) => {
    // 1. Monitor network requests to verify 0 backend cloud processing requests
    const backendProcessingRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes(':8080/api/v1') || url.includes('/api/v1/structure')) {
        backendProcessingRequests.push(url);
      }
    });

    // 2. Read sample PDF fixture in Node and convert to Array
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');
    const samplePdfBuffer = fs.readFileSync(fixturePath);
    const samplePdfArray = Array.from(samplePdfBuffer);

    // 3. Navigate to tool page to load page context & WASM assets
    await page.goto('/watermark-pdf');
    await page.waitForLoadState('networkidle');

    // 4. Test real Worker instantiation and WASM watermark processing inside browser window
    const result = await page.evaluate(async (pdfBytesArray) => {
      const createInputBuffer = (): ArrayBuffer => {
        return new Uint8Array(pdfBytesArray).buffer;
      };

      // Helper to execute a watermark request against a real Web Worker in Chromium
      const runWasmWorker = async (
        worker: Worker,
        id: string,
        text: string,
        desc: string
      ): Promise<{ id: string; success: boolean; pdfSize: number; header: string }> => {
        const inputBuffer = createInputBuffer();

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("WASM Worker timed out after 30s")), 30000);

          worker.onmessage = (event) => {
            clearTimeout(timeout);
            const data = event.data;
            if (data.id === id) {
              if (data.type === "success" && data.pdfBytes) {
                const bytes = new Uint8Array(data.pdfBytes);
                const header = new TextDecoder().decode(bytes.slice(0, 5));
                resolve({
                  id: data.id,
                  success: true,
                  pdfSize: bytes.byteLength,
                  header,
                });
              } else {
                reject(new Error(`Worker error [${data.code}]: ${data.message}`));
              }
            }
          };

          worker.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };

          // Post exact message structure expected by pdfcpu.worker.js
          worker.postMessage(
            {
              id,
              type: "watermark-text",
              pdfBytes: inputBuffer,
              text,
              description: desc,
            },
            [inputBuffer]
          );
        });
      };

      // Instantiate real browser Web Worker
      const worker = new Worker('/wasm/pdfcpu.worker.js');

      // Execution 1: First Watermark Execution in Go pdfcpu WASM Worker
      const res1 = await runWasmWorker(
        worker,
        "req-browser-1",
        "CONFIDENTIAL_PLAYWRIGHT",
        "font:Helvetica, pos:c, scale:1.0, rot:-45, op:0.5"
      );

      // Execution 2: Re-use SAME worker instance for Second Watermark Execution
      const res2 = await runWasmWorker(
        worker,
        "req-browser-2",
        "REUSED_PLAYWRIGHT_WORKER",
        "font:Helvetica, pos:br, scale:0.8, rot:0, op:0.8"
      );

      worker.terminate();

      return {
        res1,
        res2,
      };
    }, samplePdfArray);

    // 5. Assertions proving real Chromium Web Worker executed pdfcpu WASM binary
    expect(result.res1.success).toBe(true);
    expect(result.res1.header).toBe('%PDF-');
    expect(result.res1.pdfSize).toBeGreaterThan(1000);

    expect(result.res2.success).toBe(true);
    expect(result.res2.header).toBe('%PDF-');
    expect(result.res2.pdfSize).toBeGreaterThan(1000);

    // 6. Prove 0 Cloud fallback / backend PDF processing requests were made
    expect(backendProcessingRequests).toEqual([]);
  });

  test('Execute Add Page Numbers via pdfcpu WASM Web Worker in Chromium', async ({ page }) => {
    const backendProcessingRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/structure/add-page-numbers') || url.includes('/api/v1/structure')) {
        backendProcessingRequests.push(url);
      }
    });

    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');
    const samplePdfBuffer = fs.readFileSync(fixturePath);
    const samplePdfArray = Array.from(samplePdfBuffer);

    await page.goto('/page-numbers');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async (pdfBytesArray) => {
      const inputBuffer = new Uint8Array(pdfBytesArray).buffer;

      return new Promise<{ id: string; success: boolean; pdfSize: number; header: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("WASM Worker timed out after 30s")), 30000);
        const worker = new Worker('/wasm/pdfcpu.worker.js');

        worker.onmessage = (event) => {
          clearTimeout(timeout);
          const data = event.data;
          worker.terminate();
          if (data.type === "success" && data.pdfBytes) {
            const bytes = new Uint8Array(data.pdfBytes);
            const header = new TextDecoder().decode(bytes.slice(0, 5));
            resolve({
              id: data.id,
              success: true,
              pdfSize: bytes.byteLength,
              header,
            });
          } else {
            reject(new Error(`Worker error [${data.code}]: ${data.message}`));
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeout);
          worker.terminate();
          reject(err);
        };

        worker.postMessage(
          {
            id: "req-pagenum-browser",
            type: "watermark-text",
            pdfBytes: inputBuffer,
            text: "%p",
            description: "font:Helvetica, scale:0.48 abs, pos:bc, rot:0, offset: 0 20",
          },
          [inputBuffer]
        );
      });
    }, samplePdfArray);

    expect(result.success).toBe(true);
    expect(result.header).toBe('%PDF-');
    expect(result.pdfSize).toBeGreaterThan(1000);
    expect(backendProcessingRequests).toEqual([]);
  });

});
