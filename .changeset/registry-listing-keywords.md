---
'@polymorph/engine': patch
'@polymorph/rules': patch
'@polymorph/recipes': patch
'@polymorph/react': patch
'@polymorph/react-ui': patch
'@polymorph/vue': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/elements': patch
'@polymorph/elements-ui': patch
'@polymorph/angular': patch
'@polymorph/angular-ui': patch
---

Each package's registry listing has `keywords`, which it had none of, and a description that
names the Polymorph design system. A vocabulary's description says it holds the system's
components for its framework. A search of the registry for a design system or for components in
a framework matches the packages by those words. No file a consumer imports changes.
