import { Component, signal } from '@angular/core'

import {
  lightboxLaw,
  type LightboxLawMount,
  type LightboxLawProps,
} from '@polymorph/conformance/lightbox'

import { mountComponent } from '../mount'
import { Lightbox } from './Lightbox'

/**
 * How a Lightbox moves, where focus is at its ends, how it fits a picture and
 * where focus goes when it closes, in the Angular shell
 * (`design/components/lightbox.md`), as `@polymorph/conformance/lightbox`
 * states them for every web shell.
 */

/** The application around the lightbox: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-lightbox',
  imports: [Lightbox],
  template: `@if (law(); as law) {
    <pm-lightbox
      [defaultOpen]="true"
      label="Photographs"
      [defaultIndex]="law.defaultIndex"
      [images]="held().images"
      [index]="held().index"
      (indexChange)="law.onIndexChange($event)"
      (openChange)="law.onOpenChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the lightbox with. The lightbox is drawn once it is set. */
  readonly law = signal<LightboxLawMount | undefined>(undefined)
  readonly held = signal<LightboxLawProps>({ images: [], index: undefined })
}

lightboxLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.props)
    host.law.set(options)
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
