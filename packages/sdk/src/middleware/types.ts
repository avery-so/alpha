import type {
  FacilitatorConfig,
  PaywallConfig,
  PaywallProvider,
  RouteConfig,
  x402ResourceServer,
} from "@x402/core/server";
import type { SchemeNetworkServer } from "@x402/core/types";

import type { AlipayAIPayClient } from "../alipay-ai-pay/client.js";
import type {
  AlipayAIPayClientBillInput,
  AlipayAIPayClientOptions,
} from "../alipay-ai-pay/types.js";
import type { WeiXinAIPayClient } from "../weixin-ai-pay/client.js";
import type { WeiXinAIPayClientOptions } from "../weixin-ai-pay/types.js";
import type { X402Client, X402ClientOptions } from "../x402/client.js";
import type { Logger, LogLevel } from "../x402/logger.js";
import type { X402NetworkInput } from "../x402/networks.js";

export type AlphaPaymentProvider = "x402" | "alipay" | "weixin";
export type AlphaPaymentDirection = "inbound" | "outbound";

export interface AlphaReplayStore {
  claim(input: {
    provider: "alipay";
    tradeNo: string;
    route: string;
  }): Promise<"claimed" | "in_progress" | "completed">;

  complete(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;

  abandon(input: { provider: "alipay"; tradeNo: string; route: string }): Promise<void>;
}

export interface AlphaRequestContext {
  direction: "inbound";
  provider: "alipay";
  request: Request;
  route: string;
}

export interface AlipayRouteConfig {
  bill:
    | AlipayAIPayClientBillInput
    | ((
        context: AlphaRequestContext,
      ) => AlipayAIPayClientBillInput | Promise<AlipayAIPayClientBillInput>);
  maxResponseBytes?: number | undefined;
}

export type AlipayRoutesConfig = Record<string, AlipayRouteConfig>;

type OfficialX402PaymentOption = Exclude<RouteConfig["accepts"], unknown[]>;

export type AlphaX402PaymentOption = Omit<OfficialX402PaymentOption, "network"> & {
  network: X402NetworkInput;
};

export type AlphaX402RouteConfig = Omit<RouteConfig, "accepts"> & {
  accepts: AlphaX402PaymentOption | AlphaX402PaymentOption[];
};

export type AlphaX402RoutesConfig = Record<string, AlphaX402RouteConfig> | AlphaX402RouteConfig;

export interface AlphaX402SchemeRegistration {
  network: X402NetworkInput;
  server: SchemeNetworkServer;
}

interface AlphaPaymentBaseConfig {
  direction: AlphaPaymentDirection;
  provider: AlphaPaymentProvider;
  logger?: Logger | undefined;
  logLevel?: LogLevel | undefined;
}

export interface AlphaX402InboundConfig extends AlphaPaymentBaseConfig {
  direction: "inbound";
  provider: "x402";
  routes: AlphaX402RoutesConfig;
  network?: X402NetworkInput | readonly X402NetworkInput[] | undefined;
  server?: x402ResourceServer | undefined;
  facilitator?: string | FacilitatorConfig | undefined;
  schemes?: "auto" | readonly AlphaX402SchemeRegistration[] | undefined;
  paywallConfig?: PaywallConfig | undefined;
  paywall?: PaywallProvider | undefined;
}

export interface AlphaX402OutboundConfig extends AlphaPaymentBaseConfig {
  direction: "outbound";
  provider: "x402";
  network: X402NetworkInput;
  client?: X402Client | undefined;
  privateKey?: string | undefined;
  fetch?: X402ClientOptions["fetch"] | undefined;
  maxAmount?: X402ClientOptions["maxAmount"] | undefined;
  rpcUrl?: X402ClientOptions["rpcUrl"] | undefined;
}

export interface AlphaAlipayInboundConfig extends AlphaPaymentBaseConfig {
  direction: "inbound";
  provider: "alipay";
  client: AlipayAIPayClient | AlipayAIPayClientOptions;
  routes: AlipayRoutesConfig;
  replayStore?: AlphaReplayStore | undefined;
  network?: never;
}

export interface AlphaWeiXinOutboundConfig extends AlphaPaymentBaseConfig {
  direction: "outbound";
  provider: "weixin";
  client: WeiXinAIPayClient | WeiXinAIPayClientOptions;
  network?: never;
}

export type AlphaPaymentConfig =
  | AlphaX402InboundConfig
  | AlphaX402OutboundConfig
  | AlphaAlipayInboundConfig
  | AlphaWeiXinOutboundConfig;

export interface AlphaX402InboundPaymentContext {
  direction: "inbound";
  provider: "x402";
}

export interface AlphaX402OutboundPaymentContext {
  client: X402Client;
  direction: "outbound";
  provider: "x402";
}

export interface AlphaAlipayPaymentVerification {
  active: boolean;
  amount: string;
  outTradeNo: string;
  resourceId: string;
  tradeNo: string;
}

export interface AlphaAlipayInboundPaymentContext {
  direction: "inbound";
  payment: AlphaAlipayPaymentVerification | null;
  provider: "alipay";
}

export interface AlphaWeiXinOutboundPaymentContext {
  client: WeiXinAIPayClient;
  direction: "outbound";
  provider: "weixin";
}

export type AlphaPaymentContext =
  | AlphaX402InboundPaymentContext
  | AlphaX402OutboundPaymentContext
  | AlphaAlipayInboundPaymentContext
  | AlphaWeiXinOutboundPaymentContext;

export type AlphaWebHandler = (
  request: Request,
  context: AlphaPaymentContext,
) => Response | Promise<Response>;
