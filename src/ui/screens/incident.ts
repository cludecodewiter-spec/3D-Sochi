/**
 * 「被发现」界面。
 *
 * 它长得和作案界面几乎一样——同样的三栏、同样的选项行、同样的百分比——
 * 因为它就是同一件事的延续，不是插进来的一段过场。区别只有两处：
 * 标题条是红的，而其中一两个选项过去之后就再也回不来了。
 */

import { currentIncident, handleIncident } from '../../systems/game.js'
import { SKILL_LABELS } from '../../engine/types.js'
import { h, money, pct } from '../dom.js'
import { play } from '../audio.js'
import type { Ui } from '../app.js'

const RING: Record<string, Parameters<typeof play>[0]> = {
  witness: 'tick',
  camera: 'pick',
  police: 'siren',
}

export function incidentBody(ui: Ui): HTMLElement {
  const { state } = ui.game
  const view = currentIncident(ui.game)

  const box = h('div', {})
  box.appendChild(
    h(
      'div',
      { class: 'stagebar', style: 'background:var(--red);color:#F2DDB8' },
      h('span', { class: 'active' }, view.title),
      h('span', {}, view.runEnded ? '这一趟已经黄了' : '还能接着干'),
    ),
  )

  const said = h('div', { class: 'script sunken', style: 'margin:0 6px' })
  for (const line of view.intro.split('\n')) said.appendChild(h('p', { class: 'lose' }, line))
  if (!state.marco.armed) {
    // 没枪的时候，那两个选项根本不在列表里。说清楚为什么，
    // 免得玩家以为是 UI 出了问题。
    said.appendChild(h('p', { class: 'hint' }, '（你身上没有武器。有些路你现在走不了。）'))
  }
  box.appendChild(said)

  const acts = h('div', { class: 'acts' })
  view.options.forEach((option, i) => {
    const risky = option.probability !== null && option.probability < 0.4
    const safe = option.probability === null || option.probability >= 0.7
    const permanent = !!(option.onSuccess.wantedBase || option.onSuccess.killed)

    acts.appendChild(
      h(
        'button',
        {
          class: 'act-row',
          ...(option.disabled ? { disabled: 'disabled' } : {}),
          onclick: () => choose(ui, option.id),
        },
        h('span', { class: 'ic' }, `${i + 1}`),
        h(
          'span',
          {},
          h('span', {}, option.label),
          h(
            'span',
            { class: 'sub', style: 'display:block' },
            option.hint,
            option.cashCost ? h('span', {}, ` · ${money(option.cashCost)}`) : null,
            permanent ? h('span', { class: 'red' }, ' · 进底案，消不掉') : null,
            option.disabledWhy ? h('span', { class: 'red' }, ` · ${option.disabledWhy}`) : null,
          ),
        ),
        h(
          'span',
          { class: `odds ${risky ? 'lo' : safe ? 'hi' : ''}` },
          option.skill ? `${SKILL_LABELS[option.skill]} ${state.marco.skills[option.skill]}` : '不用赌',
          h('br'),
          h('b', {}, option.probability === null ? '必然' : pct(option.probability)),
        ),
      ),
    )
  })
  box.appendChild(acts)
  return box
}

function choose(ui: Ui, optionId: string): void {
  const kind = ui.game.state.incident?.kind ?? 'witness'
  play(RING[kind] ?? 'tick')

  const result = handleIncident(ui.game, optionId)
  ui.beats.push({ text: result.text, failed: !result.success })
  for (const line of result.epilogue) ui.beats.push({ text: line, failed: !result.success })
  if (!result.success) play('fail')

  if (result.arrest) {
    play('siren')
    ui.heistEnded = true
    // 无期不给「回到街上」这个按钮。没有街了。
    if (result.arrest.life) ui.mode = 'ending'
  } else if (result.runOver) {
    ui.heistEnded = true
  }
  ui.autosave()
  ui.render()
}
