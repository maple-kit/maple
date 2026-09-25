import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import maple from "eslint-plugin-maple";
import perfectionist from "eslint-plugin-perfectionist";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Entrypoints listed in a package's "exports". Effect must not surface here. */
const PUBLIC_ENTRYPOINTS = ["packages/*/src/index.ts", "packages/*/src/*/index.ts"];

const EFFECT_IS_INTERNAL =
  "Effect is an implementation detail of core. Public entrypoints expose plain Promise types only; " +
  "wrap the Effect code in an adapter under src/internal/ and re-export the Promise surface.";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-preview/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.next-preview/**",
      "**/.next-strip/**",
      "**/*.d.ts",
      "examples/*/.vite/**",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  sonarjs.configs.recommended,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    plugins: { maple, perfectionist, "unused-imports": unusedImports },
    rules: {
      "no-console": "error",
      "maple/max-comment-lines": ["error", { max: 4, headerMax: 10 }],

      complexity: ["error", { max: 20 }],
      "sonarjs/cognitive-complexity": ["error", 15],
      "max-depth": ["error", 4],
      "max-params": ["error", 4],
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],

      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      "perfectionist/sort-imports": [
        "error",
        {
          type: "natural",
          newlinesBetween: 1,
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "style",
            "type",
            "unknown",
          ],
        },
      ],
      "perfectionist/sort-named-imports": ["error", { type: "natural" }],
      "perfectionist/sort-exports": ["error", { type: "natural" }],
    },
  },

  {
    files: PUBLIC_ENTRYPOINTS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["effect", "effect/*", "@effect/*"], message: EFFECT_IS_INTERNAL }] },
      ],
    },
  },

  {
    // The classifier package is the one place on the Effect v4 line, and its
    // whole public surface is one connector. Keeping Effect under internal/
    // is what makes that true of the built types, not only of index.ts.
    files: ["packages/classifier/src/**/*.ts"],
    ignores: ["packages/classifier/src/internal/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["effect", "effect/*", "@effect/*"], message: EFFECT_IS_INTERNAL }] },
      ],
    },
  },

  {
    // The mock runtime is imported from a host's entry before anything else,
    // so it carries no framework. The packages that render depend on it
    // through their ./mock subpaths; the arrow never points the other way.
    files: ["packages/mock/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["effect", "effect/*", "@effect/*", "react", "react-dom", "react/*"],
              message: "@maple-kit/mock uses no Effect and no React. See docs/mock.md.",
            },
            {
              group: ["@maple-kit/ui", "@maple-kit/ui/*", "@maple-kit/react", "@maple-kit/react/*"],
              message:
                "@maple-kit/ui and @maple-kit/react import @maple-kit/mock, not the reverse.",
            },
          ],
        },
      ],
    },
  },

  {
    // The two packages that render, and their source rather than their tests:
    // a test probe reassigns a module variable on purpose to observe a render.
    files: ["packages/react/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      // A missing dependency ships as a stale closure, which is a bug a review
      // does not catch. CI runs `eslint .`, where a warning is invisible.
      "react-hooks/exhaustive-deps": "error",
      // These packages call `createElement` rather than writing JSX, and the
      // rule reads every call taking a `ref` key as a function reading it.
      "react-hooks/refs": "off",
    },
  },

  {
    files: ["**/*.contract.test.ts"],
    rules: {
      // The suite's tests are declared by runStoreContract, not inline.
      "sonarjs/no-empty-test-file": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
    rules: {
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  {
    files: ["**/*.js", "**/*.mjs", "**/*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
