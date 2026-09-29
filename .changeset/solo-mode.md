---
"@maple-kit/core": minor
"@maple-kit/cli": minor
"@maple-kit/mcp": minor
"@maple-kit/ui": minor
---

Solo mode: a guest on a preview who cannot sign in can keep their comments on the machine that runs their agent. `maple solo <preview-url>` (and the new MCP tool `start_solo`) starts a bridge on `127.0.0.1` in front of the file store and prints `<preview-url>#maple-solo=<token>&maple-bridge=<address>`. The overlay reads the fragment as its script runs, removes it with `history.replaceState`, keeps the pairing in `localStorage` under the same guard as drafts, and posts comments and screenshots to the bridge as real comments in `.maple/<branch>/`. The bridge serves only requests that carry the token, from the paired origin, addressed to a loopback name. An unpaired overlay never requests localhost and shows one line offering `maple solo`. `docs/solo.md` has the design, including why solo cannot gate a merge.

New: `startBridge` and `refusalFor` in `@maple-kit/core/local`; `capturePairing`, `forgetPairing`, `parsePairing`, `soloLink` in `@maple-kit/core/client`; `MapleClient.endSolo()` and `ClientState.solo`; `SoloOffer` in `@maple-kit/ui/island`; `start_solo` in `@maple-kit/mcp`.

Breaking: `ClientState` has a new required `solo` field, and `MapleClient` a new required `endSolo` method, for anyone who implements either.
