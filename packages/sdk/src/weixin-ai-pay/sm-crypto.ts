import { base16 } from "@scure/base";
import smCrypto from "sm-crypto";

import type { WeiXinAIPaySignatureEncoding } from "./types.js";

type Sm2SignatureOptions = {
  der?: boolean | undefined;
  hash?: boolean | undefined;
};

type Sm2VerifyOptions = Sm2SignatureOptions;

interface Sm2Module {
  doSignature(
    message: string | ArrayLike<number>,
    privateKey: string,
    options?: Sm2SignatureOptions,
  ): string;
  doVerifySignature(
    message: string | ArrayLike<number>,
    signature: string,
    publicKey: string,
    options?: Sm2VerifyOptions,
  ): boolean;
}

interface SmCryptoModule {
  sm2: Sm2Module;
  sm3(message: string | ArrayLike<number>): string;
}

const sm = smCrypto as SmCryptoModule;

export function sm3Digest(message: Uint8Array): Uint8Array {
  return hexToBytes(sm.sm3(message));
}

export function signSm2Digest(
  digest: Uint8Array,
  privateKey: string,
  signatureEncoding: WeiXinAIPaySignatureEncoding,
): Uint8Array {
  const signatureHex = sm.sm2.doSignature(digest, privateKey, {
    der: signatureEncoding === "der",
    hash: false,
  });

  return hexToBytes(signatureHex);
}

export function hexToBytes(hexValue: string): Uint8Array {
  return base16.decode(hexValue.toUpperCase());
}
