import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import type { Hex } from "viem";

import { X402ConfigError } from "./errors.js";

const privateKeyPattern = /^(?:0x)?[0-9a-fA-F]{64}$/u;

export function normalizeEvmPrivateKey(privateKey: string): Hex {
  if (!privateKeyPattern.test(privateKey)) {
    throw new X402ConfigError(
      "Private key must be a 32-byte hex string with an optional 0x prefix.",
    );
  }

  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
}

export function normalizeSolanaSecretKey(privateKey: string): Uint8Array {
  const decoded = decodeSolanaSecretKey(privateKey);

  if (decoded.byteLength !== 64) {
    throw new X402ConfigError(
      "Solana private key must be a base58-encoded 64-byte secret key.",
      {
        byteLength: decoded.byteLength,
      },
    );
  }

  return decoded;
}

export async function createSolanaSigner(
  secretKey: Uint8Array,
): Promise<KeyPairSigner> {
  try {
    return await createKeyPairSignerFromBytes(secretKey);
  } catch (error) {
    throw new X402ConfigError("Solana private key could not create a signer.", {
      cause: error,
    });
  }
}

export function requiredEvmPrivateKey(privateKey: Hex | undefined): Hex {
  if (privateKey === undefined) {
    throw new X402ConfigError("EVM private key was not configured.");
  }

  return privateKey;
}

export function requiredSolanaSecretKey(
  secretKey: Uint8Array | undefined,
): Uint8Array {
  if (secretKey === undefined) {
    throw new X402ConfigError("Solana private key was not configured.");
  }

  return secretKey;
}

function decodeSolanaSecretKey(privateKey: string): Uint8Array {
  try {
    return base58.decode(privateKey);
  } catch (error) {
    throw new X402ConfigError(
      "Solana private key must be a base58-encoded 64-byte secret key.",
      {
        cause: error,
      },
    );
  }
}
