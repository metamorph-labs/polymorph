---
'@polymorph/cli': patch
---

`polymorph validate` refuses a `.json` file that is some other document than a screen spec (one
with neither a `spec` field nor a `root`), with exit code 2, where it answered a `package.json`
with the faults of a spec. `polymorph component <name> --framework <unknown>` is a refusal with
exit code 1, as `card` answers an unknown framework. The published tools' refusal to vendor into a
checkout names the release in the command it suggests.
