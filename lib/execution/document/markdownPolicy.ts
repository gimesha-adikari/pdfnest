import { marked, type Token, type TokensList } from "marked";
import { PDFDocument } from "pdf-lib";
import { decode as decodeJPEG } from "jpeg-js";
import { ExecutionError } from "../types";

// Match the backend's admitted resource budgets. The generic execution safety
// gate is a venue decision and must never authorize Markdown image resources.
const MAX_SOURCE = 2 << 20, MAX_ENCODED = 1 << 20, MAX_DECODED = 768 << 10;
const MAX_IMAGES = 32, MAX_AXIS = 4096, MAX_PIXELS = 4_000_000, MAX_TOTAL_PIXELS = 16_000_000;
export interface MarkdownImage { format: "png" | "jpeg"; bytes: Uint8Array<ArrayBuffer>; width: number; height: number }
export interface PreparedMarkdown { source: string; tokens: TokensList; images: ReadonlyMap<string, MarkdownImage> }
// File bytes are immutable. Cache only successful preparation, never in-flight
// or failed/aborted work; a later generation still checks its own AbortSignal.
const preparedFiles = new WeakMap<File, PreparedMarkdown>();
export function checkMarkdownCancellation(signal?: AbortSignal): void {
    if (signal?.aborted) throw new ExecutionError("USER_CANCELLATION", "Markdown conversion canceled.");
}
function forbidden(): never {
    throw new ExecutionError("MARKDOWN_RESOURCE_FORBIDDEN", "Markdown image resources must be validated embedded PNG or JPEG data.");
}
function dimensions(width: number, height: number, remainingPixels = MAX_PIXELS): void {
    if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS || width * height > remainingPixels) forbidden();
}
function u32(bytes: Uint8Array, offset: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc(bytes: Uint8Array): number {
    let result = 0xffffffff;
    for (const byte of bytes) result = crcTable[(result ^ byte) & 255] ^ (result >>> 8);
    return (result ^ 0xffffffff) >>> 0;
}

// Check the PNG envelope and bounded compressed scanlines before pdf-lib's full
// raster decoder. Discard metadata; do not pass APNG frames to a second decoder.
async function pngBytes(raw: Uint8Array<ArrayBuffer>, signal: AbortSignal | undefined, remainingPixels: number): Promise<MarkdownImage> {
    if (raw.length < 45 || raw.slice(0, 8).join() !== "137,80,78,71,13,10,26,10") forbidden();
    const chunks: Uint8Array[] = [raw.subarray(0, 8)], idat: Uint8Array[] = [];
    let offset = 8, width = 0, height = 0, depth = 0, channels = 0, interlace = 0;
    let ended = false, dataEnded = false, dataSeen = false, paletteEntries = 0, transparency = false, color = 0;
    while (offset < raw.length) {
        checkMarkdownCancellation(signal);
        if (offset + 12 > raw.length) forbidden();
        const length = u32(raw, offset), end = offset + 12 + length;
        if (end > raw.length) forbidden();
        const type = String.fromCharCode(...raw.subarray(offset + 4, offset + 8));
        if (!/^[A-Za-z]{4}$/.test(type) || (raw[offset + 6] & 32)) forbidden();
        if (crc(raw.subarray(offset + 4, end - 4)) !== u32(raw, end - 4)) forbidden();
        if (!width && type !== "IHDR") forbidden();
        if (dataSeen && type !== "IDAT") dataEnded = true;
        if (type === "IHDR") {
            if (width || length !== 13) forbidden();
            width = u32(raw, offset + 8); height = u32(raw, offset + 12); dimensions(width, height, remainingPixels);
            depth = raw[offset + 16]; color = raw[offset + 17];
            channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
            const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
            if (!channels || !depths.includes(depth) || raw[offset + 18] || raw[offset + 19] || raw[offset + 20] > 1) forbidden();
            interlace = raw[offset + 20];
        } else if (type === "IDAT") {
            if (dataEnded) forbidden();
            dataSeen = true; idat.push(raw.subarray(offset + 8, end - 4));
        } else if (type === "IEND") {
            if (length || !dataSeen || end !== raw.length) forbidden();
            ended = true;
        } else if (type === "PLTE") {
            if (dataSeen || transparency || paletteEntries || !length || length % 3 || length > 768 || color === 0 || color === 4 || color === 3 && length / 3 > 2 ** depth) forbidden();
            paletteEntries = length / 3;
        } else if (type === "tRNS") {
            if (dataSeen || transparency || !(color === 0 && length === 2 || color === 2 && length === 6 || color === 3 && length > 0 && length <= paletteEntries)) forbidden();
            transparency = true;
        } else if ((raw[offset + 4] & 32) === 0) forbidden();
        if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type)) chunks.push(raw.subarray(offset, end));
        offset = end;
    }
    if (!ended || (color === 3 && !paletteEntries)) forbidden();
    // Each Adam7 pass has independent filtered scanlines; a noninterlaced image
    // is the one-pass case. Bound inflation before invoking the raster decoder.
    const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
    const rows: Array<{ count: number; stride: number; width: number }> = [];
    let expected = 0;
    for (const [x,y,dx,dy] of passes) {
        const w = Math.max(0, Math.ceil((width-x)/dx)), h = Math.max(0, Math.ceil((height-y)/dy));
        if (w && h) { const stride = 1 + Math.ceil(w * channels * depth / 8); rows.push({ count: h, stride, width: w }); expected += h * stride; }
    }
    const compressed = new Uint8Array(idat.reduce((n, b) => n + b.length, 0));
    let position = 0; for (const b of idat) { compressed.set(b, position); position += b.length; }
    if (compressed.length < 6) forbidden();
    // The standard decoder rejects incomplete streams, checksum mismatches and
    // trailing input. fflate/UPNG alone can stop at an earlier DEFLATE end and
    // tolerate extra bytes. Feed small chunks and bound output before copying.
    if (typeof DecompressionStream === "undefined") throw new ExecutionError("UNSUPPORTED_CLIENT_OP", "This browser cannot safely validate embedded PNG data.");
    let readOffset = 0;
    const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull(controller) {
            checkMarkdownCancellation(signal);
            if (readOffset === compressed.length) { controller.close(); return; }
            controller.enqueue(compressed.subarray(readOffset, readOffset + 256)); readOffset = Math.min(compressed.length, readOffset + 256);
        },
    });
    const reader = input.pipeThrough(new DecompressionStream("deflate")).getReader();
    const inflated = new Uint8Array(expected); let written = 0;
    try {
        while (true) {
            checkMarkdownCancellation(signal);
            const { done, value } = await reader.read();
            checkMarkdownCancellation(signal);
            if (done) break;
            if (written + value.length > expected) forbidden();
            inflated.set(value, written); written += value.length;
        }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (written !== expected) forbidden();
    let rowOffset = 0;
    for (const row of rows) {
        let previous = new Uint8Array(row.stride - 1);
        for (let y = 0; y < row.count; y++) {
            const filter = inflated[rowOffset]; if (filter > 4) forbidden();
            if (color === 3) {
                const current = new Uint8Array(row.stride - 1);
                for (let x = 0; x < current.length; x++) {
                    const left = x ? current[x-1] : 0, above = previous[x], corner = x ? previous[x-1] : 0;
                    const prediction = left + above - corner;
                    const pa = Math.abs(prediction-left), pb = Math.abs(prediction-above), pc = Math.abs(prediction-corner);
                    const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left+above)/2) : pa <= pb && pa <= pc ? left : pb <= pc ? above : corner;
                    current[x] = (inflated[rowOffset + 1 + x] + predictor) & 255;
                }
                for (let x = 0; x < row.width; x++) {
                    const bit = x * depth, index = (current[bit >> 3] >> (8-depth-(bit & 7))) & ((1 << depth)-1);
                    if (index >= paletteEntries) forbidden();
                }
                previous = current;
            }
            rowOffset += row.stride;
        }
    }
    const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    position = 0; for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
    return { format: "png", bytes, width, height };
}

// Bound JPEG dimensions before the full entropy decoder allocates coefficient
// buffers. Segment lengths and an exact EOI are checked, including multiple scans.
function jpegImage(raw: Uint8Array<ArrayBuffer>, remainingPixels: number): MarkdownImage {
    if (raw[0] !== 255 || raw[1] !== 216) forbidden();
    let offset = 2, width = 0, height = 0, scans = 0, frame = 0, restartInterval = 0;
    const components = new Map<number, number>(), quantization = new Set<number>(), dcScanned = new Set<number>();
    const huffman = new Set<number>();
    while (offset < raw.length) {
        if (raw[offset++] !== 255) forbidden();
        while (raw[offset] === 255) offset++;
        const marker = raw[offset++];
        if (marker === 217) {
            if (!width || !scans || offset !== raw.length || dcScanned.size !== components.size) forbidden();
            return { format: "jpeg", bytes: raw, width, height };
        }
        if (offset + 2 > raw.length || !([192,193,194,196,218,219,221,254].includes(marker) || marker >= 224 && marker <= 239)) forbidden();
        const length = (raw[offset] << 8) | raw[offset+1], end = offset + length;
        if (length < 2 || end > raw.length) forbidden();
        if ([192,193,194].includes(marker)) {
            if (width || length < 8 || raw[offset+2] !== 8) forbidden();
            height = (raw[offset+3] << 8) | raw[offset+4]; width = (raw[offset+5] << 8) | raw[offset+6]; dimensions(width, height, remainingPixels);
            const count = raw[offset+7]; let blocks = 0; frame = marker;
            if (![1,3,4].includes(count) || length !== 8 + 3 * count) forbidden();
            for (let c = 0; c < count; c++) {
                const id = raw[offset+8+c*3], sample = raw[offset+9+c*3], table = raw[offset+10+c*3];
                if (components.has(id) || table > 3 || !(sample >> 4) || !(sample & 15) || (sample >> 4) > 4 || (sample & 15) > 4) forbidden();
                blocks += (sample >> 4) * (sample & 15); components.set(id, table);
            }
            if (blocks > 10) forbidden();
        } else if (marker === 219) {
            let at = offset + 2;
            while (at < end) {
                const spec = raw[at++], precision = spec >> 4, table = spec & 15;
                if (precision > 1 || table > 3 || at + 64 * (precision+1) > end) forbidden();
                for (let i = 0; i < 64; i++) {
                    const value = precision ? (raw[at++] << 8) | raw[at++] : raw[at++];
                    if (!value) forbidden();
                }
                quantization.add(table);
            }
            if (at !== end || length === 2) forbidden();
        } else if (marker === 196) {
            let at = offset + 2;
            while (at < end) {
                const spec = raw[at++]; if ((spec >> 4) > 1 || (spec & 15) > 3 || at + 16 > end) forbidden();
                let count = 0, slots = 1;
                for (let i = 0; i < 16; i++) { const n = raw[at++]; slots = slots * 2 - n; count += n; if (slots < 0) forbidden(); }
                if (!count || count > 256 || at + count > end || !slots) forbidden();
                for (let i = 0; i < count; i++) { const value = raw[at++]; if ((spec >> 4) === 0 ? value > 11 : (value & 15) > 10) forbidden(); }
                huffman.add(spec);
            }
            if (at !== end || length === 2) forbidden();
        } else if (marker === 221) {
            if (length !== 4) forbidden(); restartInterval = (raw[offset+2] << 8) | raw[offset+3];
        } else if (marker === 218) {
            const count = raw[offset+2];
            if (!width || !count || count > components.size || length !== 6 + 2 * count) forbidden();
            const spectral = offset + 3 + 2 * count, start = raw[spectral], finish = raw[spectral+1], approximation = raw[spectral+2];
            const high = approximation >> 4, low = approximation & 15;
            if (frame !== 194 ? start !== 0 || finish !== 63 || approximation !== 0 : start > finish || finish > 63 || start === 0 && finish !== 0 || start > 0 && count !== 1 || high > 13 || low > 13 || high !== 0 && high !== low + 1) forbidden();
            const selected = new Set<number>();
            for (let c = 0; c < count; c++) {
                const id = raw[offset+3+c*2], tables = raw[offset+4+c*2];
                if (!components.has(id) || selected.has(id) || (tables >> 4) > 3 || (tables & 15) > 3 || !quantization.has(components.get(id)!)) forbidden();
                if (start === 0 && !high && !huffman.has(tables >> 4) || (frame !== 194 || start > 0) && !huffman.has(16 | (tables & 15))) forbidden();
                selected.add(id); if (!start && !high) dcScanned.add(id);
            }
        }
        offset = end;
        if (marker === 218) {
            scans++; let restart = 0;
            while (offset < raw.length) {
                if (raw[offset++] !== 255) continue;
                const start = offset - 1; while (raw[offset] === 255) offset++;
                const next = raw[offset++];
                if (next === 0) continue;
                if (next >= 208 && next <= 215) { if (!restartInterval || next !== 208 + restart) forbidden(); restart = (restart+1) % 8; continue; }
                offset = start; break;
            }
        }
    }
    return forbidden();
}
async function validateImage(href: string, signal: AbortSignal | undefined, remainingPixels: number): Promise<MarkdownImage> {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(href);
    if (!match || !match[2] || match[2].length > MAX_ENCODED || match[2].length % 4) forbidden();
    const payload = match[2], size = payload.length / 4 * 3 - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0);
    if (!size || size > MAX_DECODED) forbidden();
    const binary = atob(payload); if (btoa(binary) !== payload) forbidden();
    const raw = Uint8Array.from(binary, c => c.charCodeAt(0));
    const image = match[1] === "png" ? await pngBytes(raw, signal, remainingPixels) : jpegImage(raw, remainingPixels);
    checkMarkdownCancellation(signal);
    if (image.format === "png") {
        const doc = await PDFDocument.create(); const raster = await doc.embedPng(image.bytes);
        if (raster.width !== image.width || raster.height !== image.height) forbidden();
    } else {
        // Strict entropy decoding is necessary: PDF.js repairs early EOI and
        // returns a full-sized raster even when scan data is missing.
        const raster = decodeJPEG(image.bytes, { useTArray: true, formatAsRGBA: false,
            tolerantDecoding: false, maxResolutionInMP: 4, maxMemoryUsageInMB: 64 });
        if (raster.width !== image.width || raster.height !== image.height || raster.data.length !== image.width * image.height * 3) forbidden();
    }
    checkMarkdownCancellation(signal);
    return image;
}
export async function prepareMarkdown(file: File, signal?: AbortSignal): Promise<PreparedMarkdown> {
    checkMarkdownCancellation(signal);
    if (!file || !file.size) throw new ExecutionError("INVALID_INPUT", "Provided Markdown file is empty or missing.");
    if (file.size > MAX_SOURCE) forbidden();
    const cached = preparedFiles.get(file); if (cached) return cached;
    let source: string;
    try { source = await file.text(); }
    catch (error) {
        checkMarkdownCancellation(signal);
        throw new ExecutionError("INVALID_INPUT", "Failed to read Markdown file text content.", error);
    }
    checkMarkdownCancellation(signal);
    if (source.length > MAX_SOURCE || new TextEncoder().encode(source).length > MAX_SOURCE) forbidden();
    const tokens = marked.lexer(source, { gfm: true, breaks: false });
    const nodes: Token[] = []; marked.walkTokens(tokens, token => { nodes.push(token); });
    const images = new Map<string, MarkdownImage>(); let count = 0, pixels = 0;
    try {
        for (const token of nodes) {
            checkMarkdownCancellation(signal);
            // Like the backend: raw HTML is not a rendering feature. Classify
            // parsed HTML tokens only; code, escaped text and autolinks stay inert.
            if (token.type === "html" && !/^(?:\s|<!--[\s\S]*?-->)*$/.test(token.text)) forbidden();
            if (token.type !== "image") continue;
            if (++count > MAX_IMAGES) forbidden();
            const image = images.get(token.href) || await validateImage(token.href, signal, MAX_TOTAL_PIXELS - pixels);
            pixels += image.width * image.height; if (pixels > MAX_TOTAL_PIXELS) forbidden();
            images.set(token.href, image);
        }
    } catch (error) {
        checkMarkdownCancellation(signal);
        if (error instanceof ExecutionError) throw error;
        forbidden(); // Codecs never publish diagnostics or substitute placeholders.
    }
    checkMarkdownCancellation(signal);
    const prepared = { source, tokens, images }; preparedFiles.set(file, prepared); return prepared;
}
