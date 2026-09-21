import { keywordClassifier } from "../src/connectors/keyword.js";
import { runClassifierContract } from "../src/testing/classifier-contract.js";

runClassifierContract({
  name: "keyword",
  create: () => Promise.resolve({ connector: keywordClassifier() }),
});
