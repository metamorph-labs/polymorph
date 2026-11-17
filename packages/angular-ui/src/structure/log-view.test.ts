import { Component, signal } from '@angular/core'

import { logViewLaw, type LogViewLawProps } from '@polymorph/conformance/log-view'

import { mountComponent } from '../mount'
import { LogView } from './LogView'

/**
 * How a LogView follows its newest line, and what it says, in the Angular
 * shell (`design/components/log-view.md`), as `@polymorph/conformance/log-view`
 * states it for every web shell.
 */

/** The props the next mount starts with, read when the application component is made. */
let first: LogViewLawProps = { lines: [] }

/**
 * The application around the log: it holds the props the law sets. It draws no
 * box of its own, so the log fills the mount's element, which the law sizes.
 */
@Component({
  selector: 'test-held-log-view',
  imports: [LogView],
  host: { style: 'display: contents' },
  template: `<pm-log-view
    label="Build output"
    [lines]="held().lines"
    [streaming]="held().streaming"
    [wrap]="held().wrap"
  />`,
})
class Held {
  readonly held = signal<LogViewLawProps>(first)
}

logViewLaw({
  shell: 'Angular',
  async mount(props) {
    first = props
    const { host, ref } = await mountComponent(Held)
    const held = (ref.instance as Held).held
    return {
      host,
      set(next) {
        held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
