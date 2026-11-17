/**
 * The registry's half of the member-exceptions law.
 *
 * The theme schema checks an exception's *shape*: family, class, step and the
 * required `because`. It cannot check whether `component` names an existing
 * member that reads the class token being re-pointed, because the theme sits
 * below the registry. This audit makes that check wherever the registry is
 * available. The registry's test suite runs it on every shipped system, the
 * studio shows its faults inline while a draft is edited, and the save
 * endpoint runs it again on each request.
 *
 * It is browser-safe (type-only imports, own subpath
 * `@polymorph/registry/exceptions`), so the studio runs it against the
 * generated registry.json it already loads.
 */

export interface ExceptionLike {
  component: string
  family: 'radius' | 'shadow' | 'inset'
  class: string
  step: string | number
  because: string
}

export interface MemberLike {
  name: string
  /** Every `--pm-*` the member's own stylesheet reads. */
  tokens: readonly string[]
}

/** The gallery slug. Every place that addresses a member uses this one rule. */
export function memberSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * Returns faults as sentences that the studio and the save endpoint show
 * verbatim. An empty list means every exception names a real member and a
 * token that member reads.
 */
export function auditExceptions(
  members: readonly MemberLike[],
  exceptions: readonly ExceptionLike[],
): string[] {
  const bySlug = new Map(members.map((member) => [memberSlug(member.name), member]))
  const faults: string[] = []

  for (const exception of exceptions) {
    const member = bySlug.get(exception.component)
    if (member === undefined) {
      faults.push(
        `exceptions: no member called '${exception.component}' — ` +
          'an exception addresses a component by its slug, and this one answers to nobody',
      )
      continue
    }

    const token = `--pm-${exception.family}-${exception.class}`
    if (!member.tokens.includes(token)) {
      faults.push(
        `exceptions: ${member.name} does not read ${token} — ` +
          're-pointing a class this member never wears would emit CSS that changes nothing',
      )
    }
  }

  return faults
}
