import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import maple from "eslint-plugin-maple";
import perfectionist from "eslint-plugin-perfectionist";
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
