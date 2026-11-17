/**
 * Deliberately unlawful — `packages/rules/src/inventory.test.ts` scans it and
 * expects the deviation. The ladder's failure mode, in one file: a rule turned
 * off by hand, with no `<Bespoke>` to account for it.
 *
 * This is the inventory law's own claim — an undeclared deviation goes red —
 * committed as a fixture so the repo stays green while the law does not.
 */
export function Sneaky() {
  return (
    <div>
      {/* eslint-disable-next-line polymorph/no-raw-interactive -- shipping, will fix */}
      <button type="button">Just this once</button>
    </div>
  )
}
