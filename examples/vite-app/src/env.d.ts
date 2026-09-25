/// <reference types="vite/client" />

/**
 * `ImportMetaEnv` carries an index signature, so an undeclared key reads as
 * `any`. Declaring the one this example uses is what makes `App.tsx` able to
 * reach it by name rather than by string.
 */
interface ImportMetaEnv {
  /** The branch under review. CI stamps it; absent, the example picks its own. */
  readonly VITE_MAPLE_BRANCH?: string;
}

/** True on a preview build and in `vite dev`, set by `vite.config.ts`. */
declare const __MAPLE_PREVIEW__: boolean;
