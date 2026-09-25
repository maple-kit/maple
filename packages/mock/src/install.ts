/**
 * The in-page transport, imported from the app's entry before its first
 * request: `import "@maple-kit/mock/install"`.
 *
 * Importing it installs it, with every default. A host that wants a logger or
 * an `ignore` calls `installMock` from `@maple-kit/mock` instead.
 */

import { installMock } from "./interceptor.js";

installMock();
