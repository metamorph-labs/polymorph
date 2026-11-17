import { tick } from 'svelte'

import { pageTitleLaw } from '@polymorph/conformance/page-title'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import PageTitleHarness from '../testing/PageTitleHarness.svelte'

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard, in
 * the Svelte shell (`design/components/page-header.md`, A title edited in
 * place), as `@polymorph/conformance/page-title` states it for every web
 * shell.
 */
pageTitleLaw({
  shell: 'Svelte',
  async mount({ member, edit, props, onCommit, onEditingChange }) {
    const held = live({ member, edit, onCommit, onEditingChange, ...props })
    await render(PageTitleHarness, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
