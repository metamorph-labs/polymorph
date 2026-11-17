'use client'

import { useLayoutEffect, type ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import { Card } from '../structure/Card'
import styles from '@polymorph/recipes/archetypes/auth-page.module.css'
import { usePageTransition } from '../conventions/PageTransitions'

/**
 * The page outside the shell: sign-in, sign-up, a setup step, a status (`design/archetypes/auth-page.md`).
 *
 * It is the only screen family outside AppShell: a centred card on the app
 * background with no other structure. So it renders its own `<main>`. There is
 * no shell to provide the landmark, and without one the page's content would
 * be unreachable by landmark navigation.
 *
 * A page that only reports a status (not found, unavailable, a link that has
 * expired) and one step of a flow that runs before the shell (creating an
 * account, naming a workspace) are the same anatomy: a heading, a line of
 * context, and what the reader can do next. So they are this archetype, not
 * two more.
 *
 * It renders a title and a description, not a PageHeader. A PageHeader sits
 * above a screen the user works in. Auth is a single step, and its heading
 * belongs inside the card with the fields it introduces.
 */

export interface AuthPageProps {
  /** The layout, where `illustrated` is the public account layout with host-supplied artwork. */
  layout?: 'centered' | 'illustrated'
  illustration?: ReactNode
  transitionKey?: string
  pending?: boolean
  /** The product's wordmark, centred above the card. */
  brand?: ReactNode
  /** The `<h1>`. */
  title: string
  description?: ReactNode
  /** An accessible back control, when this step has a return destination. */
  backAction?: ReactNode
  /**
   * FormFields and the submit Button. On a status page, the notice and the
   * actions. Omitted when the title and description say everything and the
   * reader has nothing to do here.
   */
  children?: ReactNode
  /**
   * The line under the actions, inside the card (the login block's structure),
   * such as "Don't have an account? Sign up".
   *
   * It is inside the card, not under it, which is why it is a separate slot. A
   * sentence offering the other account action belongs to the form it is an
   * alternative to. Below the card it would float on the background, detached
   * from the form. `footer` keeps the outside position for page-level links.
   */
  cardFooter?: ReactNode
  /** A row of Links below the card, such as legal, support or a locale switch. */
  footer?: ReactNode
}

export function AuthPage({
  layout = 'centered',
  illustration,
  transitionKey,
  pending = false,
  brand,
  title,
  description,
  backAction,
  children,
  cardFooter,
  footer,
}: AuthPageProps) {
  const transition = usePageTransition(transitionKey, pending)
  const illustrated = layout === 'illustrated'
  useLayoutEffect(() => {
    if (!illustrated) return
    // Assign visual order without keying/remounting fields or changing their focus.
    transition.ref.current
      ?.querySelectorAll<HTMLElement>('[data-auth-enter]')
      .forEach((item, i) => {
        item.style.setProperty('--pm-page-enter-order', String(Math.min(i, 9)))
      })
  }, [illustrated, transitionKey, transition.ref])
  const card = (
    <div className={styles.card}>
      <div className={styles.heading} data-auth-enter="">
        <div className={[styles.titleRow, backAction && styles.withBack].filter(Boolean).join(' ')}>
          {backAction && <div className={styles.backAction}>{backAction}</div>}
          <h1 className={styles.title}>{title}</h1>
        </div>
        {description === undefined ? null : <p className={styles.description}>{description}</p>}
      </div>
      {children}
      {cardFooter === undefined ? null : <div className={styles.cardFooter}>{cardFooter}</div>}
    </div>
  )
  return (
    <main
      className={[styles.page, illustrated && styles.illustrated].filter(Boolean).join(' ')}
      aria-busy={pending ? true : undefined}
      data-auth-layout={layout}
      {...memberAttr('AuthPage')}
    >
      {illustrated && brand !== undefined && <div className={styles.topbar}>{brand}</div>}
      <div className={styles.body}>
        <div
          {...transition}
          className={[styles.column, transition.className].filter(Boolean).join(' ')}
        >
          {illustrated && illustration !== undefined && (
            <div className={styles.illustration} aria-hidden="true">
              {illustration}
            </div>
          )}
          <div className={styles.formColumn}>
            {!illustrated && brand !== undefined && <div className={styles.brand}>{brand}</div>}
            {illustrated ? <div className={styles.frame}>{card}</div> : <Card>{card}</Card>}
            {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
