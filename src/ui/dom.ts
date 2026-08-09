/** Minimal hyperscript. A text game needs a document, not a framework. */

type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown>

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') el.className = String(value)
    else if (key === 'html') el.innerHTML = String(value)
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'disabled') {
      if (value) el.setAttribute('disabled', '')
    } else el.setAttribute(key, String(value))
  }
  append(el, children)
  return el
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child,
    )
  }
}

export const frag = (...children: Child[]): DocumentFragment => {
  const f = document.createDocumentFragment()
  append(f, children)
  return f
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/** Parses an SVG source string into a live node. */
export function svg(markup: string): SVGElement {
  const holder = document.createElement('div')
  holder.innerHTML = markup.trim()
  const node = holder.firstElementChild
  if (!(node instanceof SVGElement)) throw new Error('svg() got non-SVG markup')
  return node
}

/** Wraps art in the sunken photo frame used across the character panels. */
export const photo = (markup: string): HTMLElement => {
  const frame = document.createElement('div')
  frame.className = 'photo'
  frame.appendChild(svg(markup))
  return frame
}

export const money = (n: number): string =>
  `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`

export const pct = (p: number): string => `${Math.round(p * 100)}%`
