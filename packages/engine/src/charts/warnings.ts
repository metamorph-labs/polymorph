/**
 * Which of a chart model's warnings a member logs.
 *
 * A model reports its warnings on every derivation, and the list changes with
 * the data, the measured plot and the series the reader hides. A member logs a
 * message when it enters the list and not again while it stays there, so the
 * first measurement or a legend toggle does not repeat what the console
 * already shows. A message that leaves the list is forgotten, and is logged
 * again if it returns.
 *
 * React's `useDevWarnings` and every described chart hold one log per mounted
 * member.
 */
export interface WarningLog {
  /** Calls `warn` with each message of `messages` that the previous call's list did not hold. */
  log: (messages: readonly string[], warn: (message: string) => void) => void
}

export function createWarningLog(): WarningLog {
  let logged: ReadonlySet<string> = new Set()
  return {
    log: (messages, warn) => {
      const now = new Set(messages)
      for (const message of now) if (!logged.has(message)) warn(message)
      logged = now
    },
  }
}
