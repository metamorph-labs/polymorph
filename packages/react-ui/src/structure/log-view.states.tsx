import { type ComponentStates } from '@polymorph/react'
import type { ReactNode } from 'react'
import { LogView, type LogLine } from './LogView'
import styles from '@polymorph/recipes/structure/log-view.module.css'

/**
 * States fixture, from `design/components/log-view.md`'s States table.
 *
 * The log fills its box. Entries about scrolling and following render inside a
 * fixed-height harness (ScrollArea's pattern). Entries about the lines render
 * without a box and grow to fit them.
 */

/** A build's output: plain lines, a warning and two errors, as a bundler writes them. */
export const BUILD: LogLine[] = [
  { id: 'b1', text: '> relay@2.4.0 build' },
  { id: 'b2', text: '> vite build' },
  { id: 'b3', text: 'vite v6.3.5 building for production...' },
  { id: 'b4', text: '1284 modules transformed.' },
  {
    id: 'b5',
    level: 'warning',
    text: "src/legacy/chart.ts (14:3): 'Chart' is defined but never used.",
  },
  { id: 'b6', text: 'dist/index.html                 0.48 kB  gzip:   0.31 kB' },
  { id: 'b7', text: 'dist/assets/index-4f2a9c.css   38.12 kB  gzip:   7.90 kB' },
  {
    id: 'b8',
    level: 'error',
    text: "src/inbox/InboxPage.tsx (88:17): Property 'assignee' does not exist on type 'Ticket'.",
  },
  { id: 'b9', level: 'error', text: 'Build failed in 4.21s.' },
]

/** A service's logs: every line has a time, a level and the service that wrote it. */
export const SERVICES: LogLine[] = [
  {
    id: 's1',
    time: '14:24:01.118',
    level: 'info',
    source: 'svc-web',
    text: 'GET / 200 96ms cache=edge',
  },
  {
    id: 's2',
    time: '14:24:03.402',
    level: 'warning',
    source: 'svc-api',
    text: 'slow query 1840ms: SELECT id, status FROM orders WHERE status = $1',
  },
  {
    id: 's3',
    time: '14:24:05.733',
    level: 'info',
    source: 'svc-worker',
    text: 'job billing.settle done in 412ms attempts=1',
  },
  {
    id: 's4',
    time: '14:24:08.019',
    level: 'error',
    source: 'svc-api',
    text: 'pg: connection reset by peer (pool=replica attempt=1)',
  },
  {
    id: 's5',
    time: '14:24:09.250',
    level: 'info',
    source: 'svc-web',
    text: 'GET /api/session 200 12ms',
  },
]

/** Forty lines of a deploy, more than the harness holds, so the log scrolls and follows. */
export const DEPLOY: LogLine[] = Array.from({ length: 40 }, (_, at) => ({
  id: `d${at + 1}`,
  time: `+${String(at * 3).padStart(3, '0')}s`,
  text: `step ${at + 1} of 40: uploaded packages/relay/dist/chunk-${at + 1}.js`,
}))

/** Lines with no break in them and a table whose columns line up, wider than any box. */
export const WIDE: LogLine[] = [
  { id: 'w1', text: 'PID   USER     %CPU  %MEM  COMMAND' },
  { id: 'w2', text: '4120  relay    12.4   3.1  node dist/server.js --port 8080 --workers 4' },
  { id: 'w3', text: '4188  relay     0.3   0.4  node dist/worker.js --queue jobs-prod' },
  {
    id: 'w4',
    level: 'warning',
    text: `signing_key=whsec_${'JBSWY3DPEHPK3PXP'.repeat(8)}`,
  },
]

/** ScrollArea's harness pattern: a fixed-height box for the log to fill. */
function Boxed({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className={narrow ? styles.harnessNarrow : styles.harness}>{children}</div>
}

export const states: ComponentStates = {
  component: 'LogView',

  entries: [
    {
      name: 'build output — plain lines, a warning and two errors',
      render: () => <LogView label="Build output" lines={BUILD} />,
      expect: { 'data-state': null, 'data-streaming': null, 'data-wrap': '' },
    },
    {
      name: 'service logs — a time, a level and a source on every line',
      render: () => <LogView label="Service logs" lines={SERVICES} />,
    },
    {
      name: 'streaming — more lines coming, a caret after the last',
      render: () => <LogView label="Build output" lines={BUILD.slice(0, 4)} streaming />,
      expect: { 'data-streaming': '' },
    },
    {
      name: 'waiting — streaming with no lines yet',
      render: () => <LogView label="Build output" lines={[]} streaming />,
      expect: { 'data-streaming': '' },
    },
    {
      name: 'in a box — the log scrolls inside itself, held at the newest line',
      render: () => (
        <Boxed>
          <LogView label="Deploy log" lines={DEPLOY} />
        </Boxed>
      ),
    },
    {
      name: 'unwrapped — long lines scroll the log sideways',
      render: () => (
        <Boxed>
          <LogView label="Process list" lines={WIDE} wrap={false} />
        </Boxed>
      ),
    },
    {
      name: 'narrow — long lines wrap in a phone’s column',
      render: () => (
        <Boxed narrow>
          <LogView label="Process list" lines={WIDE} />
        </Boxed>
      ),
    },
  ],

  /*
   * `detached` is set by the reader scrolling up, which no prop reaches. The
   * stylesheet keys the jump control on it. Focus comes from the keyboard,
   * because the region is a tab stop while it overflows.
   */
  requiredSelectors: [':focus-visible', '[data-state="detached"]'],
}
