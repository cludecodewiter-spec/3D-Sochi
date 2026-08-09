/**
 * Procedural identikit portraits — police composite sketches.
 *
 * Features are derived deterministically from the character's id, so the same
 * person always has the same face across sessions and saves. Drawing them as
 * composites rather than attempting likenesses is both honest about what a
 * generator can do and exactly right for a game whose central object is a case
 * file: this is how the police would have drawn these people.
 */

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const pick = <T>(seed: number, shift: number, items: readonly T[]): T =>
  items[Math.floor((((seed >>> shift) & 0xff) / 256) * items.length) % items.length] as T

/** Head outlines, all centred on x=50 with the chin around y=76. */
const HEAD = [
  'M50 20 Q73 20 74 44 Q74 62 66 71 Q59 78 50 78 Q41 78 34 71 Q26 62 26 44 Q27 20 50 20 Z',
  'M50 19 Q74 19 74 43 L72 64 Q68 77 50 78 Q32 77 28 64 L26 43 Q26 19 50 19 Z',
  'M50 20 Q71 20 72 42 Q72 66 50 79 Q28 66 28 42 Q29 20 50 20 Z',
]

const HAIR = [
  // full
  'M24 44 Q23 15 50 15 Q77 15 76 44 L72 33 Q64 24 50 24 Q36 24 28 34 Z',
  // receding
  'M26 40 Q30 18 50 18 Q70 18 74 40 L70 32 Q60 27 45 28 Q32 30 29 37 Z',
  // cropped
  'M28 38 Q34 21 50 21 Q66 21 72 38 L68 33 Q59 28 50 28 Q41 28 32 33 Z',
  // bald
  '',
]

const MOUTH = ['M40 66 Q50 71 60 66', 'M40 67 L60 67', 'M41 69 Q50 63 59 69']
const NOSE = ['M50 46 L46 58 L54 58', 'M50 45 L44 59 Q50 62 56 59', 'M50 48 L47 58 L53 58']
const BROW = [
  ['M36 41 Q41 37 46 41', 'M54 41 Q59 37 64 41'],
  ['M36 40 L46 39', 'M54 39 L64 40'],
  ['M36 39 Q41 42 46 40', 'M54 40 Q59 42 64 39'],
]

export interface PortraitOptions {
  id: string
  size?: number
  /** Draws the sketch grid and the file number. */
  filed?: boolean
  tone?: 'neutral' | 'bad' | 'good'
}

export function portraitSvg({
  id,
  size = 96,
  filed = true,
  tone = 'neutral',
}: PortraitOptions): string {
  const seed = hash(id)
  const head = pick(seed, 0, HEAD)
  const hair = pick(seed, 4, HAIR)
  const mouth = pick(seed, 8, MOUTH)
  const nose = pick(seed, 12, NOSE)
  const brow = pick(seed, 6, BROW)
  const glasses = ((seed >>> 16) & 3) === 0
  const beard = ((seed >>> 18) & 3) === 0
  const cap = ((seed >>> 20) & 7) === 0
  const collar = ((seed >>> 22) & 1) === 0

  const line = tone === 'bad' ? 'var(--art-red)' : tone === 'good' ? 'var(--art-green)' : 'var(--art-line)'

  return `<svg class="portrait" viewBox="0 0 100 120" role="img" aria-hidden="true"
    style="width:${size}px;height:${(size * 120) / 100}px">
    <rect width="100" height="120" fill="var(--art-bg)"/>
    ${
      filed
        ? `<g stroke="var(--art-line-soft)" stroke-width=".4" opacity=".45">
             ${[25, 50, 75].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="120"/>`).join('')}
             ${[24, 48, 72, 96].map((y) => `<line x1="0" y1="${y}" x2="100" y2="${y}"/>`).join('')}
           </g>`
        : ''
    }
    <g fill="none" stroke="${line}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <!-- shoulders first, so the head sits in front of them -->
      <path d="M6 120 Q10 96 32 89 L44 84 L56 84 L68 89 Q90 96 94 120"
        fill="var(--art-fill)"/>
      ${collar ? '<path d="M44 84 L50 96 L56 84" fill="var(--art-fill-2)"/>' : ''}
      <path d="M43 74 L43 86 Q50 90 57 86 L57 74" fill="var(--art-fill-2)"/>
      <path d="M26 48 q-5 0 -5 6 t5 6" fill="var(--art-fill-2)"/>
      <path d="M74 48 q5 0 5 6 t-5 6" fill="var(--art-fill-2)"/>
      <path d="${head}" fill="var(--art-fill-2)"/>
      ${hair ? `<path d="${hair}" fill="var(--art-fill)"/>` : ''}
      ${cap ? '<path d="M24 36 Q28 16 50 16 Q72 16 76 36 L80 40 L20 40 Z" fill="var(--art-fill)"/>' : ''}
      <path d="${brow[0]}"/>
      <path d="${brow[1]}"/>
      <circle cx="41" cy="47" r="2.6" fill="${line}" stroke="none"/>
      <circle cx="59" cy="47" r="2.6" fill="${line}" stroke="none"/>
      ${
        glasses
          ? '<circle cx="41" cy="47" r="8.4"/><circle cx="59" cy="47" r="8.4"/>' +
            '<line x1="49.4" y1="47" x2="50.6" y2="47"/><line x1="32.6" y1="46" x2="27" y2="49"/>' +
            '<line x1="67.4" y1="46" x2="73" y2="49"/>'
          : ''
      }
      <path d="${nose}"/>
      <path d="${mouth}"/>
      ${beard ? '<path d="M32 58 Q34 76 50 79 Q66 76 68 58" opacity=".85"/>' : ''}
    </g>
    ${
      filed
        ? `<text x="4" y="116" font-family="var(--mono)" font-size="7"
             fill="var(--art-line-soft)">${((seed % 90000) + 10000).toString()}</text>`
        : ''
    }
  </svg>`
}
