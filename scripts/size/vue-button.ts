import 'virtual:polymorph/theme'
import { Button } from '@polymorph/vue-ui'
import { createApp, h } from 'vue'

createApp({ render: () => h(Button, { label: 'Save' }) }).mount('#root')
