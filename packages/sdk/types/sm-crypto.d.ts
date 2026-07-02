declare module "sm-crypto" {
  interface Sm2SignatureOptions {
    der?: boolean | undefined;
    hash?: boolean | undefined;
    publicKey?: string | undefined;
    userId?: string | undefined;
  }

  interface Sm2Module {
    doSignature: (
      message: string | ArrayLike<number>,
      privateKey: string,
      options?: Sm2SignatureOptions,
    ) => string;
    doVerifySignature: (
      message: string | ArrayLike<number>,
      signature: string,
      publicKey: string,
      options?: Pick<Sm2SignatureOptions, "der" | "hash" | "userId">,
    ) => boolean;
    getPublicKeyFromPrivateKey: (privateKey: string) => string;
  }

  interface SmCryptoModule {
    sm2: Sm2Module;
    sm3: (message: string | ArrayLike<number>) => string;
  }

  const smCrypto: SmCryptoModule;
  export default smCrypto;
}
