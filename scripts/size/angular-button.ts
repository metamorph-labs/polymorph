import 'virtual:polymorph/theme'
import { ApplicationRef, createComponent, provideZonelessChangeDetection } from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import { Button } from '@polymorph/angular-ui'

// What `<pm-button label="Save" />` in an application's root component renders.
const application = await createApplication({ providers: [provideZonelessChangeDetection()] })
const button = createComponent(Button, {
  environmentInjector: application.injector,
  hostElement: document.getElementById('root') as HTMLElement,
})
button.setInput('label', 'Save')
application.injector.get(ApplicationRef).attachView(button.hostView)
