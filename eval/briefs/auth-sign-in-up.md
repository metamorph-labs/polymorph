# Screen brief — Sign in and sign up

**Audience.** Someone arriving at the product: a returning customer, or a new one.

**What it has to do.**

- Sign in and sign up live on one screen. A returning person and a new one each reach their own
  form without leaving it, and the screen opens on whichever one the container asks for.
- Signing in asks for an email address and a password. Signing up also asks for a name, and says
  what the password has to be (at least twelve characters).
- Offer signing in with Google and with GitHub as well as with an email address.
- While a submission is pending, say so, and keep it from being sent twice.
- When the email address or password is wrong, say so above the form, without saying which.
- Offer a way to reset a forgotten password.

**What it must not do.**

- Invent a component. If the vocabulary cannot express something, that is a finding to report,
  not a `<div>` to write.
- Express any style. No colours, no spacing values, no class names.

**Notes.** The field values, which form is showing, the pending state, the error and every
handler are supplied by the container; the screen is composition only.
