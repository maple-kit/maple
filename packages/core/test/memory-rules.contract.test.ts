import { memoryRules } from "../src/testing/memory-rules.js";
import { runRulesContract } from "../src/testing/rules-contract.js";

import type { Rule, RuleTarget } from "../src/connectors/types.js";

const RULES: readonly Rule[] = [
  { id: "contract/one-primary", question: "Is there one primary button?", appliesTo: "button" },
  {
    id: "contract/tone",
    question: "Is the copy plain?",
    appliesTo: "p",
    severity: "warn",
  },
];

const VIOLATING: readonly RuleTarget[] = [
  { rule: "contract/one-primary", html: "<button>Go</button>", anchor: { selector: "#a" } },
  { rule: "contract/tone", html: "<p>Synergise</p>", anchor: { selector: "#b" } },
];

const violation = (): string => "It breaks the rule.";

runRulesContract({
  name: "memory",
  create: () => Promise.resolve({ connector: memoryRules({ rules: RULES, violation }) }),
  createFailing: () =>
    Promise.resolve({ connector: memoryRules({ rules: RULES, failWith: new Error("down") }) }),
  violating: VIOLATING,
});

runRulesContract({
  name: "memory (no violations)",
  create: () => Promise.resolve({ connector: memoryRules({ rules: RULES }) }),
});
