import {
  MASTER_DETAIL_ITEMS,
  masterDetailLaw,
  type MasterDetailLawProps,
} from '@polymorph/conformance/master-detail'
import { create } from '@polymorph/elements'

import { mountNodes } from '../mount'
import './MasterDetailPage'

/** A `<button type="button">` the page wrote, named by its text. */
const button = (name: string, slot?: string) =>
  create('button', { type: 'button', slot }, [name]) as unknown as HTMLButtonElement

/**
 * MasterDetailPage's two arrangements and where its focus goes, as an element
 * (`design/archetypes/master-detail-page.md`), as
 * `@polymorph/conformance/master-detail` states them for every web shell.
 *
 * The element is made as a page's script makes one, in a box whose width the
 * law sets. The actions' button is a child in the `actions` slot and the list
 * a `<ul>` in the `list` slot, whose items the page changes in place. The
 * detail is two children in the `detail` slot: the page appends them to the
 * element when a detail is given and removes them from the element
 * (`removeChild`) when it is taken away.
 */
masterDetailLaw({
  shell: 'Elements',
  async mount({ props, onBack }) {
    const held: MasterDetailLawProps = { ...props }
    const items = MASTER_DETAIL_ITEMS.map((name) => ({
      name,
      item: create('li') as unknown as HTMLLIElement,
      control: button(name),
    }))
    /** Draws each item as a button or as text, with the current one marked. */
    const drawList = () => {
      for (const { name, item, control } of items) {
        if (held.current === name) control.setAttribute('aria-current', 'true')
        else control.removeAttribute('aria-current')
        const content = held.buttons ? control : name
        if (item.firstChild !== content && item.textContent !== content) {
          item.replaceChildren(content)
        }
      }
    }
    drawList()
    const list = create(
      'ul',
      { slot: 'list' },
      items.map(({ item }) => item),
    )
    const heading = create('h2', {}, ['Bravo']) as unknown as HTMLHeadingElement
    const reply = button('Reply')
    const detail = [heading, reply]
    for (const node of detail) node.slot = 'detail'
    const page = create(
      'poly-master-detail-page',
      {
        title: 'Support',
        listLabel: 'Tickets',
        emptyState: { title: 'No ticket selected' },
        backLabel: 'All tickets',
        onBack,
      },
      [button('New ticket', 'actions'), list, ...(held.detail ? detail : [])],
    ) as unknown as HTMLElement
    const box = create('div', {}, [page]) as unknown as HTMLElement
    const size = () => {
      box.style.inlineSize = `${held.width}px`
      box.style.blockSize = '480px'
    }
    size()
    await mountNodes(box)
    return {
      set(next) {
        const had = held.detail
        Object.assign(held, next)
        size()
        drawList()
        if (held.detail && !had) {
          // A child taken out through the element keeps its `slot` attribute.
          page.append(...detail)
        } else if (!held.detail && had) {
          for (const node of detail) page.removeChild(node)
        }
      },
    }
  },
})
