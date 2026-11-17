# Screen brief — Book a room

**Audience.** An employee booking a meeting room for a team discussion.

**What it has to do.**

- Ask for the room (one of a known list), the date, the start time, the length (30, 60 or 90
  minutes), the email addresses of the people invited, and an optional note for the invitation.
- The date cannot be in the past.
- Check on submit. Every field that is wrong says why, beside the field, and a summary at the
  top lists every problem and takes the person to the field it names.
- A primary action that books the room, and a way to cancel and leave.
- While the booking is being made, say so, and keep it from being made twice.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The values, the rooms, the errors and every handler are supplied by the container;
the screen is composition only.
