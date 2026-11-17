import 'virtual:polymorph/theme'
import { createAgentBridge, registerWebMCP } from '@polymorph/engine/agent'
import { Button, Checkbox } from '@polymorph/react-ui'
import { createRoot } from 'react-dom/client'

const bridge = createAgentBridge({
  confirm: (request) => window.confirm(`Allow ${request.action} on ${request.name}?`),
})
registerWebMCP(bridge)

createRoot(document.getElementById('root')!).render(
  <>
    <Checkbox label="Email me about replies" />
    <Button label="Save" />
  </>,
)
