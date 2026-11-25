---
'@polymorph/mcp': patch
---

**Every entry point starts the same server.** `serverFlags` reads the server's command line
(`[--project <path>] [--read-only]`, an unknown flag refused) and `serveStdio` starts the server
over stdio; the checkout's `polymorph-mcp` and the published tools' bins both use them.
`render_screen` reads a page built ahead of time when its context names one (`screenPage`), and
its advice for a missing browser is the entry point's (`browserSetup`, `checkoutBrowserSetup` for a
checkout). `browserAdvice` takes that setup where it took the checkout's path.
