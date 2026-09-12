import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { createScrollHandle, focusedId, onInput, setFocus } from "@vexart/engine"

import { Button } from "@vexart/headless"
import { DemoFrame, Icon as DemoIcon, SearchField, ui, useDemo } from "./shared"

/** A local image used by the Studio demo. Every entry points at a checked-in asset. */
export type StudioImage = {
  id: string
  name: string
  src: string
  dimensions: string
  format: string
  size: string
  category: "landscapes" | "architecture" | "abstract"
}

const imagePath = (name: string) => new URL(`./assets/studio/${name}.png`, import.meta.url).pathname

const photoSeed: ReadonlyArray<Omit<StudioImage, "id" | "src"> & { slug: string }> = [
  { slug: "dunes", name: "dunes-01.jpg", dimensions: "3840 × 2560", format: "JPEG", size: "2.8 MB", category: "landscapes" },
  { slug: "coast", name: "coast-02.jpg", dimensions: "5472 × 3648", format: "JPEG", size: "4.1 MB", category: "landscapes" },
  { slug: "peaks", name: "peaks-03.jpg", dimensions: "6000 × 4000", format: "JPEG", size: "5.6 MB", category: "landscapes" },
  { slug: "forest", name: "forest-04.jpg", dimensions: "4240 × 2832", format: "JPEG", size: "3.7 MB", category: "landscapes" },
  { slug: "canyon", name: "canyon-05.jpg", dimensions: "7952 × 5304", format: "JPEG", size: "6.2 MB", category: "landscapes" },
  { slug: "dusk", name: "dusk-06.jpg", dimensions: "6000 × 4000", format: "JPEG", size: "4.8 MB", category: "landscapes" },
]

/**
 * Twelve library records are represented by six local photos and a
 * second crop of each. The paired records keep the mock's count honest while
 * avoiding network or invented image files.
 */
export const studioImages: StudioImage[] = photoSeed.flatMap((photo) => {
  const src = imagePath(photo.slug)
  return [{ ...photo, id: `${photo.slug}-01`, src }]
})

const studioDetailImages: StudioImage[] = photoSeed.map((photo) => ({
  ...photo,
  id: `${photo.slug}-02`,
  name: photo.name.replace(".jpg", "-detail.jpg"),
  src: imagePath(photo.slug),
}))

studioImages.push(...studioDetailImages)

const categoryLabels: Record<StudioCategory, string> = {
  all: "All images",
  landscapes: "Landscapes",
  architecture: "Architecture",
  abstract: "Abstract",
}

export type StudioCategory = "all" | "landscapes" | "architecture" | "abstract"
export type StudioView = "grid" | "list"

/**
 * State and filtering for the Studio gallery. Kept separate from the scene so
 * interaction tests can exercise the real selection/search contract without a
 * fake data adapter.
 */
export function createStudioModel() {
  const [query, setQuery] = createSignal("")
  const [category, setCategory] = createSignal<StudioCategory>("landscapes")
  const [selectedId, setSelectedId] = createSignal<string | null>("dunes-01")
  const [view, setView] = createSignal<StudioView>("grid")
  const [previewOpen, setPreviewOpen] = createSignal(false)
  const [fit, setFit] = createSignal<"fit" | "100%">("fit")

  const matching = (nextQuery: string, nextCategory: StudioCategory) => {
    const needle = nextQuery.trim().toLowerCase()
    return studioImages.filter((image) => {
      const categoryMatch = nextCategory === "all" || image.category === nextCategory
      const queryMatch = !needle || `${image.name} ${image.category}`.toLowerCase().includes(needle)
      return categoryMatch && queryMatch
    })
  }

  const filtered = createMemo(() => matching(query(), category()))
  const selected = createMemo(() => filtered().find((image) => image.id === selectedId()) ?? null)

  function reconcile(next: StudioImage[]) {
    if (!next.some((image) => image.id === selectedId())) setSelectedId(next[0]?.id ?? null)
    if (next.length === 0) setPreviewOpen(false)
  }

  function setQueryAndRestore(next: string) {
    setQuery(next)
    reconcile(matching(next, category()))
  }

  function select(id: string) {
    if (filtered().some((image) => image.id === id)) setSelectedId(id)
  }

  function setCategoryAndRestore(next: StudioCategory) {
    setCategory(next)
    reconcile(matching(query(), next))
  }

  return {
    query,
    setQuery: setQueryAndRestore,
    category,
    setCategory: setCategoryAndRestore,
    selectedId,
    select,
    selected,
    view,
    setView,
    previewOpen,
    setPreviewOpen,
    fit,
    setFit,
    filtered,
  }
}

type DemoScale = (value: number) => number

type StudioTextProps = Omit<JSX.IntrinsicElements["text"], "fontSize" | "fontFamily"> & { fontSize?: number; fontFamily?: string }

function StudioText(props: StudioTextProps) {
  const { s } = useDemo()
  return <text {...props} fontFamily={props.fontFamily ?? ui.sans} fontSize={Math.round(s(props.fontSize ?? 17))} />
}

function Absolute(props: {
  s: DemoScale
  x: number
  y: number
  width: number
  height: number
  children?: JSX.Element
  backgroundColor?: string | number
  borderColor?: string | number
  borderWidth?: number
  cornerRadius?: number
  direction?: "row" | "column"
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  padding?: number
  gap?: number
  zIndex?: number
  viewportClip?: boolean
  scrollY?: boolean
  scrollId?: string
  opacity?: number
}) {
  return (
    <box
      floating="parent"
      floatOffset={{ x: props.s(props.x), y: props.s(props.y) }}
      width={props.s(props.width)}
      height={props.s(props.height)}
      backgroundColor={props.backgroundColor}
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      cornerRadius={props.cornerRadius === undefined ? undefined : props.s(props.cornerRadius)}
      direction={props.direction}
      alignX={props.alignX}
      alignY={props.alignY}
      padding={props.padding === undefined ? undefined : props.s(props.padding)}
      gap={props.gap === undefined ? undefined : props.s(props.gap)}
      zIndex={props.zIndex}
      viewportClip={props.viewportClip}
      scrollY={props.scrollY}
      scrollId={props.scrollId}
      opacity={props.opacity}
    >
      {props.children}
    </box>
  )
}

function Icon(props: { name: "search" | "grid" | "list" | "library" | "landscape" | "architecture" | "abstract" | "printer" | "arrow" | "close"; size?: number; color?: string }) {
  const names = {
    search: "magnifying-glass",
    grid: "squares-four",
    list: "list",
    library: "images",
    landscape: "image",
    architecture: "buildings",
    abstract: "triangle",
    printer: "copy",
    arrow: "arrow-bend-down-left",
    close: "x",
  }
  const tone = props.color === "#f6bd49" || props.color === "#f7bd45" ? "amber" : props.color === "#141515" ? "ink" : props.color === "#888d91" || props.color === "#c9ccce" ? "muted" : "white"
  return <DemoIcon name={names[props.name] as Parameters<typeof DemoIcon>[0]["name"]} size={props.size ?? 18} tone={tone} />
}

function Meta(props: { s: DemoScale; x: number; y: number; text: string; width?: number; size?: number; color?: string }) {
  return (
    <Absolute s={props.s} x={props.x} y={props.y} width={props.width ?? 210} height={18}>
      <StudioText color={props.color ?? "#aeb0b1"} fontSize={props.size ?? 14} fontFamily={ui.mono}>{props.text}</StudioText>
    </Absolute>
  )
}

function ImageCard(props: { image: StudioImage; s: DemoScale; x: number; y: number; list: boolean; selected: () => boolean; onSelect: () => void; focusId: string }) {
  const width = props.list ? 462 : 221
  const height = props.list ? 82 : 221
  const thumbnailWidth = props.list ? 108 : 221
  const thumbnailHeight = props.list ? 80 : 171
  return (
    <Absolute s={props.s} x={props.x} y={props.y} width={width} height={height}>
      <Button
        focusId={props.focusId}
        onPress={props.onSelect}
        renderButton={(button) => (
          <box
            width={props.s(thumbnailWidth)}
            height={props.s(thumbnailHeight)}
            {...button.buttonProps}
            backgroundColor="#171a1b"
            borderColor={button.focused || props.selected() ? "#f6bd49" : "#303638"}
            borderWidth={button.focused || props.selected() ? props.s(2) : 1}
            cornerRadius={props.s(5)}
            focusStyle={{ borderColor: "#f6bd49", borderWidth: props.s(2) }}
          >
            <img src={props.image.src} width="100%" height="100%" objectFit="cover" cornerRadius={props.s(4)} />
          </box>
        )}
      />
      <Show when={!props.list}>
        <Absolute s={props.s} x={0} y={177} width={221} height={21}>
          <StudioText color="#f0f0f1" fontSize={17}>{props.image.name}</StudioText>
        </Absolute>
        <Meta s={props.s} x={0} y={199} text={props.image.dimensions} />
      </Show>
      <Show when={props.list}>
        <Absolute s={props.s} x={121} y={9} width={330} height={23}>
          <StudioText color="#f0f0f1" fontSize={16}>{props.image.name}</StudioText>
        </Absolute>
        <Meta s={props.s} x={121} y={37} text={`${props.image.dimensions}   ${props.image.size}`} />
      </Show>
    </Absolute>
  )
}

function GalleryCards(props: { s: DemoScale; images: () => StudioImage[]; list: boolean; selectedId: () => string | null; onSelect: (id: string) => void }) {
  return (
    <For each={props.images()}>
      {(image, index) => (
        <ImageCard
          image={image}
          s={props.s}
          list={props.list}
          x={props.list ? 20 : 21 + (index() % 2) * 241}
          y={props.list ? 17 + index() * 88 : 17 + Math.floor(index() / 2) * 246}
          selected={() => props.selectedId() === image.id}
          onSelect={() => props.onSelect(image.id)}
          focusId={`studio-card-${image.id}`}
        />
      )}
    </For>
  )
}

function CategoryButton(props: { s: DemoScale; id: string; y: number; label: string; icon: "library" | "landscape" | "architecture" | "abstract"; active: () => boolean; onPress: () => void }) {
  return (
    <Absolute s={props.s} x={9} y={props.y} width={208} height={49}>
      <Button
        focusId={props.id}
        onPress={props.onPress}
        renderButton={(button) => (
          <box
            width={props.s(208)}
            height={props.s(49)}
            {...button.buttonProps}
            direction="row"
            alignY="center"
            paddingX={props.s(18)}
            gap={props.s(14)}
            backgroundColor={props.active() ? "#202426" : "#0e1011"}
            borderColor={button.focused && !props.active() ? "#b8bec1" : props.active() ? "#202426" : "#0e1011"}
            borderWidth={button.focused && !props.active() ? props.s(1) : 0}
            cornerRadius={props.s(6)}
          >
            <Show when={props.active()}>
              <box floating="parent" floatOffset={{ x: 0, y: 0 }} width={props.s(3)} height={props.s(49)} backgroundColor="#f6bd49" cornerRadius={props.s(2)} pointerPassthrough />
            </Show>
            <Icon name={props.icon} size={18} color={props.active() ? "#f7bd45" : "#c2c6c8"} />
            <StudioText color={props.active() ? "#f1f1f1" : "#d2d4d5"} fontSize={17}>{props.label}</StudioText>
          </box>
        )}
      />
    </Absolute>
  )
}

function StudioCanvas(props: { width: number; height: number }) {
  const demo = useDemo()
  const s = demo.s
  const model = createStudioModel()
  const galleryScrollId = "studio-gallery"
  const galleryScroll = createScrollHandle(galleryScrollId)
  galleryScroll.scrollTo(0)
  let suppressSlash = false
  let previewReturnId = "studio-open-preview"

  const setQuery = (value: string) => {
    if (suppressSlash && value === `${model.query()}/`) {
      suppressSlash = false
      return
    }
    suppressSlash = false
    model.setQuery(value)
  }

  const visibleImages = createMemo(() => model.filtered())
  const selectedIndex = createMemo(() => visibleImages().findIndex((image) => image.id === model.selectedId()))
  const galleryContentHeight = createMemo(() => {
    const count = visibleImages().length
    if (model.view() === "list") return Math.max(746, 17 + count * 88)
    const rows = Math.ceil(count / 2)
    return Math.max(746, 17 + Math.max(0, rows - 1) * 246 + 221)
  })

  const openPreview = (returnId = focusedId() ?? "studio-open-preview") => {
    if (!model.selected()) return
    previewReturnId = returnId
    model.setPreviewOpen(true)
    queueMicrotask(() => {
      if (model.previewOpen()) setFocus("studio-close-preview")
    })
  }

  const closePreview = () => {
    model.setPreviewOpen(false)
    queueMicrotask(() => setFocus(previewReturnId))
  }

  function scrollToIndex(index: number) {
    const list = model.view() === "list"
    const top = list ? 17 + index * 88 : 17 + Math.floor(index / 2) * 246
    galleryScroll.scrollIntoView(s(top), s(list ? 82 : 221))
  }

  // Global shortcuts are subscribed before the focus dispatcher, so `/` can
  // move focus without also being inserted into the search field.
  const unsubscribeInput = onInput((event) => {
    if (event.type !== "key") return
    const current = focusedId()
    if (event.key === "escape" && model.previewOpen()) {
      closePreview()
      return
    }
    if (event.key === "/" && current !== "studio-search") {
      suppressSlash = true
      setFocus("studio-search")
      return
    }
    if (event.key === "enter" && current?.startsWith("studio-card-")) {
      openPreview(current)
      // The engine's focus subscriber is a singleton and may already precede
      // this demo after another render. Re-check after its synchronous press
      // handler so Enter remains a preview action in either subscriber order.
      queueMicrotask(() => {
        if (!model.previewOpen() && focusedId() === current) openPreview(current)
      })
      return
    }
    if (!current?.startsWith("studio-card-")) return
    const focusedIndex = visibleImages().findIndex((image) => `studio-card-${image.id}` === current)
    const index = focusedIndex >= 0 ? focusedIndex : selectedIndex()
    if (index < 0) return
    const columns = model.view() === "grid" ? 2 : 1
    if (event.key === "right" && columns === 2 && index + 1 < visibleImages().length) {
      model.select(visibleImages()[index + 1]!.id)
      setFocus(`studio-card-${visibleImages()[index + 1]!.id}`)
      scrollToIndex(index + 1)
    }
    if (event.key === "left" && columns === 2 && index > 0) {
      model.select(visibleImages()[index - 1]!.id)
      setFocus(`studio-card-${visibleImages()[index - 1]!.id}`)
      scrollToIndex(index - 1)
    }
    if (event.key === "down") {
      const next = Math.min(visibleImages().length - 1, index + columns)
      if (next !== index) {
        model.select(visibleImages()[next]!.id)
        setFocus(`studio-card-${visibleImages()[next]!.id}`)
        scrollToIndex(next)
      }
    }
    if (event.key === "up") {
      const next = Math.max(0, index - columns)
      if (next !== index) {
        model.select(visibleImages()[next]!.id)
        setFocus(`studio-card-${visibleImages()[next]!.id}`)
        scrollToIndex(next)
      }
    }
  })
  onCleanup(unsubscribeInput)

  const navItems = [
    { id: "studio-landscapes", label: "Landscapes", icon: "landscape" as const, category: "landscapes" as const, y: 163 },
    { id: "studio-all", label: "All images", icon: "library" as const, category: "all" as const, y: 114 },
    { id: "studio-architecture", label: "Architecture", icon: "architecture" as const, category: "architecture" as const, y: 212 },
    { id: "studio-abstract", label: "Abstract", icon: "abstract" as const, category: "abstract" as const, y: 261 },
  ]

  return (
    <box width={s(1536)} height={s(912)} floating="parent" floatOffset={{ x: 0, y: s(40) }} backgroundColor="#0e1011">
      {/* Sidebar */}
      <Absolute s={s} x={0} y={0} width={226} height={912} backgroundColor="#0d0f10" borderColor="#2b2e30" borderWidth={1}>
        <Absolute s={s} x={29} y={27} width={170} height={25}>
          <StudioText color="#f4f4f5" fontSize={20} fontWeight={700}>V E X A R T</StudioText>
        </Absolute>
        <Absolute s={s} x={29} y={60} width={160} height={23}>
          <StudioText color="#979b9e" fontSize={16}>Studio</StudioText>
        </Absolute>
        <For each={navItems}>
          {(item) => (
            <CategoryButton
              s={s}
              id={item.id}
              y={item.y}
              label={item.label}
              icon={item.icon}
              active={() => model.category() === item.category}
              onPress={() => model.setCategory(item.category)}
            />
          )}
        </For>
        <Absolute s={s} x={29} y={341} width={177} height={1} backgroundColor="#2a2d2f" />
        <Absolute s={s} x={29} y={361} width={180} height={19}>
          <StudioText color="#777d80" fontSize={12} fontFamily={ui.mono}>LOCAL LIBRARY</StudioText>
        </Absolute>
      </Absolute>

      {/* Toolbar */}
      <Absolute s={s} x={226} y={0} width={1310} height={78} borderColor="#2b2e30" borderWidth={1}>
        <Absolute s={s} x={23} y={22} width={180} height={34}>
          <StudioText color="#f0f1f2" fontSize={26} fontWeight={500}>{categoryLabels[model.category()]}</StudioText>
        </Absolute>
        <Absolute s={s} x={192} y={29} width={100} height={23}>
          <StudioText color="#919699" fontSize={15} fontFamily={ui.mono}>{model.filtered().length} images</StudioText>
        </Absolute>
        <Absolute s={s} x={918} y={17} width={244} height={43}>
          <SearchField
            x={0}
            y={0}
            width={244}
            height={43}
            id="studio-search"
            value={model.query()}
            onChange={setQuery}
            placeholder="Search images"
          />
        </Absolute>
        <Absolute s={s} x={1180} y={17} width={107} height={43} direction="row">
          <Button focusId="studio-grid" onPress={() => model.setView("grid")} renderButton={(button) => (
            <box width={s(54)} height={s(43)} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.view() === "grid" ? "#25292b" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#3a3e40"} borderWidth={1} cornerRadius={s(7)}><Icon name="grid" size={25} /></box>
          )} />
          <Button focusId="studio-list" onPress={() => model.setView("list")} renderButton={(button) => (
            <box width={s(54)} height={s(43)} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.view() === "list" ? "#25292b" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#3a3e40"} borderWidth={1} cornerRadius={s(7)}><Icon name="list" size={25} /></box>
          )} />
        </Absolute>
      </Absolute>

      {/* Gallery and preview body */}
      <Absolute s={s} x={226} y={78} width={1310} height={834} viewportClip>
        <Absolute s={s} x={0} y={0} width={504} height={834} borderColor="#2b2e30" borderWidth={1}>
          <Absolute s={s} x={0} y={0} width={504} height={746} viewportClip scrollY scrollId={galleryScrollId}>
            <box width={s(1)} height={s(galleryContentHeight())} pointerPassthrough />
            <Show when={visibleImages().length > 0} fallback={<EmptyState s={s} />}>
              <Show when={model.view() === "list"} fallback={<GalleryCards s={s} images={visibleImages} list={false} selectedId={model.selectedId} onSelect={model.select} />}>
                <GalleryCards s={s} images={visibleImages} list selectedId={model.selectedId} onSelect={model.select} />
              </Show>
            </Show>
          </Absolute>
        </Absolute>
        <PreviewPanel s={s} model={model} onOpen={() => openPreview()} />
      </Absolute>

      <Show when={model.previewOpen()}>
        <PreviewOverlay s={s} model={model} onClose={closePreview} />
      </Show>
    </box>
  )
}

function EmptyState(props: { s: DemoScale }) {
  return (
    <Absolute s={props.s} x={74} y={280} width={350} height={150} alignX="center" alignY="center">
      <StudioText color="#d9dcde" fontSize={18}>No images found</StudioText>
      <StudioText color="#81878a" fontSize={14}>Try another search or collection.</StudioText>
    </Absolute>
  )
}

function PreviewEmpty(props: { s: DemoScale }) {
  return (
    <Absolute s={props.s} x={504} y={0} width={806} height={834} alignX="center" alignY="center">
      <StudioText color="#d9dcde" fontSize={18}>No image selected</StudioText>
      <StudioText color="#81878a" fontSize={14}>Search or choose another collection.</StudioText>
    </Absolute>
  )
}

function PreviewContent(props: { s: DemoScale; image: StudioImage; model: ReturnType<typeof createStudioModel>; onOpen: () => void }) {
  return (
    <>
      <Absolute s={props.s} x={21} y={23} width={430} height={28}>
        <StudioText color="#f1f2f3" fontSize={20} fontWeight={600}>{props.image.name}</StudioText>
      </Absolute>
      <Absolute s={props.s} x={640} y={19} width={126} height={35} direction="row">
        <Button focusId="studio-fit" onPress={() => props.model.setFit("fit")} renderButton={(button) => (
          <box width={props.s(69)} height={props.s(35)} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={props.model.fit() === "fit" ? "#3a3d3f" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#55595b"} borderWidth={1} cornerRadius={props.s(6)}><StudioText color="#eceeef" fontSize={13}>Fit</StudioText></box>
        )} />
        <Button focusId="studio-100" onPress={() => props.model.setFit("100%")} renderButton={(button) => (
          <box width={props.s(57)} height={props.s(35)} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={props.model.fit() === "100%" ? "#3a3d3f" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#55595b"} borderWidth={1} cornerRadius={props.s(6)}><StudioText color="#e5e7e8" fontSize={13}>100%</StudioText></box>
        )} />
      </Absolute>
      <Absolute s={props.s} x={18} y={63} width={770} height={602} backgroundColor="#0c0f11" borderColor="#2d3234" borderWidth={1} cornerRadius={4} viewportClip>
        <img src={props.image.src} width="100%" height="100%" objectFit={props.model.fit() === "fit" ? "contain" : "none"} cornerRadius={props.s(3)} />
      </Absolute>
      <Absolute s={props.s} x={20} y={684} width={770} height={24}>
        <StudioText color="#9da2a5" fontSize={14} fontFamily={ui.mono}>{props.image.dimensions}  |  {props.image.format}  |  {props.image.size}</StudioText>
      </Absolute>
      <Absolute s={props.s} x={18} y={724} width={770} height={40}>
        <Button focusId="studio-open-preview" onPress={props.onOpen} renderButton={(button) => (
          <box width={props.s(770)} height={props.s(40)} {...button.buttonProps} alignX="left" alignY="center" paddingX={props.s(21)} backgroundColor="#171a1b" borderColor={button.focused ? "#f6bd49" : "#353a3c"} borderWidth={1} cornerRadius={props.s(6)}>
            <box direction="row" alignY="center" gap={props.s(8)}>
              <StudioText color="#d7dadc" fontSize={14}>Open preview</StudioText>
              <Icon name="arrow" size={14} color="#b7bbbe" />
            </box>
          </box>
        )} />
      </Absolute>
    </>
  )
}

function PreviewPanel(props: { s: DemoScale; model: ReturnType<typeof createStudioModel>; onOpen: () => void }) {
  return (
    <Show when={props.model.selected()} fallback={<PreviewEmpty s={props.s} />}>
      {image => <Absolute s={props.s} x={504} y={0} width={806} height={834}><PreviewContent s={props.s} image={image()} model={props.model} onOpen={props.onOpen} /></Absolute>}
    </Show>
  )
}

function PreviewOverlay(props: { s: DemoScale; model: ReturnType<typeof createStudioModel>; onClose: () => void }) {
  onMount(() => queueMicrotask(() => {
    if (props.model.previewOpen()) setFocus("studio-close-preview")
  }))
  return (
    <Show when={props.model.selected()}>
      {image => (
        <Absolute s={props.s} x={0} y={0} width={1536} height={912} zIndex={80} backgroundColor="#080a0cee">
          <Absolute s={props.s} x={36} y={27} width={900} height={28}>
            <StudioText color="#f0f2f3" fontSize={20}>{image().name}</StudioText>
          </Absolute>
          <Absolute s={props.s} x={1460} y={21} width={40} height={40}>
            <Button focusId="studio-close-preview" onPress={props.onClose} renderButton={(button) => (
              <box width={props.s(40)} height={props.s(40)} {...button.buttonProps} alignX="center" alignY="center" backgroundColor="#1a1d1f" borderColor={button.focused ? "#f6bd49" : "#3d4143"} borderWidth={1} cornerRadius={props.s(6)}><Icon name="close" size={24} /></box>
            )} />
          </Absolute>
          <Absolute s={props.s} x={155} y={78} width={1226} height={722} backgroundColor="#0b0e10" borderColor="#363b3d" borderWidth={1} cornerRadius={5}>
            <img src={image().src} width="100%" height="100%" objectFit="contain" cornerRadius={props.s(4)} />
          </Absolute>
          <Absolute s={props.s} x={37} y={848} width={800} height={22}>
            <StudioText color="#898f92" fontSize={13} fontFamily={ui.mono}>Escape to close  ·  {image().dimensions}</StudioText>
          </Absolute>
        </Absolute>
      )}
    </Show>
  )
}

export type StudioAppProps = { width: number; height: number }

export function StudioApp(props: StudioAppProps) {
  return (
    <DemoFrame width={props.width} height={props.height} title="vexart — studio" hints={[
      { keys: "↑ ↓", label: "Navigate" },
      { keys: "↵", label: "Preview" },
      { keys: "/", label: "Search" },
      { keys: "Esc", label: "Back" },
    ]}>
      <StudioCanvas width={props.width} height={props.height} />
    </DemoFrame>
  )
}

export default StudioApp
