import 'virtual:polymorph/theme'
import { Button } from '@polymorph/svelte-ui'
import { mount } from 'svelte'

mount(Button, { target: document.getElementById('root') as HTMLElement, props: { label: 'Save' } })
