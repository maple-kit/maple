import { runMediaContract } from "../src/testing/media-contract.js";
import { memoryMedia } from "../src/testing/memory-media.js";

/** The reference connector runs the suite every media connector runs. */
runMediaContract({
  name: "memory",
  create: () => Promise.resolve({ connector: memoryMedia() }),
});
