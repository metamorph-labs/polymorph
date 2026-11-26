import type { Registry } from '@polymorph/registry'

import { all, commands, either, Facts, skill, type SkillFile } from './facts'

export function rulesSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const ladder = registry.exceptions.ladder
    .map((rung) => {
      const declared =
        rung.declaredAs === null
          ? ''
          : ` (${rung.declaredAs
              .split('|')
              .map((name) => `\`${name.trim()}\``)
              .join(', ')})`
      return `${rung.rung}. **${rung.name}**${declared}: ${rung.summary}.`
    })
    .join('\n')
  const rules = registry.laws
    .filter((law) => law.applies === 'application')
    .map(
      (law) =>
        `| \`${law.name}\` | ${law.summary} | ${law.climb.length === 0 ? 'none' : law.climb.join(', ')} |`,
    )
  const body = `
# Answer a red rule

The red rules are lint rules that keep design decisions out of application code. Exceptions are
allowed when they are declared: a declared exception names its reason, where a reviewer can read
it. A silenced rule is not allowed. Never add \`eslint-disable\`, \`eslint-disable-next-line\`
or \`stylelint-disable\` for a polymorph rule, and never change a lint config to turn one off.

Every command in this skill starts with the same words, the polymorph tools run from a shell.
\`<framework>\` is the app's: the \`polymorph-screen\` skill says how to tell it. An MCP server
named \`polymorph\` does the same jobs through \`validate\` and \`fix\`, given the framework as
\`framework\`, and \`get_component\`.

## 1. Read what the rule says

${commands(run, 'validate src/App.tsx --framework <framework>')}

Each violation is a line with the file, the position, the rule and its message. Under it:

- \`fix\`: a rewrite with exactly one lawful answer.
- \`use\`: the members, props and tokens the message names, each with its rung.
- \`climb\`: every rung of the ladder that answers this rule.

## 2. Take the rewrite when there is one

${commands(run, 'fix src/App.tsx --dry-run --framework <framework>', 'fix src/App.tsx --framework <framework>')}

The first prints the fixed code, and the second writes it. The project's own \`eslint --fix\`
applies the same rewrites. A violation left after the fix is a decision: take the next step.

## 3. Climb the exception ladder

Take the first rung that works. Each rung is more governed than the next.

${ladder}

[references/ladder.md](references/ladder.md) has each rung's procedure, with code.

## 4. Which rungs answer which rule

| Rule | What it holds | Rungs |
| --- | --- | --- |
${rules.join('\n')}

Common cases:

- A colour, length or style on a member: find the prop that decides it with \`component <Name>\`,
  such as ${f.m('Button')}'s ${f.p('Button', 'variant')} and ${f.p('Button', 'tone')} or
  ${f.m('Stack')}'s ${f.p('Stack', 'gap')}. A spacing the scale lacks for one instance is a
  \`patch\` (rung 3). A one-off illustration is a ${f.m('Bespoke')} zone (rung 4).
- A raw control, or a click handler on a plain element: the member that is that control, such as
  ${all(['Button', 'Checkbox', 'Select', 'Input', 'Textarea'].map((name) => f.m(name)))}.
  \`search\` finds it by what it does.
- An icon set or an inline \`<svg>\`: ${f.m('Icon')} with a role from the card as its
  ${f.roleProp('Icon')}. A glyph no role names is a ${f.m('Bespoke')} zone until the vocabulary adds
  a role.
- A chart library: the chart members. A chart they cannot draw goes in a ${f.m('Bespoke')} zone.
- A motion library: members animate their own states. Motion the vocabulary has no member for goes
  in a ${f.m('Bespoke')} zone.
- A stylesheet import: delete it. Another library's own stylesheet is imported in the file that
  hosts the library inside ${f.m('ThirdParty')}.
- Another library's component, such as a map, an editor or a data grid: ${f.m('ThirdParty')}
  (rung 4).

## 5. When the same exception keeps coming back

A patch or a zone that recurs is promoted into the vocabulary or deleted (rung 5). That is a
decision for whoever owns the design system: tell the person you are working for, with the zones
and their reasons. Do not build a private copy of a member.
`
  return [
    {
      path: 'polymorph-rules/SKILL.md',
      contents: skill(
        'polymorph-rules',
        'Resolve a polymorph red-rule violation, a lint error whose rule starts with polymorph/ ' +
          'such as polymorph/no-raw-styles, polymorph/no-raw-interactive or polymorph/no-app-css, ' +
          'or a design need the polymorph vocabulary does not seem to cover. Use when ESLint, ' +
          'Stylelint, polymorph validate or polymorph check reports a polymorph/ rule, before ' +
          'adding any eslint-disable comment, and when a screen needs a style, a control, an ' +
          "icon, a chart, motion or another library's component that no member provides. Walks " +
          'the exception ladder rung by rung.',
        body,
      ),
    },
    { path: 'polymorph-rules/references/ladder.md', contents: ladderReference(registry, run) },
  ]
}

/**
 * Each rung's procedure. The procedure does not change with the vocabulary;
 * the members, props and values it names are read from the registry.
 */
function ladderReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const values = (member: string, prop: string) =>
    either(f.values(member, prop).map((value) => `\`${value}\``))
  const patches = f
    .patches()
    .map(
      ({ members, keys }) =>
        `${all(members.map((name) => f.m(name)))} ${members.length === 1 ? 'takes' : 'take'} ` +
        `${all(keys.map((key) => `\`${key}\``))}.`,
    )
    .join(' ')
  return `# The exception ladder, rung by rung

The examples are React. In Vue, Svelte and Solid the members have the same names and props. In
Angular a member is written by its selector (\`<pm-bespoke>\`, \`<pm-third-party>\`), and in a page
with no build as an element (\`<poly-bespoke>\`). A project that vendors members imports these from
its vendored directory and adds one with \`add\` (\`add bespoke\`, \`add third-party\`,
\`add density-scope\`, \`add tone-scope\`).

## Rung 1: variant selection

Every member exposes its range as typed props, such as a variant, a tone, a size and the spacing
steps. A value off the scale is a type error. Read the member first:

${commands(run, 'component Button --framework <framework>')}

The answer lists each prop's values and the variant and tone pairs that are lawful. Most needs end
here: a quieter button is ${f.v('Button', 'variant', 'ghost')}, a destructive one
${f.v('Button', 'tone', 'danger')}, and more room is a larger ${f.p('Stack', 'gap')}.

## Rung 2: ${f.m('DensityScope')} and ${f.m('ToneScope')}

A subtree re-assigns a decision the theme already makes for the whole page. Every value still comes
from the theme.

\`\`\`tsx
import { DensityScope, ToneScope } from '@polymorph/react-ui'

<DensityScope value="compact" as="section">
  <DataTable … />
</DensityScope>

<ToneScope value="inverse">
  …
</ToneScope>
\`\`\`

- ${f.m('DensityScope')}'s ${f.p('DensityScope', 'value')} is ${values('DensityScope', 'value')}.
  It changes space and the size of controls, never the type scale.
- ${f.m('ToneScope')}'s ${f.p('ToneScope', 'value')} is ${values('ToneScope', 'value')}: the
  surface, text and border roles of the opposite mode.
- ${f.p('DensityScope', 'as')} is ${values('DensityScope', 'as')}. A scope draws nothing of its own.

## Rung 3: an instance patch

One instance re-assigns token steps through its ${f.p('Stack', 'patch')} prop. Each value is a step
of a scale, never a length.

\`\`\`tsx
<Stack gap={6} patch={{ gap: 2 }}>…</Stack>
<Card patch={{ p: 4, radius: 'sm' }}>…</Card>
\`\`\`

${patches}

## Rung 4: a ${f.m('Bespoke')} zone or a ${f.m('ThirdParty')} boundary

${f.m('Bespoke')} declares a one-off composition the vocabulary has no member for. Its
${f.p('Bespoke', 'reason')} is required and is read by whoever reviews the code. Inside it the
application rules are lifted for plain elements: \`style\`, a \`className\`, raw values, raw controls
and inline \`<svg>\` are allowed there. A member inside it still takes no \`className\`. It draws
nothing itself, and the theme's tokens reach inside it, so write values as \`var(--pm-…)\`.

\`\`\`tsx
import { Bespoke } from '@polymorph/react-ui'

<Bespoke reason="Promo illustration: overlapping discs the vocabulary has no shape for.">
  <div style={{ padding: 'var(--pm-space-4)', background: 'var(--pm-accent-subtle)' }}>…</div>
</Bespoke>
\`\`\`

${f.m('ThirdParty')} hosts a component another library draws, such as a map, a rich-text editor or
a data grid. It takes ${f.p('ThirdParty', 'library')} and ${f.p('ThirdParty', 'reason')}. The file
that declares it may import that library and its stylesheet, and what it holds may take a
\`style\`. Give the library the theme as \`var(--pm-…)\`, or as values from \`useThemeValues()\` in
the framework's foundation package. Controls and icons around it stay members.

\`\`\`tsx
import { ThirdParty } from '@polymorph/react-ui'
import { MapView } from 'some-map-library'

<ThirdParty library="some-map-library" reason="Store finder map: no member draws a map.">
  <MapView center={center} />
</ThirdParty>
\`\`\`

Accessibility is never suspended, in a zone or anywhere else: a control in a zone still needs a name,
a role and a keyboard path.

## Rung 5: promotion

A patch or a zone that recurs is promoted into the vocabulary as a variant or a member, or it is
deleted. A one-off occurs once. Promotion is the design system owner's decision. Report the
recurring exception with its reasons, and keep each instance declared until then.
`
}
