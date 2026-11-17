import { resolve } from 'node:path'

import { gallerySlug } from '@polymorph/engine'
import { buildRegistry } from '@polymorph/registry'
import { memberSlug } from '@polymorph/registry/exceptions'
import { describe, expect, it } from 'vitest'

/**
 * Checks that two implementations of the slug rule agree. `gallerySlug` is in the engine, and
 * the fixtures and the identity attribute (`memberAttr`) use it. `memberSlug` is in the registry,
 * and the exceptions audit uses it. The registry sits below the engine and does not depend on it,
 * so the rule exists twice and this law keeps the copies in step. This app is the only package
 * allowed to import both, so the check lives here. It runs over every member name in the real
 * catalogue, not a sample, so a name on which the two disagree cannot ship.
 */
describe('memberSlug matches gallerySlug', () => {
  // A full ts-morph registry build takes about 1s alone, but exceeds the 5s default when the whole
  // suite's workers saturate the machine. The timeout covers contention, not the work itself.
  it('agrees for every member in the registry', { timeout: 60_000 }, () => {
    const registry = buildRegistry(resolve(import.meta.dirname, '../../..'))
    expect(registry.components.length).toBeGreaterThan(80)
    for (const component of registry.components) {
      expect(memberSlug(component.name), component.name).toBe(gallerySlug(component.name))
    }
  })
})
