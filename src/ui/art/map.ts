/**
 * The city map — the game's primary navigation, as in the reference build.
 * Every target and every informant hangout is a badge pinned to its district;
 * clicking a badge is how the player selects anything.
 *
 * Drawn procedurally: street grid, river, district labels, then badges laid
 * out in a small cluster around each district node so several cars in the
 * same neighbourhood stay individually clickable.
 */

import type { BodyType, RoleKey } from '../../content/types.js'
import { ROLE_GLYPHS, VEHICLE_GLYPHS, badgeGlyph } from './icons.js'

export interface District {
  id: string
  x: number
  y: number
}

/** Ids match the `location` prefixes used in content/vehicles.ts. */
/** Coordinates are in the map's 300 × 240 viewBox. */
export const DISTRICTS: District[] = [
  { id: '北环', x: 152, y: 32 },
  { id: '码头区', x: 58, y: 62 },
  { id: '东区', x: 244, y: 66 },
  { id: '中城', x: 150, y: 118 },
  { id: '西区', x: 50, y: 134 },
  { id: '工业路', x: 248, y: 158 },
  { id: '南街', x: 132, y: 186 },
  { id: '河滨路', x: 48, y: 206 },
]

export const districtOf = (location: string): District | undefined =>
  DISTRICTS.find((d) => location.startsWith(d.id))

export interface MapPin {
  id: string
  kind: 'vehicle' | 'informant'
  location: string
  label: string
  /** Which silhouette to draw — the body type for a car, the trade for a person. */
  bodyType?: BodyType
  roleIcon?: RoleKey
  /** Dimmed and struck through — already taken. */
  gone?: boolean
  /** Player is carrying intel about this target. */
  flagged?: boolean
}

/**
 * A pin has to say *which one*. A wagon reads as a wagon and a nurse reads as a
 * nurse, so the player can pick a target straight off the map instead of
 * clicking every identical dot to find out what it is.
 */
function pinGlyph(pin: MapPin, background: string): string {
  return pin.kind === 'vehicle'
    ? badgeGlyph(VEHICLE_GLYPHS[pin.bodyType ?? 'sedan'], 'var(--art-line)', 1.14, background)
    : badgeGlyph(ROLE_GLYPHS[pin.roleIcon ?? 'dock'], 'var(--art-line)', 0.82)
}

function cluster(count: number, index: number): [number, number] {
  if (count === 1) return [0, -14]
  const spread = 25
  const perRow = Math.min(3, count)
  const row = Math.floor(index / perRow)
  const col = index % perRow
  const rowWidth = Math.min(perRow, count - row * perRow)
  return [(col - (rowWidth - 1) / 2) * spread, -14 + row * 21]
}

export interface MapOptions {
  pins: MapPin[]
  selectedId?: string | null
  heat?: number
  onSelect?: (id: string) => void
}

export function buildMap(options: MapOptions): HTMLElement {
  const { pins, selectedId, heat = 0, onSelect } = options

  const roads = [
    'M12 44 L288 50', 'M8 108 L292 114', 'M14 168 L286 162', 'M10 214 L290 208',
    'M58 12 L50 228', 'M150 8 L146 226', 'M242 18 L250 220',
    'M96 16 L104 224', 'M198 12 L196 228', 'M20 78 L280 84', 'M16 140 L284 136',
  ]

  const byDistrict = new Map<string, MapPin[]>()
  for (const pin of pins) {
    const district = districtOf(pin.location)
    if (!district) continue
    const list = byDistrict.get(district.id) ?? []
    list.push(pin)
    byDistrict.set(district.id, list)
  }

  const badges: string[] = []
  for (const district of DISTRICTS) {
    const list = byDistrict.get(district.id) ?? []
    list.forEach((pin, index) => {
      const [dx, dy] = cluster(list.length, index)
      const x = district.x + dx
      const y = district.y + dy
      const on = pin.id === selectedId
      const fill = pin.gone
        ? 'var(--paper-3)'
        : pin.kind === 'informant'
          ? '#cfae62'
          : 'var(--art-accent)'
      badges.push(`<g class="node" data-pin="${pin.id}" transform="translate(${x} ${y})">
        <title>${pin.label}</title>
        <circle class="ring" r="13.8" fill="none" stroke="var(--art-red)" stroke-width="2.4"
          opacity="${on ? 1 : 0}"/>
        <circle r="12.4" fill="#f0e4c6" opacity=".95"/>
        <circle r="10.8" fill="${fill}" stroke="var(--art-line)" stroke-width="1"
          opacity="${pin.gone ? 0.4 : 1}"/>
        <g opacity="${pin.gone ? 0.4 : 1}">${pinGlyph(pin, fill)}</g>
        ${pin.flagged ? '<circle cx="7.4" cy="-7.4" r="3.2" fill="var(--art-red)" stroke="var(--art-fill-2)" stroke-width=".9"/>' : ''}
        ${pin.gone ? '<line x1="-8" y1="-8" x2="8" y2="8" stroke="var(--art-red)" stroke-width="2.2"/>' : ''}
      </g>`)
    })
  }

  const wrap = document.createElement('div')
  wrap.className = 'mapwrap sunken'
  wrap.innerHTML = `<svg class="city-map" viewBox="0 0 300 240" role="img"
    preserveAspectRatio="xMidYMid meet">
    <rect width="300" height="240" fill="#f0e4c6"/>
    <g stroke="#cdba8f" stroke-width="2.2" fill="none" stroke-linecap="round">
      ${roads.map((d) => `<path d="${d}"/>`).join('')}
    </g>
    <path d="M0 226 Q70 208 130 220 Q210 236 300 206" stroke="#9db4c0" stroke-width="9"
      fill="none" opacity=".75"/>
    <text x="292" y="200" font-size="8" text-anchor="end" font-family="var(--sans)"
      fill="#7d95a3">河</text>
    ${
      heat >= 40
        ? `<circle cx="150" cy="118" r="${52 + heat / 1.4}" fill="var(--art-red)"
             opacity="${Math.min(0.2, heat / 460)}"/>`
        : ''
    }
    <g>${DISTRICTS.map(
      (d) => `<g>
        <circle cx="${d.x}" cy="${d.y}" r="2.6" fill="#a08a5c"/>
        <text x="${d.x}" y="${d.y + 14}" font-size="10" text-anchor="middle"
          font-family="var(--sans)" fill="#6f5c3a">${d.id}</text>
      </g>`,
    ).join('')}</g>
    ${badges.join('')}
  </svg>`

  if (onSelect) {
    wrap.addEventListener('click', (event) => {
      const node = (event.target as Element).closest('[data-pin]')
      const id = node?.getAttribute('data-pin')
      if (id) onSelect(id)
    })
  }
  return wrap
}
