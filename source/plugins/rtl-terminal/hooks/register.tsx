import type { Elements as SurfaceElements, EngineInterface, Register } from 'claude-code'

import { LRM } from './bidi'
import { itemMarker, layoutRtl, parseInline, splitBlocks } from './markdown'
import type { Block, RtlBlock, Span } from './markdown'
import { layoutPlainText, needsPreview, previewRows } from './preview'
import { asMode, reorderedBy } from './target'
import type { Mode } from './target'

// Cells the transcript keeps left of a reply's text for its `●` mark.
const MESSAGE_GUTTER = 2
// A cell kept free at the right, so a scrollbar or a rounding never wraps
// a right-aligned row.
const RIGHT_MARGIN = 1
// Cells a prompt row of the transcript keeps around its text: the `❯ ` mark,
// the box fullscreen draws it in, and room to spare, so the rows wrapped here
// are never wrapped again.
const PROMPT_ROW_CHROME = 6
// Drawn dim at the right of a draft's preview, where a list keeps its bullet.
const PREVIEW_GUTTER = ' ✎'
// How often a shown preview checks the prompt box: clearing it (Ctrl+C, Esc,
// history) raises no edit, and the preview must not outlive the draft.
const PREVIEW_CHECK_MS = 300

type Elements = SurfaceElements['terminal']

function spanElement(els: Elements, span: Span) {
  const { Link, Text } = els
  const props: Record<string, unknown> = {}
  if (span.bold) props.bold = true
  if (span.italic) props.italic = true
  if (span.underline) props.underline = true
  if (span.strike) props.strikethrough = true
  if (span.code) props.color = 'permission'
  if (span.href && !span.code) {
    return (
      <Text {...props} color="blueBright">
        <Link href={span.href}>{span.text}</Link>
      </Text>
    )
  }
  return <Text {...props}>{span.text}</Text>
}

function gutterOf(block: RtlBlock): { text: string; isDim: boolean } {
  if (block.role === 'item') {
    return { text: ` ${itemMarker(block.marker, block.depth)}${'  '.repeat(block.depth)}`, isDim: false }
  }
  if (block.role === 'quote') return { text: ' ▎', isDim: true }
  return { text: '', isDim: false }
}

function blockRows(els: Elements, block: RtlBlock, width: number) {
  const { Box, Text } = els
  const gutter = gutterOf(block)
  const room = width - gutter.text.length
  const style: Omit<Span, 'text'> =
    block.role === 'heading'
      ? block.headingLevel === 1
        ? { bold: true, italic: true, underline: true }
        : { bold: true }
      : block.role === 'quote'
        ? { italic: true }
        : {}
  const rows = block.lines.flatMap(line => layoutRtl(parseInline(line, style), room))

  return rows.map((row, r) => {
    const mark = r === 0 || block.role === 'quote' ? gutter.text : ' '.repeat(gutter.text.length)
    return (
      <Box flexDirection="row">
        <Text>{row.map(span => spanElement(els, span))}</Text>
        {gutter.text !== '' && (
          <Text dimColor={gutter.isDim}>{LRM + mark}</Text>
        )}
      </Box>
    )
  })
}

function drawBlocks(els: Elements, blocks: Block[], width: number, isFirstOfReply: boolean) {
  const { Box, Markdown, Text } = els
  return (
    <Box flexDirection="row">
      <Box width={MESSAGE_GUTTER}>
        <Text color="text">{isFirstOfReply ? '●' : ' '}</Text>
      </Box>
      <Box flexDirection="column" width={width}>
      {blocks.map((block, n) => {
        const marginTop = block.gapBefore && n > 0 ? 1 : 0
        if (block.kind === 'markdown') {
          return (
            <Box marginTop={marginTop}>
              <Markdown text={block.source} />
            </Box>
          )
        }
        return (
          <Box marginTop={marginTop} flexDirection="column" alignItems="flex-end">
            {blockRows(els, block, width)}
          </Box>
        )
      })}
      </Box>
    </Box>
  )
}

function drawPreview(els: Elements, text: string, width: number, maxRows: number) {
  const { Box, Text } = els
  const rows = previewRows(text, width - PREVIEW_GUTTER.length).slice(-Math.max(1, maxRows))

  return (
    <Box flexDirection="column" width={width}>
      {rows.map((row, r) => (
        <Box flexDirection="row" alignSelf={row.isRtl ? 'flex-end' : 'flex-start'}>
          <Text>{row.spans.map(span => spanElement(els, span))}</Text>
          {row.isRtl && <Text dimColor>{LRM + (r === 0 ? PREVIEW_GUTTER : '  ')}</Text>}
        </Box>
      ))}
    </Box>
  )
}

const HELP = [
  'Usage: /rtl [on | off]       RTL layout of replies',
  '       /rtl input [on | off] live preview of an RTL draft above the prompt',
  '       /rtl mode [auto | claude | terminal]',
  '                             who reorders RTL rows: claude is Claude Code',
  '                             itself (Windows Terminal, conhost, VS Code), where',
  '                             the plugin lays them out; terminal is the',
  "                             terminal's own engine (Linux, macOS), left to it;",
  '                             auto works it out',
].join('\n')

// Who reorders rows in this session, from the stored mode and the environment.
async function resolveReorderedBy($: EngineInterface, mode: Mode): Promise<'claude' | 'terminal'> {
  const os = await $.env.get('OS')
  const termProgram = await $.env.get('TERM_PROGRAM')
  return reorderedBy(mode, { os, termProgram })
}

export const register: Register = on => {
  // The session's settings, loaded from the plugin's store when the session
  // starts (and again on every reload); a change redraws what they shape.
  let isEnabled = true
  let isPreviewOn = true
  let whoReorders: 'claude' | 'terminal' = 'claude'
  let draft = ''

  // Lays rows out only where Claude Code reorders them, and only when on.
  const isLaidOut = () => isEnabled && whoReorders === 'claude'

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('isEnabled')
    if (typeof saved === 'boolean') isEnabled = saved
    const savedPreview = await $.store.get('isPreviewOn')
    if (typeof savedPreview === 'boolean') isPreviewOn = savedPreview
    whoReorders = await resolveReorderedBy($, asMode(await $.store.get('mode')))
    $.ui.invalidate('ui.render')

    await $.command.register({
      name: 'rtl',
      description: 'Right-to-left layout for Arabic, Hebrew, Persian, Urdu and other RTL replies',
      argumentHint: '[input] on | off | mode auto | claude | terminal',
    })

    $.clock.every(PREVIEW_CHECK_MS, async () => {
      if (draft === '') return
      const box = await $.prompt.read()
      if (box.text === draft) return
      draft = box.text
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('command.run', { command: 'rtl' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)

    if (words[0] === 'mode') {
      const asked = words[1]
      if (words.length > 2 || (asked !== undefined && asMode(asked) !== asked)) return { text: HELP }
      const mode = asMode(asked ?? (await $.store.get('mode')))
      await $.store.set('mode', mode)
      whoReorders = await resolveReorderedBy($, mode)
      $.ui.invalidate('ui.render')
      return {
        text:
          whoReorders === 'claude'
            ? `RTL mode is ${mode}: Claude Code reorders RTL rows here, and the plugin lays them out.`
            : `RTL mode is ${mode}: this terminal reorders RTL rows itself, and the plugin leaves them to it.`,
      }
    }

    const isInput = words[0] === 'input'
    const arg = isInput ? words[1] : words[0]
    if ((arg !== undefined && arg !== 'on' && arg !== 'off') || words.length > (isInput ? 2 : 1)) {
      return { text: HELP }
    }

    const choose = (current: boolean) => (arg === 'on' ? true : arg === 'off' ? false : !current)

    if (isInput) {
      isPreviewOn = choose(isPreviewOn)
      await $.store.set('isPreviewOn', isPreviewOn)
      $.ui.invalidate('ui.render')
      return { text: `RTL input preview is ${isPreviewOn ? 'on' : 'off'}.` }
    }

    isEnabled = choose(isEnabled)
    await $.store.set('isEnabled', isEnabled)
    $.ui.invalidate('ui.render')
    return { text: `RTL layout is ${isEnabled ? 'on' : 'off'}.` }
  })

  // Reads the draft after each edit, for the preview; the edit itself goes on
  // unchanged.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    draft = box.text
    $.ui.invalidate('ui.render')
    return box
  }).catch(($, e, next) => next(e))

  // Clears the preview once a prompt is sent; the prompt itself goes on
  // unchanged.
  on('prompt.submit', async ($, e, next) => {
    draft = ''
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    if (!isLaidOut() || !isPreviewOn) return next(e)
    if (!needsPreview(draft, e.props.bodyColumns - 4)) return next(e)

    return drawPreview($.ui.resolve(e), draft, e.props.bodyColumns, e.props.maxRows)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !isLaidOut()) return next(e)

    const blocks = splitBlocks(e.props.text)
    if (!blocks) return next(e)

    const columns = e.viewport?.columns ?? 80
    const width = Math.max(20, columns - MESSAGE_GUTTER - RIGHT_MARGIN)
    return drawBlocks($.ui.resolve(e), blocks, width, e.props.isFirstOfReply)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !isLaidOut()) return next(e)

    const columns = e.viewport?.columns ?? 80
    const text = layoutPlainText(e.props.text, Math.max(20, columns - PROMPT_ROW_CHROME))

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })
}
