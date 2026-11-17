# Screen brief — Usage overview

**Audience.** A team lead checking how much of their plan the team has used.

**What it has to do.**

- Four headline numbers: requests, error rate, median latency, and seats used out of seats
  bought. Each says which way it moved since the previous period, and whether that is good.
- One chart: requests per day across the period, so a spike is visible at a glance.
- A way to switch the period between this month and last month.
- While the numbers load, hold the layout, so nothing jumps when they arrive.
- A way to download the period's usage as a file.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The numbers arrive already formatted, the daily series arrives as data, and the
period, the loading state and every handler are supplied by the container; the screen is
composition only.
