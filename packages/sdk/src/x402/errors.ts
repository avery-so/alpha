export interface X402ErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}

export class X402Error extends Error {
  readonly details: X402ErrorDetails | undefined;

  constructor(message: string, details?: X402ErrorDetails | undefined) {
    super(message);
    this.name = "X402Error";
    this.details = details;
  }
}

export class X402ConfigError extends X402Error {
  constructor(message: string, details?: X402ErrorDetails | undefined) {
    super(message, details);
    this.name = "X402ConfigError";
  }
}

export class X402PaymentError extends X402Error {
  readonly status: number;

  constructor(message: string, status = 0, details?: X402ErrorDetails | undefined) {
    super(message, details);
    this.name = "X402PaymentError";
    this.status = status;
  }
}
