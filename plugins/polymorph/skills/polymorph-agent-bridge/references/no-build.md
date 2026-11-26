# A page with no build

A page that loads the elements' no-build files, `polymorph.js` or `polymorph-all.js`, reaches the
bridge through its `data-agent` setting or through a module script of its own. Both files export
`loadAgentBridge()`, which resolves to
`@polymorph/engine/agent`, built with the members the page loaded.

## The setting

```html
<html lang="en" data-system="…" data-palette="…" data-agent="on-call">
```

| `data-agent` | The page |
| --- | --- |
| absent | registers nothing and fetches nothing more. Exposing a page is its owner's decision, so this is the default |
| `on-call` | registers the three tools with WebMCP at load, and fetches and creates the bridge on the first call |
| `eager` | fetches and creates the bridge at load, and registers its tools |

The bridge either value creates has no `confirm` and no policy, so a step that needs a person
answers `needs-confirmation`. The file reads the attribute once, as it runs, so a value a script
sets later is not read. In a browser without WebMCP neither value registers or fetches anything.

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
    // The page writes data-agent-key="place-order" on that poly-button.
    policy: { deny: ({ keys = [] }) => keys.includes('place-order') },
  })
  registerWebMCP(bridge)
</script>
```

The key is an attribute of the element: `<poly-button data-agent-key="place-order" label="…">`.
The element keeps it and draws no box, and its control is inside it, so the policy reads the key
in every language the label is written in.

- Import it from the file the page loads, at the same path. A copy from anywhere else reads a
  registry of its own, which holds nothing.
- The elements register as they render, so a member whose code is still loading is not listed
  yet. Read the page when the agent asks, never once at load.
- A page that states `data-agent` and also calls `registerWebMCP` keeps the setting's
  registration: the second registers nothing and warns.
