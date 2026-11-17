# Screen brief — Workspace settings

**Audience.** The owner of a team workspace, adjusting how it behaves for everyone in it.

**What it has to do.**

- Group the settings into titled sections:
  - general: the workspace name, and the time zone dates are shown in;
  - notifications: whether members get an email digest, and how often (daily or weekly);
  - access: whether members may invite other people.
- Every setting says, in one line beside its control, what it changes.
- End with a danger zone, set apart from the rest: transfer ownership to another member, and
  delete the workspace. Deleting is irreversible, so it has to ask first, name the workspace,
  and say that every project in it is deleted too.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** Changes apply the moment they are made, so there is no save action. Every value and
handler is supplied by the container; the screen is composition only.
