import { describe, expect, it } from 'vitest'

import { richTextHref } from './src/rich-text/index'

/**
 * Which link targets a rich-text document may hold (`richTextHref`). It lives
 * at the package root, not in `src/`, because `src/**` is the engine's browser
 * project and this function reads no document.
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const BASE = 'https://app.example/notes/1'

/** Targets written to get past a check: schemes split by what a browser ignores, other hosts dressed as paths. */
const HOSTILE = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'JAVASCRIPT:alert(1)',
  ' javascript:alert(1)',
  '\tjavascript:alert(1)',
  '\njavascript:alert(1)',
  '\u0001 javascript:alert(1)',
  ' \u0002\t javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java\rscript:alert(1)',
  'jav\u0000ascript:alert(1)',
  'javascript\u0000:alert(1)',
  'j\u0001a\u0002v\u0003a\u0004s\u0005c\u0006r\u0007i\u0008p\u0009t:alert(1)',
  ' javascript:alert(1)',
  '﻿javascript:alert(1)',
  'vbscript:msgbox(1)',
  'VBScript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'Data:text/html;base64,PHNjcmlwdD4=',
  'blob:https://app.example/1',
  'file:///etc/passwd',
  'ftp://files.example/x',
  'chrome://settings',
  'about:blank',
  '//evil.example/x',
  '\\\\evil.example/x',
  '/\\evil.example/x',
  '\\/evil.example/x',
  '/\t/evil.example/x',
  ' //evil.example/x',
  'evil.example/x',
  'x:y',
  ':nothing',
]

describe('richTextHref', () => {
  it('accepts the web, mail and telephone schemes, in any case', () => {
    for (const href of [
      'https://a.example/x?y=1#z',
      'http://a.example',
      'HTTPS://A.EXAMPLE/',
      'mailto:ada@a.example',
      'MailTo:ada@a.example?subject=hi',
      'tel:+44 20 7946 0000',
    ]) {
      expect(richTextHref(href), href).toBe(href)
    }
  })

  it('accepts a path inside the application', () => {
    for (const href of [
      '/',
      '/issues/42',
      '#section',
      '?tab=2',
      './sibling',
      '../parent',
      '/a:b',
    ]) {
      expect(richTextHref(href), href).toBe(href)
    }
  })

  it('refuses every other scheme, and a target a browser reads as another host', () => {
    for (const href of HOSTILE) expect(richTextHref(href), JSON.stringify(href)).toBeNull()
  })

  it('refuses nothing to follow', () => {
    for (const href of ['', '   ', '\u0000\u0001', 'word', 'page.html', '.', '..']) {
      expect(richTextHref(href), JSON.stringify(href)).toBeNull()
    }
    for (const value of [null, undefined, 42, {}, ['https://a.example']]) {
      expect(richTextHref(value)).toBeNull()
    }
  })

  it('keeps the target as a browser reads it: control characters out, ends trimmed', () => {
    expect(richTextHref('  https://a.example/x\n')).toBe('https://a.example/x')
    expect(richTextHref('https://a.exa\tmple/x')).toBe('https://a.example/x')
    expect(richTextHref('\u0001/issues/1')).toBe('/issues/1')
  })

  it('sends a browser only to a safe scheme, and keeps a path on the page’s host', () => {
    const corpus = [
      ...HOSTILE,
      ...HOSTILE.map((href) => href.toUpperCase()),
      ...HOSTILE.map((href) => `  ${href}  `),
      '/ok',
      '#ok',
      '?ok',
      './ok',
      '../ok',
      'https://ok.example',
      'mailto:ok@ok.example',
    ]
    for (const raw of corpus) {
      for (const typed of [false, true]) {
        const href = richTextHref(raw, { typed })
        if (href === null) continue
        const url = new URL(href, BASE)
        expect(SAFE_PROTOCOLS.has(url.protocol), `${JSON.stringify(raw)} → ${href}`).toBe(true)
        if (!/^[a-z][a-z\d+.-]*:/i.test(href)) {
          expect(url.host, `${JSON.stringify(raw)} → ${href}`).toBe('app.example')
        }
      }
    }
  })
})

describe('richTextHref for what a person typed', () => {
  const typed = (raw: string) => richTextHref(raw, { typed: true })

  it('reads a bare domain as https', () => {
    expect(typed('example.com')).toBe('https://example.com')
    expect(typed('www.example.co.uk/path?q=1#top')).toBe('https://www.example.co.uk/path?q=1#top')
    expect(typed('example.com:8080/x')).toBe('https://example.com:8080/x')
    expect(typed('  docs.example.org  ')).toBe('https://docs.example.org')
    expect(typed('bücher.de')).toBe('https://bücher.de')
    expect(typed('xn--bcher-kva.example.xn--p1ai')).toBe('https://xn--bcher-kva.example.xn--p1ai')
  })

  it('reads a bare email address as mailto', () => {
    expect(typed('ada@example.com')).toBe('mailto:ada@example.com')
    expect(typed('first.last+tag@mail.example.org')).toBe('mailto:first.last+tag@mail.example.org')
  })

  it('leaves a target that already says where it goes', () => {
    expect(typed('https://example.com')).toBe('https://example.com')
    expect(typed('mailto:ada@example.com')).toBe('mailto:ada@example.com')
    expect(typed('/issues/1')).toBe('/issues/1')
  })

  it('still refuses what is not a domain, an address or a safe target', () => {
    for (const raw of [
      'javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,x',
      'localhost:3000',
      'localhost',
      '1.5',
      'example',
      'example.com with spaces',
      'ada@localhost',
      'a@b@example.com',
      '//example.com',
    ]) {
      expect(typed(raw), raw).toBeNull()
    }
  })

  it('never rewrites a stored target', () => {
    expect(richTextHref('example.com')).toBeNull()
    expect(richTextHref('ada@example.com')).toBeNull()
  })
})
