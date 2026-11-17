# Screen brief — Onboarding

**Audience.** A new customer setting up their account for the first time.

**What it has to do.**

- Setting up takes four steps, in order: profile, team, integrations, and done. Show all four,
  which one they are on, and which are finished.
- This screen is the profile step. It asks for their name, their role (one of a short list) and,
  optionally, a photo.
- Continue moves to the next step, and is unavailable until the name and the role are filled
  in. Back is unavailable, because this is the first step.
- Let them leave setup and finish it later, without losing what they entered.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The values, which steps are finished and every handler are supplied by the
container; the screen is composition only.
