#!/usr/bin/env node
/**
 * The source form of a Solid package, made fully specified:
 * `node packages/solid/scripts/source.mjs <package>`, run after
 * `tsc -p tsconfig.source.json` has written `dist/source/`, the form the
 * `solid` export condition names.
 *
 * TypeScript keeps each relative specifier as the source wrote it
 * (`./conventions/media`). A bundler that reads a `"type": "module"` package
 * by Node's rules (webpack's `fullySpecified`) resolves no specifier without
 * its file's extension. So each relative specifier becomes the file the emit
 * wrote: a TypeScript module's `.js`, a TSX module's `.jsx`, and a
 * directory's `index.js`. A specifier that already names a file (a
 * stylesheet) stays.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const SOURCE = join(resolve(process.argv[2] ?? '.'), 'dist', 'source')

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const isFile = (path) => existsSync(path) && statSync(path).isFile()

/** A relative specifier as the emitted file it names, or as it is when no emitted file matches. */
function specified(from, specifier) {
  const target = resolve(dirname(from), specifier)
  if (isFile(target)) return specifier
  for (const extension of ['.js', '.jsx']) {
    if (isFile(`${target}${extension}`)) return `${specifier}${extension}`
  }
  for (const index of ['index.js', 'index.jsx']) {
    if (isFile(join(target, index))) return `${specifier}/${index}`
  }
  return specifier
}

/** Every relative module specifier in a module's text, made fully specified. */
function rewrite(from, text) {
  return text.replace(
    /(\bfrom\s+|\bimport\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, lead, quote, specifier) => `${lead}${quote}${specified(from, specifier)}${quote}`,
  )
}

for (const file of filesUnder(SOURCE).filter((path) => /\.jsx?$/.test(path))) {
  const text = readFileSync(file, 'utf8')
  const next = rewrite(file, text)
  if (next !== text) writeFileSync(file, next)
}
