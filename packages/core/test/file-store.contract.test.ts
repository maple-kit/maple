import { rm } from "node:fs/promises";

import { fileMedia } from "../src/connectors/file-media.js";
import { fileStore } from "../src/connectors/file-store.js";
import { runMediaContract } from "../src/testing/media-contract.js";
import { runStoreContract } from "../src/testing/store-contract.js";
import { scratch } from "./local-repo.js";

/** A directory outside any repository, so the key is the URL's and the root is the directory. */
function isolated(): { dir: string; cleanup: () => Promise<void> } {
  const made = scratch();
  return { dir: made.dir, cleanup: () => rm(made.dir, { recursive: true, force: true }) };
}

runStoreContract({
  name: "file",
  create: () => {
    const { dir, cleanup } = isolated();
    return Promise.resolve({ connector: fileStore({ cwd: dir, url: "localhost:3000" }), cleanup });
  },
});

runMediaContract({
  name: "file",
  create: () => {
    const { dir, cleanup } = isolated();
    return Promise.resolve({ connector: fileMedia({ cwd: dir, url: "localhost:3000" }), cleanup });
  },
});
