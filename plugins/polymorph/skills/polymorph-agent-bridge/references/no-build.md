# A page with no build

A page that loads the elements' no-build files, `polymorph.js` or `polymorph-all.js`, reaches the
bridge through its `data-agent` setting or through a module script of its own. Both files export
`loadAgentBridge()`, which resolves to
`@polymorph/engine/agent`, built with the members the page loaded.

## The setting

`<html data-agent="on-call">` or `"eager"` registers the three tools with the browser's WebMCP API
and creates a bridge with no `confirm` and no policy. The file reads the attribute once, as it
runs, so a value a script sets later is not read.

| The page loads | `on-call` fetches | `eager` fetches | `loadAgentBridge()` fetches |
| --- | --- | --- | --- |
| `polymorph.js` | two small chunks at load, the bridge on the first call | all three at load | the bridge's chunk |
| `polymorph-all.js` | nothing more | nothing more | nothing more |

A call that cannot load the bridge answers `{ error: { code: 'failed', message } }`, and the next
call loads it again. The console says why a setting registered nothing:

- `polymorph: data-agent="…" is neither on-call nor eager, so no agent tools are registered`
- `polymorph: registerWebMCP registers nothing, because data-agent="on-call" already registered the agent tools on this page`

## A module script

A page that asks a person, or narrows what an agent may do, states no `data-agent` and creates
its bridge in a module script:

```html
<script type="module">
  import { loadAgentBridge } from './polymorph/polymorph.js'

  const { createAgentBridge, registerWebMCP } = await loadAgentBridge()
  const bridge = createAgentBridge({
    confirm: (request) => Promise.resolve(window.confirm(`${request.action} “${request.name}”?`)),
    policy: { deny: (member) => member.member === 'Button' && member.name === 'Place order' },
  })
  registerWebMCP(bridge)
</script>
```

- Import it from the file the page loads, at the same path. A copy from anywhere else reads a
  registry of its own, which holds nothing.
- The elements register as they render, so a member whose code is still loading is not listed
  yet. Read the page when the agent asks, never once at load.
- A page that states `data-agent` and also calls `registerWebMCP` keeps the setting's
  registration: the second registers nothing and warns.
