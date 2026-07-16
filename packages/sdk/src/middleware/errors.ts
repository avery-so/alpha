export interface AlphaPaymentErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}

export class AlphaPaymentError extends Error {
  readonly details: AlphaPaymentErrorDetails | undefined;

  constructor(message: string, details?: AlphaPaymentErrorDetails | undefined) {
    super(message);
    this.name = "AlphaPaymentError";
    this.details = details;
  }
}

export class AlphaPaymentConfigError extends AlphaPaymentError {
  constructor(message: string, details?: AlphaPaymentErrorDetails | undefined) {
    super(message, details);
    this.name = "AlphaPaymentConfigError";
  }
}

export class AlphaPaymentResponseError extends AlphaPaymentError {
  constructor(message: string, details?: AlphaPaymentErrorDetails | undefined) {
    super(message, details);
    this.name = "AlphaPaymentResponseError";
  }
}
