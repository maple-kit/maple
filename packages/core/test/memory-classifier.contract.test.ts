import { runClassifierContract } from "../src/testing/classifier-contract.js";
import { memoryClassifier } from "../src/testing/memory-classifier.js";

runClassifierContract({
  name: "memory",
  create: () => Promise.resolve({ connector: memoryClassifier() }),
});
