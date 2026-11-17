# Screen brief — Incidents

**Audience.** An on-call engineer triaging the incidents their services raised.

**What it has to do.**

- Show the incidents: a row each, with the title, the service, the severity, whether it is
  open or resolved, and when it opened. Newest first by default, and sortable by when it opened.
- Let them narrow the list: a search over titles, and filters for severity and for open or
  resolved. Say how many incidents match, and offer one way to clear every filter at once.
- Let them delete an incident. Deleting is destructive and cannot be undone, so it has to ask
  first, and the confirmation has to name the incident being deleted.
- Say something useful when nothing matches the filters, and something different when there
  are no incidents at all.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The incidents, the filter values, the sort and every handler are supplied by the
container; the screen is composition only.
