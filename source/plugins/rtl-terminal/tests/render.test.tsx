import { expect, test } from 'claude-code/testing'

import { LRM, RLM } from '../hooks/bidi'
import { drawBand } from '../hooks/register'

const VIEWPORT = { columns: 60, rows: 20 }
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 60,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

test('draws an Arabic reply right-aligned, with the reply mark', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const tree = await $.ui.render({
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm1',
    viewport: VIEWPORT,
    props: { text: '- AdMob بيعرض إعلانه (plugin)\n\n```\ncode\n```', isFirstOfReply: true },
  })
  const drawn = JSON.stringify(tree)

  expect(drawn).not.toContain('engine')
  expect(drawn).toContain('●')
  expect(drawn).toContain('flex-end')
  expect(drawn).toContain(`${RLM}${LRM}AdMob${LRM}`)
  expect(drawn).toContain(`${LRM}plugin${LRM}`)
  expect(drawn).toContain(`)${RLM}`)
  expect(drawn).toContain('```\\ncode\\n```')
})

test('leaves an English reply to the engine', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const tree = await $.ui.render({
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm2',
    viewport: VIEWPORT,
    props: { text: 'Hello **world**', isFirstOfReply: true },
  })

  expect(JSON.stringify(tree)).toContain('engine')
})

// A test can't raise prompt.edit, so this draws the band through drawBand, the
// function the AbovePrompt hook hands next(e)'s tree to while a preview shows.
test("keeps another plugin's row in the band, with the preview under it", async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const els = $.ui.resolve(e)
    const { Text } = els
    const beneath = <Text>other plugin: usage 42%</Text>
    return drawBand(els, beneath, 'بدي plugin جديد', e.props.bodyColumns, e.props.maxRows)
  })

  const tree = await $.ui.render({
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    viewport: VIEWPORT,
    props: BAND,
  })
  const drawn = JSON.stringify(tree)

  expect(drawn).toContain('other plugin: usage 42%')
  expect(drawn).toContain(`${LRM}plugin${LRM}`)
  expect(drawn.indexOf('usage 42%')).toBeLessThan(drawn.indexOf('✎'))
})

test('leaves the band to the plugins beneath while there is no draft', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other plugin: usage 42%</Text>
  })

  const tree = await $.ui.render({
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band-empty',
    viewport: VIEWPORT,
    props: BAND,
  })

  expect(JSON.stringify(tree)).toContain('other plugin: usage 42%')
})
