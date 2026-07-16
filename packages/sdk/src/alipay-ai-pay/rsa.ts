import { Buffer } from "node:buffer";
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from "node:crypto";

import { AlipayAIPayConfigError } from "./errors.js";
import type { AlipayAIPayKeyInput } from "./types.js";

const RSA_SIGNATURE_ALGORITHM = "RSA-SHA256";

export function normalizeAlipayAIPayPrivateKey(privateKey: AlipayAIPayKeyInput): KeyObject {
  const key =
    typeof privateKey === "string"
      ? createPrivateKeyFromText(privateKey)
      : assertKeyObject(privateKey, "private");

  if (key.type !== "private" || key.asymmetricKeyType !== "rsa") {
    throw new AlipayAIPayConfigError("Alipay AI Pay privateKey must be an RSA private key.", {
      asymmetricKeyType: key.asymmetricKeyType,
      keyType: key.type,
    });
  }

  return key;
}

export function normalizeAlipayAIPayPublicKey(publicKey: AlipayAIPayKeyInput): KeyObject {
  const key =
    typeof publicKey === "string"
      ? createPublicKeyFromText(publicKey)
      : assertKeyObject(publicKey, "public");

  if (key.type !== "public" || key.asymmetricKeyType !== "rsa") {
    throw new AlipayAIPayConfigError("Alipay AI Pay alipayPublicKey must be an RSA public key.", {
      asymmetricKeyType: key.asymmetricKeyType,
      keyType: key.type,
    });
  }

  return key;
}

export function signAlipayAIPayRsa2(content: string, privateKey: AlipayAIPayKeyInput): string {
  const key = normalizeAlipayAIPayPrivateKey(privateKey);
  const signer = createSign(RSA_SIGNATURE_ALGORITHM);
  signer.update(content, "utf8");
  signer.end();

  return signer.sign(key, "base64");
}

export function verifyAlipayAIPayRsa2(
  content: string,
  signature: string,
  publicKey: AlipayAIPayKeyInput,
): boolean {
  const key = normalizeAlipayAIPayPublicKey(publicKey);
  const verifier = createVerify(RSA_SIGNATURE_ALGORITHM);
  verifier.update(content, "utf8");
  verifier.end();

  try {
    return verifier.verify(key, signature, "base64");
  } catch {
    return false;
  }
}

function createPrivateKeyFromText(privateKey: string): KeyObject {
  const trimmed = privateKey.trim();

  if (trimmed.length === 0) {
    throw new AlipayAIPayConfigError("Alipay AI Pay privateKey is required.");
  }

  if (trimmed.includes("-----BEGIN")) {
    try {
      return createPrivateKey(trimmed);
    } catch (error) {
      throw new AlipayAIPayConfigError("Alipay AI Pay privateKey PEM could not be parsed.", {
        cause: error,
      });
    }
  }

  const der = Buffer.from(trimmed.replaceAll(/\s+/gu, ""), "base64");

  for (const type of ["pkcs8", "pkcs1"] as const) {
    try {
      return createPrivateKey({ format: "der", key: der, type });
    } catch {
      // Try the next DER container type.
    }
  }

  throw new AlipayAIPayConfigError(
    "Alipay AI Pay privateKey must be a PEM string or a base64-encoded PKCS#8/PKCS#1 key.",
  );
}

function createPublicKeyFromText(publicKey: string): KeyObject {
  const trimmed = publicKey.trim();

  if (trimmed.length === 0) {
    throw new AlipayAIPayConfigError("Alipay AI Pay alipayPublicKey is required.");
  }

  if (trimmed.includes("-----BEGIN")) {
    try {
      return createPublicKey(trimmed);
    } catch (error) {
      throw new AlipayAIPayConfigError("Alipay AI Pay alipayPublicKey PEM could not be parsed.", {
        cause: error,
      });
    }
  }

  const der = Buffer.from(trimmed.replaceAll(/\s+/gu, ""), "base64");

  try {
    return createPublicKey({ format: "der", key: der, type: "spki" });
  } catch {
    throw new AlipayAIPayConfigError(
      "Alipay AI Pay alipayPublicKey must be a PEM string or a base64-encoded SPKI key.",
    );
  }
}

function assertKeyObject(key: KeyObject, expected: "private" | "public"): KeyObject {
  if (typeof key !== "object" || key === null || typeof key.type !== "string") {
    throw new AlipayAIPayConfigError(`Alipay AI Pay ${expected} key input is not a KeyObject.`);
  }

  return key;
}
