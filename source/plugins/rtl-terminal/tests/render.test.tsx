import { expect, test } from 'claude-code/testing'

import { LRM, RLM } from '../hooks/bidi'

const VIEWPORT = { columns: 60, rows: 20 }

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
