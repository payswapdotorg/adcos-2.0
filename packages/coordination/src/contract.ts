/**
 * coordination 模块公开契约：实例协调 —— 信封校验管线、持久收件箱/发件箱
 * 生命周期、作用域委托链校验、能力发现、真实 TCP 线缆传输（adapters 层）、
 * 两进程物理验证运行时，以及 ADR-0001 的 ShareNet 失败关闭接缝。
 * 消费方只允许从这里 import。domain 层纯函数、注入时钟；未知/畸形一律
 * fail closed（可复核）。
 */
export { validateEnvelope, createEnvelopeReplayGuard } from "./domain/envelope-validation.js";
export type {
  ValidationContext,
  ValidationFailure,
  ValidationResult,
} from "./domain/envelope-validation.js";
export { beginProcessing, recordOutcome, isDeadLettered } from "./domain/inbox.js";
export type { LifecycleTransition } from "./domain/inbox.js";
export { checkDelegationChain } from "./domain/delegation.js";
export type { DelegationCheck } from "./domain/delegation.js";
export { discoverResources } from "./domain/discovery.js";
export type { DiscoveryQuery, DiscoveredResource } from "./domain/discovery.js";
export { JsonlInboxStore } from "./adapters/jsonl-inbox-store.js";
export type { InboxStoreStats } from "./adapters/jsonl-inbox-store.js";
export {
  createFrameId,
  decodeFrame,
  encodeFrame,
  DEFAULT_MAX_FRAME_BYTES,
  WireProtocolError,
} from "./adapters/transport/wire-protocol.js";
export type { FrameId, WireFailure, WireFrame } from "./adapters/transport/wire-protocol.js";
export {
  TcpTransportListener,
  TcpTransportClient,
  isTransportError,
} from "./adapters/transport/tcp-transport.js";
export type {
  ListenerOptions,
  ClientOptions,
  TransportError,
} from "./adapters/transport/tcp-transport.js";
export { CoordinationEndpoint } from "./adapters/transport/coordination-endpoint.js";
export type { CoordinationEndpointOptions } from "./adapters/transport/coordination-endpoint.js";
export { OutboxSender } from "./adapters/transport/outbox-sender.js";
export type { OutboxOptions, OutboxSendOptions } from "./adapters/transport/outbox-sender.js";
export type {
  EndpointEvent,
  HandlerOutcome,
  MessageHandler,
  SendReport,
  SendState,
} from "./adapters/transport/endpoint-types.js";
export { endpointEventDescription } from "./adapters/transport/endpoint-types.js";
export {
  createShareNetSeam,
  ShareNetSeamConfigurationError,
  ShareNetSeamUnavailableError,
} from "./adapters/sharenet/sharenet-seam.js";
export type {
  ShareNetCoordinationSeam,
  ShareNetIntentRef,
  ShareNetOfferRef,
  ShareNetContractRef,
  ShareNetSeamOptions,
  ShareNetSeamProbe,
  ShareNetSeamProjection,
} from "./adapters/sharenet/sharenet-seam.js";
