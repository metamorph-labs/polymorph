import { createSignal, For } from 'solid-js'

import { MASTER_DETAIL_ITEMS, masterDetailLaw } from '@polymorph/conformance/master-detail'

import { mount } from '../mount'
import MasterDetailPage from './MasterDetailPage'

/**
 * MasterDetailPage's two arrangements and where its focus goes, in the Solid
 * shell (`design/archetypes/master-detail-page.md`), as
 * `@polymorph/conformance/master-detail` states them for every web shell.
 */
masterDetailLaw({
  shell: 'Solid',
  async mount({ props, onBack }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <div style={{ 'inline-size': `${held().width}px`, 'block-size': '480px' }}>
        <MasterDetailPage
          title="Support"
          listLabel="Tickets"
          emptyState={{ title: 'No ticket selected' }}
          backLabel="All tickets"
          onBack={onBack}
          actions={<button type="button">New ticket</button>}
          list={
            <ul>
              <For each={MASTER_DETAIL_ITEMS}>
                {(name) => (
                  <li>
                    {held().buttons ? (
                      <button
                        type="button"
                        aria-current={held().current === name ? 'true' : undefined}
                      >
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </li>
                )}
              </For>
            </ul>
          }
          detail={
            held().detail ? (
              <>
                <h2>Bravo</h2>
                <button type="button">Reply</button>
              </>
            ) : undefined
          }
        />
      </div>
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
