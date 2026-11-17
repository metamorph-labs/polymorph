# Screen brief — API keys

The screen an agent is asked for in the agent-loop test (`docs/verification.md`).
Everything an agent is given is this file plus the system card (`pnpm registry` writes it to
`registry/system-card.md`); nothing else about the vocabulary, and no example.

---

**Audience.** A developer managing the API keys their integration uses.

**What it has to do.**

- Show the keys they have: a table of name, prefix, last used, and who created
  it. It has to be sortable by last used, because "what can I safely delete" is
  the question this screen exists to answer.
- Let them create one. A button in the page header.
- Let them revoke one. Revoking is destructive and irreversible, so it has to
  ask first, and the confirmation has to name the key being revoked.
- Say something useful when there are no keys yet — this is the first screen a
  new integration meets.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a
  finding to report, not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The keys, the sort state and every handler are supplied by the
container; the screen is composition only.
