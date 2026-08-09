/**
 * Content integrity.
 *
 * These guard a whole class of bug that never throws and never logs: content
 * that silently fails to resolve. Benny's hangout was written as 港口区 while
 * the map only knows 码头区, so `districtOf` returned undefined and the pin
 * loop just `continue`d — the slice's most important informant simply was not
 * on the map, and nothing anywhere said so.
 */

import { describe, expect, it } from 'vitest'
import { DISTRICTS, districtOf } from '../src/ui/art/map.js'
import { VEHICLES } from '../src/content/vehicles.js'
import { INFORMANTS } from '../src/content/informants.js'
import { HEIST_CONFIG } from '../src/content/heist.js'
import { INTEL_TEMPLATES } from '../src/content/intel.js'
import { UNLOCKS, ADVISOR_LINES, UNLOCK_SPACING } from '../src/content/unlocks.js'
import { TUTORIAL_TARGET, BETRAYAL } from '../src/content/script.js'
import { FENCE_CHANNELS } from '../src/content/balance.js'
import { VENUE_LABELS } from '../src/content/types.js'
import type { BodyType, RoleKey, VenueKey } from '../src/content/types.js'
import { ROLE_GLYPHS, VEHICLE_GLYPHS, VENUE_GLYPHS, iconSvg } from '../src/ui/art/icons.js'
import { venueScene } from '../src/ui/art/scene.js'
import { VENUE_BADGE, VENUE_PHOTO } from '../src/content/types.js'
import { BADGE_PATHS, PORTRAIT_COUNT, portraitKey } from '../src/ui/art/photo.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('every location resolves to a district on the map', () => {
  it('for every vehicle', () => {
    const orphans = VEHICLES.filter((v) => !districtOf(v.location)).map((v) => v.name)
    expect(orphans).toEqual([])
  })

  it('for every informant hangout', () => {
    const orphans = INFORMANTS.filter((i) => !districtOf(i.hangout)).map((i) => i.name)
    expect(orphans).toEqual([])
  })

  it('and district ids are unique', () => {
    expect(new Set(DISTRICTS.map((d) => d.id)).size).toBe(DISTRICTS.length)
  })
})

describe('content references resolve', () => {
  it('the tutorial target exists', () => {
    expect(VEHICLES.some((v) => v.id === TUTORIAL_TARGET)).toBe(true)
  })

  it('the betrayal points at a real informant and a real template', () => {
    expect(INFORMANTS.some((i) => i.id === BETRAYAL.informantId)).toBe(true)
    const template = INTEL_TEMPLATES.find((t) => t.id === BETRAYAL.secondTipTemplate)
    expect(template).toBeDefined()
    // The scripted lie has to actually read as the ambush setup.
    expect(template!.falseText).toContain('两个看守')
  })

  it('every intel template targets a real heist segment', () => {
    const segments = new Set(HEIST_CONFIG.segments.map((s) => s.id))
    for (const template of INTEL_TEMPLATES) {
      expect(segments.has(template.segmentId)).toBe(true)
    }
  })

  it('every intel template substitutes the target name in all three phrasings', () => {
    for (const t of INTEL_TEMPLATES) {
      expect(t.trueText).toContain('{target}')
      expect(t.partialText).toContain('{target}')
      expect(t.falseText).toContain('{target}')
    }
  })

  it('every unlock past turn 1 has a Solomon line', () => {
    for (const unlock of UNLOCKS.filter((u) => u.turn >= 1)) {
      expect(ADVISOR_LINES.some((l) => l.trigger === unlock.id)).toBe(true)
    }
  })

  it('unlock turns are ordered and respect the spacing rule', () => {
    const gated = UNLOCKS.filter((u) => u.turn > 1)
    for (let i = 1; i < gated.length; i++) {
      expect(gated[i]!.turn - gated[i - 1]!.turn).toBeGreaterThanOrEqual(UNLOCK_SPACING)
    }
  })

  it('ids are unique across every content table', () => {
    const unique = (ids: string[]): boolean => new Set(ids).size === ids.length
    expect(unique(VEHICLES.map((v) => v.id))).toBe(true)
    expect(unique(INFORMANTS.map((i) => i.id))).toBe(true)
    expect(unique(INTEL_TEMPLATES.map((t) => t.id))).toBe(true)
    expect(unique(UNLOCKS.map((u) => u.id))).toBe(true)
    expect(unique(FENCE_CHANNELS.map((c) => c.id))).toBe(true)
  })
})

describe('heist config is well formed', () => {
  it('gives every segment three options and an abort line', () => {
    for (const segment of HEIST_CONFIG.segments) {
      expect(segment.options).toHaveLength(3)
      expect(segment.abortText.length).toBeGreaterThan(0)
    }
  })

  it('gives every segment all three tell variants', () => {
    for (const segment of HEIST_CONFIG.segments) {
      expect(segment.tell.accurate.length).toBeGreaterThan(0)
      expect(segment.tell.vague.length).toBeGreaterThan(0)
      expect(segment.tell.misleading.length).toBeGreaterThan(0)
    }
  })

  it('only mutates state vars the config declares', () => {
    const declared = new Set(Object.keys(HEIST_CONFIG.vars))
    for (const segment of HEIST_CONFIG.segments) {
      for (const option of segment.options) {
        for (const delta of [...option.onSuccess, ...option.onFailure]) {
          expect(declared.has(delta.var)).toBe(true)
        }
      }
    }
  })

  it('fails only on vars it declares', () => {
    for (const rule of HEIST_CONFIG.failWhen) {
      expect(Object.keys(HEIST_CONFIG.vars)).toContain(rule.var)
    }
  })
})

describe('the art layer covers every content key', () => {
  const venues = Object.keys(VENUE_LABELS) as VenueKey[]

  it('gives every vehicle a body type and a venue that both have art', () => {
    for (const v of VEHICLES) {
      expect(VEHICLE_GLYPHS[v.bodyType]).toBeDefined()
      expect(VENUE_GLYPHS[v.venue]).toBeDefined()
      expect(VENUE_LABELS[v.venue]).toBeTruthy()
    }
  })

  it('gives every informant a trade icon and a venue that both have art', () => {
    for (const i of INFORMANTS) {
      expect(ROLE_GLYPHS[i.roleIcon]).toBeDefined()
      expect(VENUE_GLYPHS[i.venue]).toBeDefined()
    }
  })

  it('draws a scene for every venue', () => {
    for (const venue of venues) {
      const svg = venueScene({ venue })
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.length).toBeGreaterThan(200)
    }
  })
})

describe('no two pieces of art are the same drawing', () => {
  // The point of an icon is to say *which one*. Two identical shapes under two
  // different names is the failure mode this guards — and it is the kind of
  // thing a copy-paste leaves behind without anything ever throwing.
  const distinct = (items: string[]): boolean => new Set(items).size === items.length

  it('across vehicle silhouettes', () => {
    const bodies = Object.keys(VEHICLE_GLYPHS) as BodyType[]
    expect(distinct(bodies.map((b) => VEHICLE_GLYPHS[b]('#000', '#fff')))).toBe(true)
  })

  it('across trades', () => {
    const roles = Object.keys(ROLE_GLYPHS) as RoleKey[]
    expect(distinct(roles.map((r) => ROLE_GLYPHS[r]('#000')))).toBe(true)
  })

  it('across venue icons', () => {
    const venues = Object.keys(VENUE_GLYPHS) as VenueKey[]
    expect(distinct(venues.map((v) => iconSvg(VENUE_GLYPHS[v])))).toBe(true)
  })

  it('across venue scenes', () => {
    const venues = Object.keys(VENUE_LABELS) as VenueKey[]
    expect(distinct(venues.map((v) => venueScene({ venue: v })))).toBe(true)
  })

  it('and a scene changes when the car parked in it changes', () => {
    const bodies = Object.keys(VEHICLE_GLYPHS) as BodyType[]
    const scenes = bodies.map((bodyType) =>
      venueScene({ venue: 'lot', car: { bodyType, era: 'classic' } }),
    )
    expect(distinct(scenes)).toBe(true)
  })
})

describe('every photo the content asks for is actually on disk', () => {
  // A wrong photo key does not throw — it renders a broken image and nothing
  // anywhere says so. Same silent-failure class as Benny's missing district.
  const present = (key: string): boolean =>
    existsSync(join(process.cwd(), 'public', 'assets', `${key}.jpg`))

  it('for every vehicle', () => {
    expect(VEHICLES.filter((v) => !present(v.photo)).map((v) => v.photo)).toEqual([])
  })

  it('for every informant', () => {
    expect(INFORMANTS.filter((i) => !present(i.photo)).map((i) => i.photo)).toEqual([])
  })

  it('for every venue', () => {
    const missing = Object.entries(VENUE_PHOTO).filter(([, k]) => !present(k))
    expect(missing).toEqual([])
  })

  it('for every portrait slot the face picker can reach', () => {
    const missing = Array.from({ length: PORTRAIT_COUNT }, (_, i) => portraitKey(i)).filter(
      (k) => !present(k),
    )
    expect(missing).toEqual([])
  })

  it('and every venue badge names a glyph that exists', () => {
    const missing = Object.entries(VENUE_BADGE).filter(([, g]) => !BADGE_PATHS[g])
    expect(missing).toEqual([])
    expect(BADGE_PATHS['car']).toBeDefined()
  })
})
