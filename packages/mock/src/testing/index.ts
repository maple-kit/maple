/**
 * What a test of a flag provider under Maple Mock needs: the shared contract
 * suite, and an in-memory provider to run it against. Imports vitest.
 */

export { runFlagProviderContract } from "./flag-contract.js";
export type { FlagProviderContractOptions, FlagProviderContractSubject } from "./flag-contract.js";
export { memoryFlagProvider } from "./memory-flags.js";
export type { MemoryFlagOptions, MemoryFlagProvider } from "./memory-flags.js";
