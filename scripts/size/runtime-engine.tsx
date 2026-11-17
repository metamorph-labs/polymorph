import { admitTheme, installThemeCSS } from '@polymorph/engine'

import palette from '../../design/palettes/amethyst.json'
import system from '../../design/systems/pastel.json'

const admission = admitTheme({ system, palette })
if (admission.lawful) installThemeCSS(admission.css)
