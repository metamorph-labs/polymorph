import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The rich-text boundary: the editing library stays inside the editor.
 *
 * ProseMirror is imported in `src/rich-text-editor/` and nowhere else, so a
 * page that only shows documents loads none of it, and the library can be
 * replaced by rewriting one directory. The document model does not import the
 * editor, so a server reads documents without it. No type either entry
 * exports names a ProseMirror type, so a member written against the two
 * contracts does not change when the library does.
 *
 * It lives at the package root, not in `src/`, because `src/**` is the
 * engine's browser project and this is a node test about files on disk.
 */

const PACKAGE = import.meta.dirname
const PACKAGES = resolve(PACKAGE, '..')
const EDITOR = resolve(PACKAGE, 'src/rich-text-editor')
const MODEL = resolve(PACKAGE, 'src/rich-text')
const ENTRIES = [resolve(MODEL, 'index.ts'), resolve(EDITOR, 'index.ts')]

const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/

function sources(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return SOURCE.test(entry.name) ? [path] : []
  })
}

/** Every module specifier a file names in an import, an export, a dynamic import or a require. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [
    ...text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g,
    ),
  ].map((match) => match[2] as string)
}

const PROSEMIRROR = /^prosemirror-[a-z-]+(?:\/|$)/

describe('the rich-text boundary', () => {
  it('imports the editing library only inside the editor', () => {
    const files = readdirSync(PACKAGES).flatMap((name) => sources(resolve(PACKAGES, name, 'src')))
    // The scan read the tree, so an empty list of offenders is meaningful.
    expect(files.length).toBeGreaterThan(1000)
    expect(files).toContain(resolve(MODEL, 'read.ts'))
    const offenders = files
      .filter((file) => !file.startsWith(`${EDITOR}/`))
      .flatMap((file) =>
        specifiers(file)
          .filter((specifier) => PROSEMIRROR.test(specifier))
          .map((specifier) => `${relative(PACKAGES, file)}: ${specifier}`),
      )
    expect(offenders).toEqual([])
  })

  it('keeps the document model free of the editor and of any package', () => {
    const files = sources(MODEL)
    expect(files).toContain(resolve(MODEL, 'index.ts'))
    const named = files.flatMap((file) =>
      specifiers(file).map((specifier) => `${relative(MODEL, file)}: ${specifier}`),
    )
    // Its own modules, and the Markdown parser's target cleaning. No package, and not the editor.
    const lawful = /: \.\/[a-z-]+$|: \.\.\/markdown\/parse$/
    expect(named.filter((entry) => !lawful.test(entry))).toEqual([])
    expect(named.filter((entry) => entry.includes('rich-text-editor'))).toEqual([])
  })

  it('names the editing library in no import of either entry’s index or types', () => {
    for (const file of ENTRIES.flatMap((entry) => [entry, resolve(entry, '../types.ts')])) {
      expect(
        specifiers(file).filter((specifier) => PROSEMIRROR.test(specifier)),
        file,
      ).toEqual([])
    }
  })

  /**
   * The exported types, read by the compiler: each export's type, and every
   * type it reaches through properties, parameters, return types, unions and
   * type arguments, down to the types the engine does not declare. A type
   * declared in a ProseMirror package is an offender. The walk is first run on
   * a probe that exports one, so a pass means the walk can see one.
   */
  it('exports no type that names a ProseMirror type', () => {
    const probe = resolve(EDITOR, '__boundary_probe__.ts')
    const probeSource = [
      "import type { EditorView } from 'prosemirror-view'",
      'export interface Probe { mount(): { view: EditorView } | null }',
    ].join('\n')

    const config = ts.getParsedCommandLineOfConfigFile(
      resolve(PACKAGE, 'tsconfig.json'),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    )
    if (config === undefined) throw new Error('rich-text boundary: no tsconfig.json')
    const options = { ...config.options, noEmit: true, incremental: false }
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile.bind(host)
    host.getSourceFile = (fileName, language, ...rest) =>
      fileName === probe
        ? ts.createSourceFile(fileName, probeSource, language)
        : getSourceFile(fileName, language, ...rest)
    const fileExists = host.fileExists.bind(host)
    host.fileExists = (fileName) => fileName === probe || fileExists(fileName)
    const program = ts.createProgram([...ENTRIES, probe], options, host)
    const checker = program.getTypeChecker()

    const own = (file: ts.SourceFile) => file.fileName.startsWith(`${resolve(PACKAGE, 'src')}/`)
    const fromProseMirror = (file: ts.SourceFile) =>
      /[\\/]node_modules[\\/](?:.*[\\/])?prosemirror-[a-z-]+[\\/]/.test(file.fileName)

    function offendersOf(entry: string): string[] {
      const file = program.getSourceFile(entry)
      const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
      if (module === undefined) throw new Error(`rich-text boundary: ${entry} is not a module`)
      const found = new Set<string>()
      const seen = new Set<ts.Type>()

      const walk = (type: ts.Type, via: string): void => {
        if (seen.has(type)) return
        seen.add(type)
        const symbols = [type.aliasSymbol, type.getSymbol()].filter(
          (symbol): symbol is ts.Symbol => symbol !== undefined,
        )
        const declarations = symbols.flatMap((symbol) => symbol.getDeclarations() ?? [])
        if (declarations.some((declaration) => fromProseMirror(declaration.getSourceFile()))) {
          found.add(`${via}: ${checker.typeToString(type)}`)
          return
        }
        for (const argument of type.aliasTypeArguments ?? []) walk(argument, via)
        if (type.isUnionOrIntersection()) for (const part of type.types) walk(part, via)
        if (
          type.flags & ts.TypeFlags.Object &&
          (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
        ) {
          for (const argument of checker.getTypeArguments(type as ts.TypeReference))
            walk(argument, via)
        }
        // Members are read only for a type the engine declares. A DOM or
        // standard-library type names nothing of the editing library.
        if (
          declarations.length > 0 &&
          !declarations.every((declaration) => own(declaration.getSourceFile()))
        )
          return
        for (const property of checker.getPropertiesOfType(type)) {
          const at = property.valueDeclaration ?? property.declarations?.[0]
          if (at !== undefined)
            walk(checker.getTypeOfSymbolAtLocation(property, at), `${via}.${property.name}`)
        }
        for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
          for (const parameter of signature.getParameters()) {
            const at = parameter.valueDeclaration ?? parameter.declarations?.[0]
            if (at !== undefined)
              walk(checker.getTypeOfSymbolAtLocation(parameter, at), `${via}(${parameter.name})`)
          }
          walk(signature.getReturnType(), `${via}()`)
        }
        for (const index of checker.getIndexInfosOfType(type)) walk(index.type, `${via}[]`)
      }

      for (const exported of checker.getExportsOfModule(module)) {
        const symbol =
          exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
        const at = symbol.valueDeclaration ?? symbol.declarations?.[0]
        if (symbol.flags & ts.SymbolFlags.Type)
          walk(checker.getDeclaredTypeOfSymbol(symbol), exported.name)
        if (symbol.flags & ts.SymbolFlags.Value && at !== undefined) {
          walk(checker.getTypeOfSymbolAtLocation(symbol, at), exported.name)
        }
      }
      return [...found]
    }

    expect(offendersOf(probe)).toEqual(['Probe.mount().view: EditorView'])
    for (const entry of ENTRIES) expect(offendersOf(entry), relative(PACKAGE, entry)).toEqual([])
  }, 60_000)
})
