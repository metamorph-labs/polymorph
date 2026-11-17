/*
 * The same component, lawful. Everything it needs comes from the boundary a
 * consumer installs, from a package they already have, or from a file that gets
 * copied alongside it.
 *
 * `src/fixtures.test.ts` asserts this stays green.
 */
import { dataAttrs, Icon, lawfulCells } from '@polymorph/react'
import { MotionSurface } from '@polymorph/react/motion'
import { useState } from 'react'

import { Kbd } from '../structure/Kbd'
import styles from './button.module.css'

export const Fine = () => {
  const [open] = useState(false)
  return (
    <MotionSurface binding="dialog.panel" className={styles.button} {...dataAttrs({ size: 'md' })}>
      <Icon name="add" />
      <Kbd>{open ? 'esc' : 'k'}</Kbd>
      {lawfulCells({}).length}
    </MotionSurface>
  )
}
