import { AlipayAIPayClient } from "../alipay-ai-pay/client.js";
import { WeiXinAIPayClient } from "../weixin-ai-pay/client.js";
import { createLogger, type Logger } from "../x402/logger.js";
import type { AlphaAlipayInboundRuntimeState } from "./alipay-inbound.js";
import { compileAlipayRoutes } from "./alipay-routes.js";
import { AlphaPaymentConfigError } from "./errors.js";
import type {
  AlphaAlipayInboundConfig,
  AlphaPaymentConfig,
  AlphaPaymentDirection,
  AlphaPaymentProvider,
  AlphaWeiXinOutboundConfig,
} from "./types.js";
import {
  createX402InboundState,
  createX402OutboundState,
  type AlphaX402InboundRuntimeState,
  type AlphaX402OutboundRuntimeState,
} from "./x402-runtime.js";

interface AlphaRuntimeStateBase {
  direction: AlphaPaymentDirection;
  initialize(): Promise<void>;
  logger: Logger;
  provider: AlphaPaymentProvider;
}

export interface AlphaX402InboundState extends AlphaRuntimeStateBase, AlphaX402InboundRuntimeState {
  direction: "inbound";
  provider: "x402";
}

export interface AlphaX402OutboundState
  extends AlphaRuntimeStateBase, AlphaX402OutboundRuntimeState {
  direction: "outbound";
  provider: "x402";
}

export interface AlphaAlipayInboundState
  extends AlphaRuntimeStateBase, AlphaAlipayInboundRuntimeState {
  direction: "inbound";
  provider: "alipay";
}

export interface AlphaWeiXinOutboundState extends AlphaRuntimeStateBase {
  client: WeiXinAIPayClient;
  context: {
    client: WeiXinAIPayClient;
    direction: "outbound";
    provider: "weixin";
  };
  direction: "outbound";
  provider: "weixin";
}

export type AlphaRuntimeState =
  | AlphaX402InboundState
  | AlphaX402OutboundState
  | AlphaAlipayInboundState
  | AlphaWeiXinOutboundState;

export function createInboundX402Runtime(
  config: Extract<AlphaPaymentConfig, { provider: "x402"; direction: "inbound" }>,
): AlphaX402InboundState {
  const logger = createLogger(config.logLevel ?? "info", config.logger);
  const state = createX402InboundState(config);

  return {
    ...state,
    direction: "inbound",
    initialize: async () => {
      await state.httpServer.initialize();
      logger.info("Alpha payment runtime initialized.", {
        direction: "inbound",
        network: state.redactedNetworks,
        provider: "x402",
      });
    },
    logger,
    provider: "x402",
  };
}

export function createOutboundX402Runtime(
  config: Extract<AlphaPaymentConfig, { provider: "x402"; direction: "outbound" }>,
): AlphaX402OutboundState {
  const logger = createLogger(config.logLevel ?? "info", config.logger);
  const state = createX402OutboundState(config);

  return {
    ...state,
    direction: "outbound",
    initialize: () => {
      logger.info("Alpha payment runtime initialized.", {
        direction: "outbound",
        network: state.redactedNetworks,
        provider: "x402",
      });
      return Promise.resolve();
    },
    logger,
    provider: "x402",
  };
}

export function createAlipayRuntime(config: AlphaAlipayInboundConfig): AlphaAlipayInboundState {
  const logger = createLogger(config.logLevel ?? "info", config.logger);
  const client = createAlipayClient(config);
  const state = {
    client,
    context: { direction: "inbound", payment: null, provider: "alipay" } as const,
    logger,
    replayStore: config.replayStore,
    routes: compileAlipayRoutes(config.routes),
  };

  return {
    ...state,
    direction: "inbound",
    initialize: () => {
      if (state.replayStore === undefined) {
        logger.warn("Alpha Alipay inbound runtime has no replay store configured.", {
          direction: "inbound",
          provider: "alipay",
        });
      }

      logger.info("Alpha payment runtime initialized.", {
        direction: "inbound",
        provider: "alipay",
      });
      return Promise.resolve();
    },
    provider: "alipay",
  };
}

export function createWeiXinRuntime(config: AlphaWeiXinOutboundConfig): AlphaWeiXinOutboundState {
  const logger = createLogger(config.logLevel ?? "info", config.logger);
  const client = createWeiXinClient(config);
  const context = { client, direction: "outbound", provider: "weixin" } as const;

  return {
    client,
    context,
    direction: "outbound",
    initialize: () => {
      logger.info("Alpha payment runtime initialized.", {
        direction: "outbound",
        provider: "weixin",
      });
      return Promise.resolve();
    },
    logger,
    provider: "weixin",
  };
}

function createAlipayClient(config: AlphaAlipayInboundConfig): AlipayAIPayClient {
  try {
    if (config.client instanceof AlipayAIPayClient) {
      return config.client;
    }

    return new AlipayAIPayClient({
      ...config.client,
      ...(config.client.logger === undefined && config.logger !== undefined
        ? { logger: config.logger }
        : {}),
      ...(config.client.logLevel === undefined && config.logLevel !== undefined
        ? { logLevel: config.logLevel }
        : {}),
    });
  } catch (error) {
    throw new AlphaPaymentConfigError("Invalid Alipay inbound client configuration.", {
      cause: error,
      direction: config.direction,
      provider: config.provider,
    });
  }
}

function createWeiXinClient(config: AlphaWeiXinOutboundConfig): WeiXinAIPayClient {
  try {
    if (config.client instanceof WeiXinAIPayClient) {
      return config.client;
    }

    return new WeiXinAIPayClient({
      ...config.client,
      ...(config.client.logger === undefined && config.logger !== undefined
        ? { logger: config.logger }
        : {}),
      ...(config.client.logLevel === undefined && config.logLevel !== undefined
        ? { logLevel: config.logLevel }
        : {}),
    });
  } catch (error) {
    throw new AlphaPaymentConfigError("Invalid WeiXin outbound client configuration.", {
      cause: error,
      direction: config.direction,
      provider: config.provider,
    });
  }
}
