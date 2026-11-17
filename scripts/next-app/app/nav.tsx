'use client'

import { Link } from '@polymorph/react-ui'
import { useRouter } from 'next/navigation'

/** The vocabulary's Link, routed by the App Router. */
export function Nav() {
  const router = useRouter()
  return (
    <Link href="/elements" onNavigate={(href) => router.push(href)}>
      Elements
    </Link>
  )
}
