# Screen brief — Deployment assistant

**Audience.** A developer asking an assistant about their deployment.

**What it has to do.**

- The conversation, oldest at the top, following the newest turn as it arrives. Every turn says
  who wrote it.
- When the assistant uses a tool (it can read logs and restart a service), its turn shows each
  call: what was called, whether it is running, finished or failed, and, when the developer asks,
  what went in and what came back.
- Before the assistant restarts anything, it asks in the conversation, and the developer allows
  or refuses it there.
- A place at the bottom to write a message, attach a file and send it. While a reply is still
  arriving, sending gives way to stopping the reply.
- An empty conversation says what the assistant can help with.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The turns, the tool calls, the draft, the streaming state and every handler are
supplied by the container; the screen is composition only.
