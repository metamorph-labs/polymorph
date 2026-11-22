import { useEffect, useState } from 'react'

import styles from './route-announcer.module.css'

/**
 * Says the new page's title to a screen reader when the route changes.
 *
 * The router changes the address without loading a document, so nothing tells
 * a screen reader that the page is another one. Each page sets the document's
 * title (`meta.ts`), some after their chunk has loaded, so this watches the
 * title itself and repeats it in a polite live region. The title the document
 * arrived with is not said, because the screen reader reads that one itself.
 *
 * It is in the harness because the region is seen by nobody, and hiding it
 * takes a stylesheet, which application code does not have.
 */
export function RouteAnnouncer() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const title = document.querySelector('title')
    if (!title) return
    let said = document.title
    const observer = new MutationObserver(() => {
      if (document.title === said) return
      said = document.title
      setMessage(said)
    })
    observer.observe(title, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
