export interface WeiXinAIPayErrorDetails {
  cause?: unknown;
  [key: string]: unknown;
}

export class WeiXinAIPayError extends Error {
  readonly details: WeiXinAIPayErrorDetails | undefined;

  constructor(message: string, details?: WeiXinAIPayErrorDetails | undefined) {
    super(message);
    this.name = "WeiXinAIPayError";
    this.details = details;
  }
}

export class WeiXinAIPayConfigError extends WeiXinAIPayError {
  constructor(message: string, details?: WeiXinAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "WeiXinAIPayConfigError";
  }
}

export class WeiXinAIPayRequestError extends WeiXinAIPayError {
  constructor(message: string, details?: WeiXinAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "WeiXinAIPayRequestError";
  }
}

export class WeiXinAIPayResponseError extends WeiXinAIPayError {
  readonly status: number;

  constructor(message: string, status = 0, details?: WeiXinAIPayErrorDetails | undefined) {
    super(message, details);
    this.name = "WeiXinAIPayResponseError";
    this.status = status;
  }
}
