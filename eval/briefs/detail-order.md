# Screen brief — Order

**Audience.** A support agent looking at one customer's order while they talk to the customer.

**What it has to do.**

- Name the order and say where it stands (paid, shipped, delivered or refunded), with a way back
  to the list of orders.
- The facts about it: the customer, when it was placed, the total, the payment method and the
  shipping address.
- What has happened to it, newest first: each event with what happened, when, and who did it.
- The comments the support team left on it, each with its author and how long ago it was
  written, and a place to write a new one and post it.
- A refund, offered from the top of the page. Refunding is destructive, so it has to ask first
  and state the amount being refunded.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The order, its events, its comments, the draft comment and every handler are supplied
by the container; the screen is composition only.
