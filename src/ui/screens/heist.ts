/**
 * The action view. Replaces the map while a job is running, in the same frame
 * as everything else — the character sheet and the racks stay visible, which
 * is what makes it read as a simulation turn rather than a cutscene.
 */

import { HEIST_CONFIG } from '../../content/heist.js'
import { vehicleDef } from '../../content/vehicles.js'
import { chooseHeistOption, currentHeist, giveUpHeist } from '../../systems/game.js'
import { h, pct } from '../dom.js'
import { play } from '../audio.js'
import { panel } from '../panels.js'
import type { Ui } from '../app.js'

const SOUND: Record<string, Parameters<typeof play>[0]> = {
  recon: 'tick',
  approach: 'heart',
  breach: 'pick',
  escape: 'engine',
}

export function renderHeistPanel(ui: Ui): HTMLElement {
  const { state } = ui.game
  const run = state.activeRun
  const done = !run || ui.heistEnded

  const target = run ? state.targets.find((t) => t.id === run.contextId) : undefined
  const def = target ? vehicleDef(target.defId) : null

  const stage = h('div', { class: 'stagebar' })
  const index = done ? HEIST_CONFIG.segments.length : (run?.segmentIndex ?? 0)
  HEIST_CONFIG.segments.forEach((segment, i) => {
    stage.appendChild(
      h('span', { class: i < index ? 'done' : i === index ? 'active' : '' }, segment.title),
    )
  })

  const body = h('div', {}, stage)
  const script = h('div', { class: 'script sunken', style: 'margin:0 6px' })

  for (const beat of ui.beats) {
    script.appendChild(h('p', { class: beat.failed ? 'lose' : 'win' }, beat.text))
  }

  if (!done) {
    const view = currentHeist(ui.game)
    script.appendChild(h('p', { class: 'sys' }, view.intro))
    script.appendChild(h('p', { class: 'tell' }, view.tell))
    if (view.nerveHint) script.appendChild(h('p', { class: 'hint' }, view.nerveHint))
    if (view.assistNote) script.appendChild(h('p', { class: 'sys' }, view.assistNote))
    body.appendChild(script)

    const acts = h('div', { class: 'acts' })
    view.options.forEach((option, i) => {
      const risky = option.probability < 0.4
      const safe = option.probability >= 0.7
      acts.appendChild(
        h(
          'button',
          { class: 'act-row', onclick: () => choose(ui, option.id, view.segmentId) },
          h('span', { class: 'ic' }, `${i + 1}`),
          h(
            'span',
            {},
            h('span', {}, option.label),
            h(
              'span',
              { class: 'sub', style: 'display:block' },
              option.hint,
              option.endsRunOnFailure ? h('span', { class: 'red' }, ' · 失败即收场') : null,
            ),
          ),
          h(
            'span',
            { class: `odds ${risky ? 'lo' : safe ? 'hi' : ''}` },
            `${option.skillLabel} ${option.skillValue} / ${option.opposition}`,
            h('br'),
            h('b', {}, pct(option.probability)),
          ),
        ),
      )
    })
    body.appendChild(acts)

    const vars = h('div', { class: 'strip', style: 'border-top:1px solid var(--rule)' })
    for (const [key, value] of Object.entries(view.vars)) {
      // `danger` stays hidden: the player is not meant to know that a lie has
      // already put people behind the building.
      if (key === 'danger') continue
      vars.appendChild(
        h('span', {}, h('span', { class: 'k' }, `${view.varLabels[key] ?? key} `),
          h('span', { class: 'v' }, String(Math.round(value)))),
      )
    }
    vars.appendChild(h('span', { style: 'flex:1' }))
    vars.appendChild(h('button', { onclick: () => giveUp(ui) }, '放下手里的东西，走开'))
    body.appendChild(vars)
  } else {
    script.appendChild(h('p', { class: 'sys' }, '── 结束 ──'))
    body.appendChild(script)
    body.appendChild(
      h(
        'div',
        { class: 'row end', style: 'padding:6px' },
        h(
          'button',
          {
            class: 'act go',
            onclick: () => {
              ui.beats = []
              ui.heistEnded = false
              ui.mode = 'map'
              ui.render()
            },
          },
          '回到街上',
        ),
      ),
    )
  }

  const section = panel(`作案现场 · ${def?.name ?? ''}`, body, { flex: true })
  queueMicrotask(() => {
    script.scrollTop = script.scrollHeight
  })
  return section
}

function choose(ui: Ui, optionId: string, segmentId: string): void {
  play(SOUND[segmentId] ?? 'tick')
  const result = chooseHeistOption(ui.game, optionId)
  ui.beats.push({ text: result.text, failed: !result.success })
  if (!result.success) play('fail')

  if (result.outcome) {
    for (const line of result.epilogue) {
      ui.beats.push({ text: line, failed: result.outcome.result !== 'success' })
    }
    play(result.outcome.result === 'success' ? 'cash' : 'siren')
    ui.heistEnded = true
  }
  ui.autosave()
  ui.render()
}

function giveUp(ui: Ui): void {
  for (const line of giveUpHeist(ui.game)) ui.beats.push({ text: line, failed: false })
  ui.heistEnded = true
  ui.autosave()
  ui.render()
}
