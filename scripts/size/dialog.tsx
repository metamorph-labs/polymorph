import 'virtual:polymorph/theme'
import { Button, Dialog } from '@polymorph/react-ui'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <Dialog title="Delete ticket" trigger={<Button label="Delete" tone="danger" variant="solid" />}>
    This cannot be undone.
  </Dialog>,
)
