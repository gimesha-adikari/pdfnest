/**
 * Unit tests for lib/studio/crypto.ts
 *
 * Run: npx tsx tests/unit/studioCrypto.test.ts
 */

import assert from "assert";

import { decrypt, encrypt, toArrayBuffer } from "../../lib/studio/crypto";

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

function randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = i % 256;
    return out;
}

const tests: Array<[string, () => Promise<void>]> = [
    ["encrypt then decrypt round-trips the payload", async () => {
        const plain = bytes(1, 2, 3, 250, 0, 42);
        const { encrypted, iv, salt } = await encrypt(plain);

        const result = await decrypt(encrypted, iv, salt);

        assert.deepEqual(Array.from(result), Array.from(plain));
    }],

    ["round-trips an empty payload", async () => {
        const { encrypted, iv, salt } = await encrypt(new Uint8Array(0));

        const result = await decrypt(encrypted, iv, salt);

        assert.equal(result.length, 0);
    }],

    ["round-trips a larger payload", async () => {
        const plain = randomBytes(64 * 1024);
        const { encrypted, iv, salt } = await encrypt(plain);

        const result = await decrypt(encrypted, iv, salt);

        assert.equal(result.length, plain.length);
        assert.ok(Buffer.from(result).equals(Buffer.from(plain)));
    }],

    ["emits a 12-byte iv and a 16-byte salt", async () => {
        const { iv, salt } = await encrypt(bytes(1));

        assert.equal(iv.length, 12);
        assert.equal(salt.length, 16);
    }],

    ["ciphertext carries the 16-byte AES-GCM tag", async () => {
        const plain = bytes(1, 2, 3, 4);
        const { encrypted } = await encrypt(plain);

        assert.equal(encrypted.length, plain.length + 16);
    }],

    ["ciphertext differs from the plaintext", async () => {
        const plain = randomBytes(32);
        const { encrypted } = await encrypt(plain);

        assert.ok(!Buffer.from(encrypted.slice(0, plain.length)).equals(Buffer.from(plain)));
    }],

    ["uses a fresh iv and salt per encryption", async () => {
        const plain = bytes(7, 7, 7);
        const first = await encrypt(plain);
        const second = await encrypt(plain);

        assert.ok(!Buffer.from(first.iv).equals(Buffer.from(second.iv)), "iv is random");
        assert.ok(!Buffer.from(first.salt).equals(Buffer.from(second.salt)), "salt is random");
        assert.ok(
            !Buffer.from(first.encrypted).equals(Buffer.from(second.encrypted)),
            "same plaintext yields different ciphertext"
        );
    }],

    ["decrypt rejects a tampered ciphertext", async () => {
        const { encrypted, iv, salt } = await encrypt(bytes(1, 2, 3, 4));
        encrypted[0] ^= 0xff;

        await assert.rejects(() => decrypt(encrypted, iv, salt));
    }],

    ["decrypt rejects a wrong iv", async () => {
        const { encrypted, salt } = await encrypt(bytes(1, 2, 3, 4));
        const wrongIv = new Uint8Array(12);

        await assert.rejects(() => decrypt(encrypted, wrongIv, salt));
    }],

    ["decrypt rejects a wrong salt", async () => {
        const { encrypted, iv } = await encrypt(bytes(1, 2, 3, 4));
        const wrongSalt = new Uint8Array(16);

        await assert.rejects(() => decrypt(encrypted, iv, wrongSalt));
    }],

    ["decrypt rejects a truncated ciphertext", async () => {
        const { encrypted, iv, salt } = await encrypt(randomBytes(48));

        await assert.rejects(() => decrypt(encrypted.slice(0, encrypted.length - 4), iv, salt));
    }],

    ["toArrayBuffer copies the exact view of a subarray", async () => {
        const backing = new Uint8Array([0, 1, 2, 3, 4, 5]);
        const view = backing.subarray(2, 5);

        const buffer = toArrayBuffer(view);

        assert.equal(buffer.byteLength, 3);
        assert.deepEqual(Array.from(new Uint8Array(buffer)), [2, 3, 4]);
    }],

    ["toArrayBuffer detaches the copy from the source bytes", async () => {
        const source = new Uint8Array([9, 8, 7]);
        const buffer = toArrayBuffer(source);

        source[0] = 0;

        assert.deepEqual(Array.from(new Uint8Array(buffer)), [9, 8, 7]);
    }],
];

async function runTests(): Promise<void> {
    console.log("Running studio crypto tests...");
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            await fn();
            passed += 1;
            console.log(`  PASS  ${name}`);
        } catch (e) {
            failed += 1;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${(e as Error).message}`);
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
    console.error(e);
    process.exit(1);
});
