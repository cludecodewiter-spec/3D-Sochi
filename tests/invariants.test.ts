/**
 * Structural invariants, enforced by reading the source itself.
 *
 * These are rules about the *shape* of the codebase, which no ordinary
 * runtime test can guard. Every one of them had already been broken once.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory()
      ? filesUnder(full)
      : full.endsWith('.ts')
        ? [full]
        : []
  })
}

/** Prose talks about "documents" and "windows"; only code counts. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const code = (file: string): string => stripComments(readFileSync(file, 'utf8'))
const name = (file: string): string => relative(ROOT, file).split(sep).join('/')

const offendersIn = (dirs: string[], pattern: RegExp): string[] =>
  dirs
    .flatMap((dir) => filesUnder(join(SRC, dir)))
    .filter((file) => pattern.test(code(file)))
    .map(name)

describe('layering (DESIGN §9.5)', () => {
  it('engine, systems and content never touch the DOM', () => {
    expect(
      offendersIn(
        ['engine', 'systems', 'content'],
        /\b(document|window|localStorage|sessionStorage|navigator|alert)\s*[.[]/,
      ),
    ).toEqual([])
  })

  it('content never imports systems', () => {
    expect(offendersIn(['content'], /from '\.\.\/systems\//)).toEqual([])
  })

  it('engine never imports systems or content', () => {
    expect(offendersIn(['engine'], /from '\.\.\/(systems|content)\//)).toEqual([])
  })

  it('systems never import the UI', () => {
    expect(offendersIn(['systems'], /from '\.\.\/ui\//)).toEqual([])
  })
})

describe('the hidden field stays hidden (DESIGN §6.5)', () => {
  it('no UI code reads IntelItem.truth', () => {
    // The dossier and the reliability numbers are derived from `outcome`,
    // which records only what the player witnessed. Reading `truth` anywhere
    // in the UI would hand them the one answer the game is built on hiding.
    expect(offendersIn(['ui'], /\.truth\b/)).toEqual([])
  })
})

describe('randomness is reproducible (DESIGN §9.3)', () => {
  it('the simulation draws only from Rng', () => {
    // Two deliberate exceptions, both outside the simulation:
    //   systems/game.ts — picks the seed for a brand-new game
    //   ui/audio.ts     — fills a white-noise buffer; not game state, and
    //                     not something a save has to reproduce
    const allowed = new Set(['src/systems/game.ts', 'src/ui/audio.ts'])
    const offenders = filesUnder(SRC)
      .filter((file) => /Math\.random\(/.test(code(file)))
      .map(name)
      .filter((file) => !allowed.has(file))
    expect(offenders).toEqual([])
  })

  it('and the seed picker is the only unseeded draw in systems/', () => {
    const draws = code(join(SRC, 'systems', 'game.ts')).match(/Math\.random\(/g) ?? []
    expect(draws).toHaveLength(1)
  })
})
