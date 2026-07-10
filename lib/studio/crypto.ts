import {PROJECT_SECRET} from "@/lib/studio/constants";

const SECRET = PROJECT_SECRET;

async function deriveKey(salt: Uint8Array) {
    const encoder = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(SECRET),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: toArrayBuffer(salt),
            iterations: 100000,
            hash: "SHA-256",
        },
        baseKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encrypt(bytes: Uint8Array) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const key = await deriveKey(salt);

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
        },
        key,
        toArrayBuffer(bytes)
    );

    return {
        salt,
        iv,
        encrypted: new Uint8Array(encrypted),
    };
}

export async function decrypt(
    encrypted: Uint8Array,
    iv: Uint8Array,
    salt: Uint8Array
) {
    const key = await deriveKey(salt);

    const result = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: toArrayBuffer(iv),
        },
        key,
        toArrayBuffer(encrypted)
    );

    return new Uint8Array(result);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
}