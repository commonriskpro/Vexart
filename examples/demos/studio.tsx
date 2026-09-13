import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
  createScrollHandle,
  focusedId,
  onInput,
  setFocus,
  Button,
} from "vexart"
import { Icon as DemoIcon, SearchField, ui, DemoFooter } from "./shared"

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

function Icon(props: {
  name: "search" | "grid" | "list" | "library" | "landscape" | "architecture" | "abstract" | "printer" | "arrow" | "close"
  size?: number
  color?: string
}) {
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

function CategoryButton(props: {
  id: string
  label: string
  icon: "library" | "landscape" | "architecture" | "abstract"
  active: () => boolean
  onPress: () => void
}) {
  return (
    <Button
      focusId={props.id}
      onPress={props.onPress}
      renderButton={(button) => (
        <box
          width={206}
          height={46}
          {...button.buttonProps}
          direction="row"
          alignY="center"
          paddingX={16}
          gap={14}
          backgroundColor={props.active() ? "#202426" : "#0d0f10"}
          borderColor={button.focused && !props.active() ? "#b8bec1" : props.active() ? "#202426" : "#0d0f10"}
          borderWidth={button.focused && !props.active() ? 1 : 0}
          cornerRadius={6}
        >
          <Show when={props.active()}>
            <box floating="parent" floatOffset={{ x: 0, y: 0 }} width={3} height={46} backgroundColor="#f6bd49" cornerRadius={2} pointerPassthrough />
          </Show>
          <Icon name={props.icon} size={18} color={props.active() ? "#f7bd45" : "#c2c6c8"} />
          <text color={props.active() ? "#f1f1f1" : "#d2d4d5"} fontSize={16} fontFamily={ui.sans}>{props.label}</text>
        </box>
      )}
    />
  )
}

function ImageCard(props: {
  image: StudioImage
  x: number
  y: number
  list: boolean
  selected: () => boolean
  onSelect: () => void
  focusId: string
}) {
  const width = props.list ? 462 : 221
  const height = props.list ? 82 : 221
  const thumbnailWidth = props.list ? 108 : 221
  const thumbnailHeight = props.list ? 80 : 171
  return (
    <box floating="parent" floatOffset={{ x: props.x, y: props.y }} width={width} height={height}>
      <Button
        focusId={props.focusId}
        onPress={props.onSelect}
        renderButton={(button) => (
          <box
            width={thumbnailWidth}
            height={thumbnailHeight}
            {...button.buttonProps}
            backgroundColor="#171a1b"
            borderColor={button.focused || props.selected() ? "#f6bd49" : "#303638"}
            borderWidth={button.focused || props.selected() ? 2 : 1}
            cornerRadius={5}
            focusStyle={{ borderColor: "#f6bd49", borderWidth: 2 }}
          >
            <img src={props.image.src} width="100%" height="100%" objectFit="cover" cornerRadius={4} />
          </box>
        )}
      />
      <Show when={!props.list}>
        <box floating="parent" floatOffset={{ x: 0, y: 177 }} width={221} height={21}>
          <text color="#f0f0f1" fontSize={16} fontFamily={ui.sans}>{props.image.name}</text>
        </box>
        <box floating="parent" floatOffset={{ x: 0, y: 199 }} width={221} height={18}>
          <text color="#aeb0b1" fontSize={13} fontFamily={ui.mono}>{props.image.dimensions}</text>
        </box>
      </Show>
      <Show when={props.list}>
        <box floating="parent" floatOffset={{ x: 121, y: 9 }} width={330} height={23}>
          <text color="#f0f0f1" fontSize={16} fontFamily={ui.sans}>{props.image.name}</text>
        </box>
        <box floating="parent" floatOffset={{ x: 121, y: 37 }} width={330} height={18}>
          <text color="#aeb0b1" fontSize={13} fontFamily={ui.mono}>{`${props.image.dimensions}   ${props.image.size}`}</text>
        </box>
      </Show>
    </box>
  )
}

function GalleryCards(props: {
  images: () => StudioImage[]
  list: boolean
  selectedId: () => string | null
  onSelect: (id: string) => void
}) {
  return (
    <For each={props.images()}>
      {(image, index) => (
        <ImageCard
          image={image}
          list={props.list}
          x={props.list ? 20 : 20 + (index() % 2) * 241}
          y={props.list ? 17 + index() * 88 : 17 + Math.floor(index() / 2) * 246}
          selected={() => props.selectedId() === image.id}
          onSelect={() => props.onSelect(image.id)}
          focusId={`studio-card-${image.id}`}
        />
      )}
    </For>
  )
}

function EmptyState() {
  return (
    <box width="100%" height="100%" alignX="center" alignY="center" direction="column" gap={6}>
      <text color="#d9dcde" fontSize={18} fontFamily={ui.sans}>No images found</text>
      <text color="#81878a" fontSize={14} fontFamily={ui.sans}>Try another search or collection.</text>
    </box>
  )
}

function PreviewEmpty() {
  return (
    <box width="grow" height="100%" alignX="center" alignY="center" direction="column" gap={6}>
      <text color="#d9dcde" fontSize={18} fontFamily={ui.sans}>No image selected</text>
      <text color="#81878a" fontSize={14} fontFamily={ui.sans}>Search or choose another collection.</text>
    </box>
  )
}

function PreviewOverlay(props: {
  width: number
  height: number
  model: ReturnType<typeof createStudioModel>
  onClose: () => void
}) {
  onMount(() => queueMicrotask(() => {
    if (props.model.previewOpen()) setFocus("studio-close-preview")
  }))
  return (
    <Show when={props.model.selected()}>
      {image => (
        <box floating="parent" floatOffset={{ x: 0, y: 0 }} width={props.width} height={props.height} zIndex={80} backgroundColor="#080a0cee" direction="column" padding={24} gap={16}>
          <box width="100%" direction="row" alignY="center" alignX="space-between">
            <text color="#f0f2f3" fontSize={20} fontFamily={ui.sans}>{image().name}</text>
            <Button focusId="studio-close-preview" onPress={props.onClose} renderButton={(button) => (
              <box width={40} height={40} {...button.buttonProps} alignX="center" alignY="center" backgroundColor="#1a1d1f" borderColor={button.focused ? "#f6bd49" : "#3d4143"} borderWidth={1} cornerRadius={6}>
                <Icon name="close" size={24} />
              </box>
            )} />
          </box>
          <box width="100%" height="grow" backgroundColor="#0b0e10" borderColor="#363b3d" borderWidth={1} cornerRadius={5} viewportClip>
            <img src={image().src} width="100%" height="100%" objectFit="contain" cornerRadius={4} />
          </box>
          <box width="100%" height={22}>
            <text color="#898f92" fontSize={13} fontFamily={ui.mono}>Escape to close  ·  {image().dimensions}</text>
          </box>
        </box>
      )}
    </Show>
  )
}

export type StudioAppProps = { width?: number; height?: number }

export function StudioApp(props: StudioAppProps) {
  const width = () => props.width ?? 1536
  const height = () => props.height ?? 1024

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

  const previewButtonWidth = () => Math.max(200, width() - 770)

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
    galleryScroll.scrollIntoView(top, list ? 82 : 221)
  }

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
    { id: "studio-all", label: "All images", icon: "library" as const, category: "all" as const },
    { id: "studio-landscapes", label: "Landscapes", icon: "landscape" as const, category: "landscapes" as const },
    { id: "studio-architecture", label: "Architecture", icon: "architecture" as const, category: "architecture" as const },
    { id: "studio-abstract", label: "Abstract", icon: "abstract" as const, category: "abstract" as const },
  ]

  return (
    <box width={width()} height={height()} direction="column" backgroundColor="#0e1011">
      {/* Main app body: Sidebar + Content */}
      <box width="100%" height="grow" direction="row">
        {/* Sidebar */}
        <box width={226} height="100%" backgroundColor="#0d0f10" borderColor="#2b2e30" borderRight={1} direction="column">
          <box paddingX={24} paddingTop={24} paddingBottom={20} direction="column" gap={4}>
            <text color="#f4f4f5" fontSize={20} fontWeight={700} fontFamily={ui.sans}>V E X A R T</text>
            <text color="#979b9e" fontSize={16} fontFamily={ui.sans}>Studio</text>
          </box>
          <box direction="column" gap={4} paddingX={10}>
            <For each={navItems}>
              {(item) => (
                <CategoryButton
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={() => model.category() === item.category}
                  onPress={() => model.setCategory(item.category)}
                />
              )}
            </For>
          </box>
          <box marginX={20} marginY={20} height={1} backgroundColor="#2a2d2f" />
          <box paddingX={24}>
            <text color="#777d80" fontSize={12} fontFamily={ui.mono}>LOCAL LIBRARY</text>
          </box>
        </box>

        {/* Content Area: Toolbar + Body */}
        <box width="grow" height="100%" direction="column">
          {/* Toolbar */}
          <box width="100%" height={78} borderColor="#2b2e30" borderBottom={1} direction="row" alignY="center" alignX="space-between" paddingX={24}>
            <box direction="row" alignY="center" gap={16}>
              <text color="#f0f1f2" fontSize={26} fontWeight={500} fontFamily={ui.sans}>{categoryLabels[model.category()]}</text>
              <text color="#919699" fontSize={15} fontFamily={ui.mono}>{model.filtered().length} images</text>
            </box>
            <box direction="row" alignY="center" gap={16}>
              <SearchField
                width={244}
                height={43}
                id="studio-search"
                value={model.query()}
                onChange={setQuery}
                placeholder="Search images"
              />
              <box direction="row">
                <Button focusId="studio-grid" onPress={() => model.setView("grid")} renderButton={(button) => (
                  <box width={54} height={43} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.view() === "grid" ? "#25292b" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#3a3e40"} borderWidth={1} cornerRadius={7}>
                    <Icon name="grid" size={24} />
                  </box>
                )} />
                <Button focusId="studio-list" onPress={() => model.setView("list")} renderButton={(button) => (
                  <box width={54} height={43} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.view() === "list" ? "#25292b" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#3a3e40"} borderWidth={1} cornerRadius={7}>
                    <Icon name="list" size={24} />
                  </box>
                )} />
              </box>
            </box>
          </box>

          {/* Gallery and Preview Panels */}
          <box width="100%" height="grow" direction="row">
            {/* Gallery Column */}
            <box width={504} height="100%" borderColor="#2b2e30" borderRight={1}>
              <box width="100%" height="100%" viewportClip scrollY scrollId={galleryScrollId}>
                <box width={1} height={galleryContentHeight()} pointerPassthrough />
                <Show when={visibleImages().length > 0} fallback={<EmptyState />}>
                  <Show when={model.view() === "list"} fallback={<GalleryCards images={visibleImages} list={false} selectedId={model.selectedId} onSelect={model.select} />}>
                    <GalleryCards images={visibleImages} list selectedId={model.selectedId} onSelect={model.select} />
                  </Show>
                </Show>
              </box>
            </box>

            {/* Preview Panel */}
            <Show when={model.selected()} fallback={<PreviewEmpty />}>
              {(image) => (
                <box width="grow" height="100%" direction="column" padding={20} gap={12}>
                  {/* Top Bar: Name + Fit/100% controls */}
                  <box width="100%" height={36} direction="row" alignY="center" alignX="space-between">
                    <text color="#f1f2f3" fontSize={20} fontWeight={600} fontFamily={ui.sans}>{image().name}</text>
                    <box direction="row" gap={4}>
                      <Button focusId="studio-fit" onPress={() => model.setFit("fit")} renderButton={(button) => (
                        <box width={69} height={35} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.fit() === "fit" ? "#3a3d3f" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#55595b"} borderWidth={1} cornerRadius={6}>
                          <text color="#eceeef" fontSize={13} fontFamily={ui.sans}>Fit</text>
                        </box>
                      )} />
                      <Button focusId="studio-100" onPress={() => model.setFit("100%")} renderButton={(button) => (
                        <box width={57} height={35} {...button.buttonProps} alignX="center" alignY="center" backgroundColor={model.fit() === "100%" ? "#3a3d3f" : "#171a1b"} borderColor={button.focused ? "#f6bd49" : "#55595b"} borderWidth={1} cornerRadius={6}>
                          <text color="#e5e7e8" fontSize={13} fontFamily={ui.sans}>100%</text>
                        </box>
                      )} />
                    </box>
                  </box>

                  {/* Large Image Box */}
                  <box width="100%" height="grow" backgroundColor="#0c0f11" borderColor="#2d3234" borderWidth={1} cornerRadius={4} viewportClip>
                    <img src={image().src} width="100%" height="100%" objectFit={model.fit() === "fit" ? "contain" : "none"} cornerRadius={3} />
                  </box>

                  {/* Metadata line */}
                  <box width="100%" height={24} alignY="center">
                    <text color="#9da2a5" fontSize={14} fontFamily={ui.mono}>{image().dimensions}  |  {image().format}  |  {image().size}</text>
                  </box>

                  {/* Open preview button */}
                  <Button focusId="studio-open-preview" onPress={() => openPreview()} renderButton={(button) => (
                    <box width={previewButtonWidth()} height={40} {...button.buttonProps} alignX="left" alignY="center" paddingX={21} backgroundColor="#171a1b" borderColor={button.focused ? "#f6bd49" : "#353a3c"} borderWidth={1} cornerRadius={6}>
                      <box direction="row" alignY="center" gap={8}>
                        <text color="#d7dadc" fontSize={14} fontFamily={ui.sans}>Open preview</text>
                        <Icon name="arrow" size={14} color="#b7bbbe" />
                      </box>
                    </box>
                  )} />
                </box>
              )}
            </Show>
          </box>
        </box>
      </box>

      {/* Footer */}
      <DemoFooter hints={[
        { keys: "↑ ↓", label: "Navigate" },
        { keys: "↵", label: "Preview" },
        { keys: "/", label: "Search" },
        { keys: "Esc", label: "Back" },
      ]} />

      {/* Fullscreen Preview Overlay */}
      <Show when={model.previewOpen()}>
        <PreviewOverlay width={width()} height={height()} model={model} onClose={closePreview} />
      </Show>
    </box>
  )
}

export default StudioApp
