import { KEYUTIL, KJUR } from "jsrsasign";

declare const atob: (value: string) => string;

export async function verifyRs256(signingInput: string, encodedSignature: string, publicKeyPem: string) {
  const subtle = (globalThis as any).crypto?.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey(
        "spki",
        pemToArrayBuffer(publicKeyPem),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const valid = await subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        base64UrlToBytes(encodedSignature),
        textToBytes(signingInput)
      );
      if (valid) {
        return;
      }
    } catch (e) {
      console.warn("WebCrypto verify failed, falling back to jsrsasign", e);
    }
  }

  // Pure JS verification using jsrsasign for native devices (iOS / Android)
  try {
    const fullJWS = `${signingInput}.${encodedSignature}`;
    const key = KEYUTIL.getKey(publicKeyPem);
    const valid = KJUR.jws.JWS.verify(fullJWS, key as any, ["RS256"]);
    if (!valid) {
      throw new Error("QR signature verification failed.");
    }
  } catch (error) {
    throw new Error(`Signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function pemToArrayBuffer(pem: string) {
  return base64ToBytes(
    pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, "")
  );
}

export function base64UrlToBytes(value: string) {
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/"));
}

export function base64ToBytes(value: string) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

export function makeId() {
  const random = (globalThis as any).crypto?.randomUUID?.();
  if (random) {
    return random;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function normalize(value: string) {
  return value.trim().toUpperCase();
}
