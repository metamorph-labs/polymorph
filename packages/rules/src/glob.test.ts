import { describe, expect, it } from 'vitest'

import { globToRegExp, matchesAny } from './glob'

describe('globToRegExp', () => {
  it('matches a path suffix, so repo-relative globs work on absolute paths', () => {
    const owns = ['packages/react-ui/src/components/app-shell/**']
    expect(matchesAny('packages/react-ui/src/components/app-shell/AppShell.tsx', owns)).toBe(true)
    expect(
      matchesAny('/home/me/repo/packages/react-ui/src/components/app-shell/shell.css', owns),
    ).toBe(true)
  })

  it('keeps `*` inside one segment and `**` across many', () => {
    expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true)
    expect(globToRegExp('src/*.ts').test('src/nested/a.ts')).toBe(false)
    expect(globToRegExp('src/**/*.ts').test('src/nested/deep/a.ts')).toBe(true)
    expect(globToRegExp('src/**/*.ts').test('src/a.ts')).toBe(true)
  })

  it('normalises windows separators', () => {
    expect(
      matchesAny('packages\\react\\src\\icon\\map.tsx', ['packages/react/src/icon/map.tsx']),
    ).toBe(true)
  })

  it('escapes regex metacharacters in literal path segments', () => {
    expect(matchesAny('apps/a.b/x.ts', ['apps/a.b/*.ts'])).toBe(true)
    expect(matchesAny('apps/axb/x.ts', ['apps/a.b/*.ts'])).toBe(false)
  })

  it('matches nothing when the owner list is empty', () => {
    expect(matchesAny('anything.ts', [])).toBe(false)
  })
})
