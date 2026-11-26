---
'@polymorph/engine': patch
'@polymorph/tools': patch
---

A page names a member for its agent policy with a key that stays the same in every language and
on every mount. The page writes `data-agent-key` on an element around the member, or on a
`poly-*` element itself, and the policy reads `keys`: the key of that element and of each element
around it, the nearest first. `policy.hide`, `policy.deny`, `confirm`'s request and the change
event's detail carry `keys`; no snapshot, query, step result or tool output does. No member takes
a new prop, so every renderer reads keys alike. `AGENT_KEY_ATTRIBUTE` from
`@polymorph/engine/agent` names the attribute.

`registerWebMCPOnCall({ bridge })` runs the WebMCP tools on a bridge the page already has, such as
its assistant's, or on the one a function returns when the first tool call arrives, so the page
can load that bridge on its first use. Unregistering removes the tools and leaves that bridge as it
is. `registerWebMCPOnCall(load, options)` creates and disposes of its own bridge as before.

`@polymorph/engine/webmcp` exports `AGENT_TOOL_DEFINITIONS`, the three tools' names, titles,
descriptions, input schemas and hints, so a page's assistant can send its model the tools before
it loads the bridge.

The `polymorph-agent-bridge` skill uses all three: a policy that names a member by its key, one
bridge shared by the assistant and WebMCP with no stand-in module, and the definitions sent before
the bridge loads.
