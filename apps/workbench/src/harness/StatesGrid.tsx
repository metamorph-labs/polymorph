import type { ComponentStates } from '@polymorph/react'
import { Heading } from '@polymorph/react-ui'

import styles from './TokensPage.module.css'

/**
 * One component's states fixture as a column of named states. It is a separate module so the
 * gallery route and the Components detail page share the same chrome. It renders every entry in
 * declaration order, under the theme × mode × density the toolbar has applied.
 */
export function StatesGrid({ states }: { states: ComponentStates }) {
  return (
    <>
      {states.entries.map((entry) => (
        <section key={entry.name} className={styles.section}>
          <Heading>{entry.name}</Heading>
          {entry.expect ? (
            <p className={styles.sectionNote}>
              {Object.entries(entry.expect)
                .map(([attr, value]) => (value === null ? `no ${attr}` : `${attr}="${value}"`))
                .join(' · ')}
            </p>
          ) : null}
          {/* A block wrapper, so an entry lays out as it would on a page. The section is a
              column flexbox. Without this wrapper every control becomes a stretched flex item,
              and a Button would render 1100px wide. Layout fixtures still fill the width,
              because a block child of a block parent does. */}
          <div className={styles.entry}>{entry.render()}</div>
        </section>
      ))}
    </>
  )
}
