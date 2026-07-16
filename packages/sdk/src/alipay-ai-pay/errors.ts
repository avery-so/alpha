export interface AlipayAIPayErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}

export class AlipayAIPayError extends Error {
  readonly details: AlipayAIPayErrorDetails | undefined;

  constructor(message: string, details?: AlipayAIPayErrorDetails | undefined) {
    super(message);
    this.name = "AlipayAIPayError";
    this.details = details;
  }
}

export class AlipayAIPayConfigError extends AlipayAIPayError {
  constructor(message: string, details?: AlipayAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "AlipayAIPayConfigError";
  }
}

export class AlipayAIPayRequestError extends AlipayAIPayError {
  constructor(message: string, details?: AlipayAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "AlipayAIPayRequestError";
  }
}

export class AlipayAIPayResponseError extends AlipayAIPayError {
  readonly status: number;

  constructor(message: string, status = 0, details?: AlipayAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "AlipayAIPayResponseError";
    this.status = status;
  }
}
