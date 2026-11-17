# dew — rationale

> **A descriptive name, for a system argued from one use.** `harbor` shows that
> a tenant can be a JSON file. `dew` is a designed system whose every axis
> follows from one brief: calm, local-first software that is glanced at and
> left. Its identifying traits are the paper-and-water palette (the teal is a
> hue seed, not a brand swatch), a serif used only at display size, and the
> provenance row described below.

**Direction:** the morning register, for ambient software: background tools, a
summary ready each morning, a status light that changes when data leaves the
machine. Warm paper, one accent used only for action or state, a serif at
display size, and glass only on floating surfaces. Software meant to be glanced
at should take little time, so nothing asks for a second look.

**Why glass.** dew's emblem is a droplet: clear, small, and a lens onto
whatever is behind it. Desktops also separate chrome from content with material
(menu bar, sidebars, popovers), and `depth: glass` is the engine's only way to
express that. dew uses it with restraint: the glass law prices the pane at 96%
light / 91% dark, resting surfaces stay solid paper, and shadow is secondary.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `soft` | 4/8/14 radii, the desk reading, as in `desktop`. `round`'s 12 at `md` would look like a touch interface in a window, and `crisp` is flint's squarer, layered reading. |
| depth | `glass` | Transient panes (the command bar, menus, popovers, the consent sheet) go translucent over a blurred, saturated backdrop. The summary and the ledger rest on paper. This is dew's most visible difference from `desktop`. |
| density | `standard` | 36px `md`, the 8/12/16/24 ladder. A summary is read once a day and a ledger is scanned for minutes, so neither needs instrument density. Ledger tables take `compact` through a declared `DensityScope` (rung 2). |
| contrastTemperament | `standard` | Trust surfaces must be legible first: secondary text stays strong and hairlines sit at the ramp's step. `soft` is glassmorphic's layered-planes reading and would blur the rows that must stay clear: *allowed · denied · unknown*. |
| typePersonality | `grotesque` | Geist is a grotesque, so the chrome looks like chrome. Character comes from the display serif (below), used only at page scale: quiet at 13px, expressive at 40px. |
| colorStrategy | `quiet` | Neutral surfaces, with teal only where something is interactive, selected, or *left the machine*. A tinted wash would turn the accent into background. |
| motionTemperament | `subtle` | Ambient software should not draw the eye. A sheet that drops or a pane that springs would ask to be watched. |
| ornament | `none` | No decorative motion or texture. Glass's specular edge is material and the focus halo is accessibility, so neither counts. Grain or hover lift would clash with paper and glass. With depth and motion, this axis separates dew from `desktop` and `plain`. |

Divergence: 3 from `desktop` and `plain` (both reference-calibrated: depth,
motion, ornament), 5 from `glassmorphic`, `pebble`, `journal` and `pastel`, and
6 from `flint`, `harbor`, `pop`, `press` and `terminal`. The three-axis floor
holds against every house system without exemption.

## Seeds — `verdigris`

`accentHue 178 · neutralHue 80 · neutralTint 0.006 · chromaBudget medium`.

**The pigment.** Verdigris is the blue-green that weather leaves on copper. The
name follows the hue. It also fits dew's themes: a residue that remains, and a
historically transparent pigment for a system concerned with verifiability.

**Why 178°.** The band law keeps palettes 20° apart. `petrol` sits at 200 and
`success` at 150, and no palette uses the hues between. At 178 the accent reads
as teal beside the success green, and at `medium` rather than `petrol`'s `high`
it is calm rather than electric cyan. Light `accent.bg` resolves to `#009c86`.
Dark keeps the fill and lifts `accent.text` to `#73e2ca`.

**Why a warm neutral under a cool accent.** `neutralHue 80` seeds the neutrals
away from the accent, which is what the separate `neutralHue` seed is for. The
paper (`bg.subtle #f7f5f2`, `border.default #e7e5e1`, dark `bg.app #0b0a08`) is
warm stone under a cool accent, which keeps it from looking like a dashboard.
At `0.006` the warmth is a temperature, not a visible tint.

## Type

- **body**: Geist Variable, for its tabular figures in every ledger row: bytes
  out, bytes in, timestamps, digests.
- **display**: Fraunces Variable, upright, `fallback: serif`. Used only at the
  `display.*` steps (a morning greeting, onboarding's one sentence, an empty
  state), never in the chrome. `press` uses Fraunces *italic* for a newspaper
  look. dew uses it upright for a direct tone.
- **mono**: Geist Mono Variable, for handles, run ids, domains, digests and
  source. Ambient tooling shows a lot of mono, so it matches the body's cut.

## Composition the system carries

Three registers dew is designed around, as composition rules every screen on
the system follows.

**Trusted chrome is a reserved register.** The host application renders
consequential consent and must be recognisable as the host. Embedded content
can draw the same pixels but cannot hold the same authority. The register is
therefore a frame, not a colour. The consent sheet is an opaque `Dialog` with
the **seal** above the request: the droplet mark, the app's name, and a
sentence saying the app, not the tool, shows the request. The request is an
effective-authority list, never prose. Embedded tool UI lives in a labelled
pane (`Card` with the tool's name and its own provenance row), never in a
`Dialog`. Imitation remains possible, but embedded content cannot reach the
place where a real grant is made.

**Provenance is a fixed row, not a footnote.** Every card has one row with
*where it came from* (source badge with the connector's role icon), *when* (the
source timestamp), and *who produced it* (`rules · ran locally`, `local model`,
`cloud model`). The row is identical on a summary card, a run, a notification
and a ledger entry. A design without it is rejected.

**The status light has three states and one meaning.** At rest the droplet is
`text.secondary`: nothing has left. During an allowed transfer it fills with
the accent, then settles: something left, and the user can see what. On a
denial it flashes `danger` once: something tried. It never shows a count or
animates for attention, and one click opens the ledger. It is a camera
indicator for data, and the system's most identifying surface.

## Whose is this?

A light screen: warm paper, one teal where you can act, a serif greeting over
cards that each end in a provenance row, and a grey droplet in the menu bar. A
dark screen: the same on warm near-black, with glass panes lifting the command
bar. The palette and the provenance row identify it as *dew*.

## The shell

Five composition decisions for an app shell using dew.

**Home is a grid of cards.** It shows each tool's published view and the trust
strip, and grows as tools are added. The grid has four columns, dense flow and
five sizes (1×1, 2×1, 2×2, 4×1, 4×2), positioned by order. It has two states:
**cards** (the configured grid) and **icons** (sizes ignored, a launcher grid,
the default under 48rem).

**The ask bar is the primary interface, and it floats.** One input sits over
every page: ask in plain words, open a place, run a tool. A question opens a
conversation in its own tab, and several can run at once.

It is **a pane of glass, not a bar**: one row, no strip, no background, over
content that scrolls beneath it. This is where `depth: glass` does real work,
and why the system uses that axis. It sits in the shell's `dock` slot
(`design/archetypes/app-shell.md`), so it centres on the page, not the window,
and re-centres when the rail collapses. A page with a dock leaves room at its
foot so the last line can clear the glass. The status sentence (what runs
locally, what asks before going online) lives on the droplet, which is also
the working light, because a second line under the bar would stop it floating.

**Tabs, browser-style.** Every open thing is a tab: home, a summary, a tool, a
conversation, settings. New-tab, close-tab and open-in-tab shortcuts work as
they do everywhere.

**Plain, warm language everywhere.** The interface is for people, not runtime
builders. Precise terms (egress, projection, ledger) go in documentation and
tooltips. The screen says *what left this computer*, *who can read what*,
*fetched your mail*, *asks before going online*. Say what happens, not what it
is called. Use "allowed / blocked / not sure", never "granted / denied /
unknown". A tool "reads" and "sends". It does not "ingest" or "egress".

**Lead with what the reader came for.** A tool's page opens on what it can
reach, when it runs, and what it did recently, not on counters. Runtime cost
(times run, working time, bytes, space) is a quiet line at the foot, with the
detail one level deeper. A large number nobody asked for puts the interface
ahead of the reader.

## The watched-window register

When a tool drives a web page for the user, every page shown is untrusted
input. The register shows the tool's limits rather than its power.

**Reading is free. Doing needs approval.** Links and pages are open. Buy,
cancel, return, send and agree always need an explicit approval that names the
exact act.

**The window is a last resort.** If something already connected can answer,
the system uses it and says so. The pane's first step is usually "looked in
your mail first", the cheap, private path, shown even when it fails.

**You are watching.** The pane shows the host's address bar (never the site's
look), a watch badge, what was read as plain rows, and the click trail in
order. A convincing copy of the site would teach users to trust the wrong
things. A waiting state, when the site needs the person rather than the tool,
is a normal phase, not an error, and it says what happens next.

**Where consent lives.** The in-conversation card is the *plan*: what would be
done, what never would, who reads the page, what would leave the machine.
Opening the window raises **trusted chrome**, because a new site is a new
destination. What the window sends is logged in the ledger as its own kind.

**Asking twice is a bug.** An allowed site does not raise the sheet again.
Every allowance is visible and revocable in one place, so "stop asking" is not a
quieter interface but a memory the user can read and clear.
