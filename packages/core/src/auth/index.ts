/**
 * Signing a reviewer in from a preview host.
 *
 * Everything here runs on the SDK route. A device code and a token are both
 * credentials, and neither belongs in a bundle the browser downloads.
 */

export { createDeviceFlow, DeviceFlowError } from "./device-flow.js";

export type {
  DeviceCode,
  DeviceFlow,
  DeviceFlowFailure,
  DeviceFlowOptions,
  DeviceToken,
} from "./device-flow.js";
