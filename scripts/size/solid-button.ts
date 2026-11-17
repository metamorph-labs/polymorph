import 'virtual:polymorph/theme'
import { Button } from '@polymorph/solid-ui'
import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'

render(
  () => createComponent(Button, { label: 'Save' }),
  document.getElementById('root') as HTMLElement,
)
