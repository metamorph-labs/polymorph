import { h, nextTick, reactive } from 'vue'

import {
  MASTER_DETAIL_ITEMS,
  masterDetailLaw,
  type MasterDetailLawProps,
} from '@polymorph/conformance/master-detail'

import { mount } from '../mount'
import MasterDetailPage from './MasterDetailPage.vue'

/**
 * MasterDetailPage's two arrangements and where its focus goes, in the Vue
 * shell (`design/archetypes/master-detail-page.md`), as
 * `@polymorph/conformance/master-detail` states them for every web shell.
 */
masterDetailLaw({
  shell: 'Vue',
  async mount({ props, onBack }) {
    const held = reactive<MasterDetailLawProps>({ ...props })
    await mount(() =>
      h('div', { style: { inlineSize: `${held.width}px`, blockSize: '480px' } }, [
        h(
          MasterDetailPage,
          {
            title: 'Support',
            listLabel: 'Tickets',
            emptyState: { title: 'No ticket selected' },
            backLabel: 'All tickets',
            onBack,
          },
          {
            actions: () => [h('button', { type: 'button' }, 'New ticket')],
            list: () => [
              h(
                'ul',
                MASTER_DETAIL_ITEMS.map((name) =>
                  h('li', { key: name }, [
                    held.buttons
                      ? h(
                          'button',
                          {
                            type: 'button',
                            'aria-current': held.current === name ? 'true' : undefined,
                          },
                          name,
                        )
                      : name,
                  ]),
                ),
              ),
            ],
            ...(held.detail
              ? { detail: () => [h('h2', 'Bravo'), h('button', { type: 'button' }, 'Reply')] }
              : {}),
          },
        ),
      ]),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
