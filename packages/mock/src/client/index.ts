/**
 * The mock box's controller, framework-free. It finds the installed transport
 * rather than importing it, so a page that renders the box without mocking
 * carries none of the interceptor.
 */

export { installedMock } from "../handle.js";
export type { MockHandle } from "../interceptor.js";
export { createMockClient, MockClipboardError } from "./client.js";
export type {
  MockCallRow,
  MockClient,
  MockClientOptions,
  MockClientState,
  MockView,
} from "./client.js";
export {
  PLAN_DEBOUNCE_MS,
  PLAN_FLOOR,
  PLAN_MIN_LENGTH,
  PLAN_TIE,
  planCall,
  readPlan,
} from "./plan.js";
export type { MockSuggestion, PlanReading } from "./plan.js";
