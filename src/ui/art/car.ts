/**
 * Procedural car silhouettes. No external art, no network — every vehicle in
 * the game gets a drawn side profile from its body type and era.
 *
 * Deliberately rendered as a blueprint/evidence-photo rather than an attempt
 * at a realistic car: it reads as something out of a case file, which is the
 * register the rest of the game is written in, and it degrades gracefully at
 * any size.
 */

import type { Era } from '../../engine/types.js'
import type { BodyType } from '../../content/types.js'

const BODY: Record<BodyType, { shell: string; glass: string[] }> = {
  wagon: {
    shell:
      'M14 60 L14 45 Q14 41 21 40 L47 38 L61 21 Q63 18 70 18 L168 18 Q173 18 176 22 L183 40 Q189 41 189 47 L189 60 Z',
    glass: [
      'M66 24 L58 37 L92 36 L92 24 Z',
      'M98 24 L98 36 L134 36 L134 24 Z',
      'M140 24 L140 36 L170 36 L166 24 Z',
    ],
  },
  sedan: {
    shell:
      'M14 60 L14 45 Q14 41 21 40 L49 38 L65 23 Q68 19 75 19 L127 19 Q134 19 137 23 L153 38 L182 41 Q189 42 189 47 L189 60 Z',
    glass: ['M72 25 L62 37 L96 36 L96 25 Z', 'M102 25 L102 36 L140 37 L130 25 Z'],
  },
  pickup: {
    shell:
      'M14 60 L14 45 Q14 41 21 40 L45 38 L59 21 Q62 18 69 18 L107 18 L116 41 L186 41 Q189 41 189 45 L189 60 Z',
    glass: ['M66 24 L57 37 L88 36 L88 24 Z', 'M94 24 L94 36 L110 36 L104 24 Z'],
  },
  coupe: {
    shell:
      'M14 60 L14 46 Q14 42 20 41 L44 38 L60 24 Q65 18 78 17 L118 17 Q132 18 145 28 L183 43 Q189 44 189 49 L189 60 Z',
    glass: ['M74 23 L61 37 L98 36 L98 23 Z', 'M104 23 L104 36 L142 37 L124 24 Z'],
  },
  sleek: {
    shell:
      'M13 58 L13 46 Q15 39 30 37 L52 35 Q66 17 92 15 L124 15 Q148 17 160 31 L184 39 Q189 41 189 47 L189 58 Z',
    glass: ['M92 21 L74 34 L108 33 L108 21 Z', 'M114 21 L114 33 L150 34 L134 22 Z'],
  },
}

const WHEELS: Record<BodyType, [number, number]> = {
  wagon: [50, 156],
  sedan: [52, 154],
  pickup: [48, 158],
  coupe: [54, 152],
  sleek: [52, 156],
}

export interface CarArtOptions {
  bodyType: BodyType
  era: Era
  /** Dimmed and crossed through once the car is gone. */
  gone?: boolean
  /** 0-100. Below 100 adds visible damage. */
  condition?: number
  height?: number
}

export function carSvg(options: CarArtOptions): string {
  const { bodyType, era, gone = false, condition = 100, height = 74 } = options
  const body = BODY[bodyType]
  const [front, rear] = WHEELS[bodyType]
  const stroke = gone ? 'var(--art-line-soft)' : 'var(--art-line)'
  const accent =
    era === 'contemporary' ? 'var(--art-red)' : era === 'modern' ? 'var(--art-accent)' : 'var(--art-line-soft)'

  const wheel = (cx: number): string => `
    <circle cx="${cx}" cy="60" r="13" fill="var(--art-fill)" stroke="${stroke}" stroke-width="1.6"/>
    <circle cx="${cx}" cy="60" r="5" fill="none" stroke="${stroke}" stroke-width="1.2"/>`

  // Chrome trim reads as age; the 2011+ cars get a smooth flank and a
  // key-fob dot instead — the silhouette itself carries the era.
  const trim =
    era === 'classic'
      ? `<line x1="20" y1="52" x2="184" y2="52" stroke="${stroke}" stroke-width="1" opacity=".55"/>
         <rect x="16" y="47" width="6" height="3" fill="${stroke}" opacity=".7"/>
         <rect x="182" y="47" width="6" height="3" fill="${stroke}" opacity=".7"/>`
      : era === 'modern'
        ? `<line x1="24" y1="50" x2="180" y2="50" stroke="${stroke}" stroke-width=".8" opacity=".4"/>`
        : `<circle cx="120" cy="44" r="2.4" fill="${accent}"/>
           <line x1="30" y1="47" x2="176" y2="47" stroke="${accent}" stroke-width=".7" opacity=".5"/>`

  const damage =
    condition < 85
      ? `<path d="M${rear - 20} 44 l6 5 l-4 4 l7 3" fill="none" stroke="var(--art-red)" stroke-width="1.4" opacity=".85"/>`
      : ''

  return `<svg class="car-art" viewBox="0 0 202 78" role="img" aria-hidden="true"
    style="height:${height}px;width:100%;max-width:100%" preserveAspectRatio="xMidYMid meet">
    <path d="${body.shell}" fill="var(--art-fill)" stroke="${stroke}" stroke-width="1.8"
      stroke-linejoin="round" opacity="${gone ? 0.35 : 1}"/>
    ${body.glass.map((g) => `<path d="${g}" fill="var(--art-fill-2)" stroke="${stroke}" stroke-width="1" opacity="${gone ? 0.3 : 0.9}"/>`).join('')}
    ${trim}
    ${damage}
    ${wheel(front)}${wheel(rear)}
    ${gone ? `<line x1="18" y1="14" x2="186" y2="66" stroke="var(--art-red)" stroke-width="2" opacity=".7"/>` : ''}
  </svg>`
}
