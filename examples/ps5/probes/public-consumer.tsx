import { resolve } from "node:path"
import {
  Box,
  Dialog,
  DialogContent,
  DialogOverlay,
  Show,
  Text,
  createEffect,
  createSignal,
  createTransition,
  focusedId,
  onCleanup,
} from "vexart"
import catalog from "../catalog.json"

export type ProbeSnapshot = {
  selected: number
  hero: string
  focus: string | null
  overlay: boolean
}

type Card = { id: string; title: string; cover: string; hero: string; accent: string }
const exampleRoot = resolve(import.meta.dir, "..")
const cards = (catalog as Card[]).map((entry) => ({
  ...entry,
  cover: resolve(exampleRoot, entry.cover),
  hero: resolve(exampleRoot, entry.hero),
}))
// Keep the entire retained row below the offscreen target's 2048px texture
// limit while still exercising a 24-card transformed horizontal strip. The
// advance is exactly card width + row gap so target geometry stays honest.
const cardWidth = 62
const cardHeight = 104
const cardGap = 16
const cardAdvance = cardWidth + cardGap
const viewportWidth = 440
const rowWidth = cards.length * cardWidth + (cards.length - 1) * cardGap

export function createProbeState() {
  const [selected, setSelected] = createSignal(0)
  const [overlay, setOverlay] = createSignal(false)
  const [openerFocus, setOpenerFocus] = createSignal<string | null>(null)
  const [heroFrom, setHeroFrom] = createSignal(0)
  const [heroTo, setHeroTo] = createSignal(0)
  const [rowOffset, setRowOffset] = createTransition(0, { duration: 250 })
  // Keep the probe's transition long enough for the offscreen oracle to
  // capture an actual intermediate frame even on a busy native backend.
  const [heroFade, setHeroFade] = createTransition(1, { duration: 1_000 })
  let fadeTimer: ReturnType<typeof setTimeout> | undefined

  const select = (index: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, index))
    if (next === selected()) return
    setSelected(next)
  }

  const openOverlay = () => {
    // DialogRoot snapshots the active focus scope during this public callback;
    // retain that exact opener id for the focus-restore oracle.
    setOpenerFocus(focusedId())
    setOverlay(true)
  }

  createEffect(() => {
    const index = selected()
    const maxOffset = Math.max(0, rowWidth - viewportWidth)
    const target = Math.min(maxOffset, Math.max(0, index * cardAdvance - 120))
    setRowOffset(-target)
    if (index === heroTo()) return
    setHeroFrom(heroTo())
    setHeroTo(index)
    setHeroFade(0)
    if (fadeTimer) clearTimeout(fadeTimer)
    fadeTimer = setTimeout(() => setHeroFade(1), 32)
  })

  onCleanup(() => {
    if (fadeTimer) clearTimeout(fadeTimer)
  })

  const snapshot = (): ProbeSnapshot => ({
    selected: selected(),
    hero: cards[heroTo()].hero,
    focus: focusedId(),
    overlay: overlay(),
  })

  return { selected, overlay, openerFocus, heroFrom, heroTo, heroFade, rowOffset, select, openOverlay, setOverlay, snapshot }
}

export function ProbeScene(props: { state?: ReturnType<typeof createProbeState> }) {
  const state = props.state ?? createProbeState()
  const closeOverlay = () => state.setOverlay(false)
  const handleCardKey = (event: { key: string }) => {
    if (event.key === "left" || event.key === "ArrowLeft") state.select(state.selected() - 1)
    if (event.key === "right" || event.key === "ArrowRight") state.select(state.selected() + 1)
  }

  return (
    <Box width={720} height={560} backgroundColor="#0b0d10" direction="column" padding={18} gap={10}>
      <Text color="#f5f5f5" fontSize={22}>PS5 public API gate</Text>
      <Box width={680} height={190} backgroundColor="#151a20" cornerRadius={16}>
        <img src={cards[state.heroFrom()].hero} width={680} height={190} objectFit="cover" opacity={state.heroFade() < 1 ? 1 - state.heroFade() : 0} />
        <img src={cards[state.heroTo()].hero} width={680} height={190} objectFit="cover" opacity={state.heroFade()} floating="parent" />
        <Box floating="parent" width={680} height={190} padding={18} direction="column" alignY="bottom">
          <Text color="#ffffff" fontSize={18}>{cards[state.heroTo()].title}</Text>
          <Text color="#ffffffb0" fontSize={12}>local image + retargeted crossfade</Text>
        </Box>
      </Box>
      <Text color="#b8bbc0" fontSize={12}>Transform + scrollX clip · 24 cards · selected: {state.selected() + 1}</Text>
      <Box width={viewportWidth} height={cardHeight} scrollX scrollId="ps5-public-row" layer backgroundColor="#090c11" cornerRadius={12}>
        <Box width={rowWidth} height={cardHeight} flexShrink={0} direction="row" gap={cardGap} transform={{ translateX: state.rowOffset() }}>
          {cards.map((card, index) => (
            <Box
              width={cardWidth}
              height={cardHeight}
              flexShrink={0}
              focusable
              onPress={() => state.select(index)}
              onKeyDown={handleCardKey}
              backgroundColor={card.accent}
              cornerRadius={12}
              borderColor={state.selected() === index ? "#ffffff" : "#ffffff32"}
              borderWidth={state.selected() === index ? 3 : 1}
              focusStyle={{ borderColor: "#ffffff", borderWidth: 3 }}
            >
              <img src={card.cover} width={cardWidth} height={cardHeight} objectFit="cover" cornerRadius={12} opacity={0.94} />
            </Box>
          ))}
        </Box>
      </Box>
      <Box direction="row" gap={10}>
        <Box width={180} height={34} focusable onPress={state.openOverlay} backgroundColor="#303640" cornerRadius={8} alignX="center" alignY="center" focusStyle={{ borderColor: "#ffffff", borderWidth: 2 }}>
          <Text color="#ffffff">Open overlay</Text>
        </Box>
        <Text color="#b8bbc0" fontSize={12}>focus: {focusedId() ?? "none"}</Text>
      </Box>
      <Show when={state.overlay()}>
        <Dialog onClose={closeOverlay}>
          <DialogOverlay backgroundColor="#000000b8" backdropBlur={4} />
          <DialogContent width={360} padding={20} cornerRadius={14} backgroundColor="#151a20">
            <Box direction="column" gap={14}>
              <Text color="#ffffff" fontSize={18}>Control center</Text>
              <Text color="#b8bbc0" fontSize={12}>Selection stays at card {state.selected() + 1}.</Text>
              <Box width={130} height={34} focusable onPress={closeOverlay} backgroundColor="#303640" cornerRadius={8} alignX="center" alignY="center" focusStyle={{ borderColor: "#ffffff", borderWidth: 2 }}>
                <Text color="#ffffff">Close</Text>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Show>
    </Box>
  )
}
