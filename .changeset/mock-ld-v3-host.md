---
"@maple-kit/mock": patch
---

`launchDarklyFlags()` with no `baseUri` claims the 3.x browser SDK's default
host, `https://app.launchdarkly.com`, as well as 4.x's
`https://clientsdk.launchdarkly.com`. A page on `launchdarkly-react-client-sdk`
3.x had its flags neither read nor answered.
