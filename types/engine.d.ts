import { Accessor } from 'solid-js';
import { createContext } from 'solid-js';
import { dlopen } from 'bun:ffi';
import { ErrorBoundary } from 'solid-js';
import { FFIType } from 'bun:ffi';
import { For } from 'solid-js';
import { Index } from 'solid-js';
import type { JSX } from 'solid-js';
import { Match } from 'solid-js';
import { Setter } from 'solid-js';
import { Show } from 'solid-js';
import { Switch } from 'solid-js';
import { useContext } from 'solid-js';

/**
 * Register additional parsers before client initialization.
 *
 * @public
 */
export declare function addDefaultParsers(parsers: FiletypeParserConfig[]): void;

/** @public Horizontal alignment enum for layout adapter alignment values. */
export declare const ALIGN_X: {
    readonly LEFT: 0;
    readonly RIGHT: 1;
    readonly CENTER: 2;
    readonly SPACE_BETWEEN: 3;
};

/** @public Vertical alignment enum for layout adapter alignment values. */
export declare const ALIGN_Y: {
    readonly TOP: 0;
    readonly BOTTOM: 1;
    readonly CENTER: 2;
    readonly SPACE_BETWEEN: 3;
};

/**
 * Assert that actual matches expected.
 * Throws VexartNativeError on mismatch — does NOT call the native library.
 * Used by the TS mount path and by tests to validate the version contract.
 *
 * @param actual - version number returned by vexartVersion() or a test override
 * @param expected - expected version (default: EXPECTED_BRIDGE_VERSION)
 */
/** @public */
export declare function assertBridgeVersion(actual: number, expected?: number): void;

/** @public */
export declare const BACKDROP_FILTER_KIND: {
    readonly BLUR: "blur";
    readonly COLOR: "color";
    readonly BLUR_COLOR: "blur-color";
};

/** @public */
export declare type BackdropFilterKind = (typeof BACKDROP_FILTER_KIND)[keyof typeof BACKDROP_FILTER_KIND];

/** @public */
export declare interface BackdropFilterParams {
    blur: number | null;
    brightness: number | null;
    contrast: number | null;
    saturate: number | null;
    grayscale: number | null;
    invert: number | null;
    sepia: number | null;
    hueRotate: number | null;
}

/** @public */
export declare interface BackdropRenderMetadata {
    backdropSourceKey: string;
    filterKind: BackdropFilterKind;
    filterParams: BackdropFilterParams;
    inputBounds: RenderBounds;
    sampleBounds: RenderBounds;
    outputBounds: RenderBounds;
    clipBounds: RenderBounds;
    transformStateId: number;
    clipStateId: number;
    effectStateId: number;
}

/** @public */
export declare function beginNodeInteraction(node: TGENode, mode: Exclude<InteractionMode, "none">): void;

/** @public */
export declare function beginSync(write: (data: string) => void): void;

/** @public */
export declare type BezierCmd = {
    kind: "bezier";
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    x1: number;
    y1: number;
    color: number;
    width: number;
};

/** @public */
export declare function bindLoop(loop: RenderLoop): void;

/** @public */
export declare function boostWindowFor(kind: InteractionKind, boosts: FrameSchedulerBoosts): number;

/** @public */
export declare type BorderRenderInputs = {
    radius: number;
    width: number;
    cornerRadii: {
        tl: number;
        tr: number;
        br: number;
        bl: number;
    } | null;
};

/** @public */
export declare type BorderRenderOp = {
    kind: "border";
    renderObjectId: number | null;
    command: RenderCommand;
    inputs: BorderRenderInputs;
};

/** @public */
export declare function buildNodeMouseEvent(node: TGENode, pointerX: number, pointerY: number): NodeMouseEvent;

/** @public */
export declare function buildRenderGraphFrame(commands: RenderCommand[], queues: RenderGraphQueues, textMetaMap: Map<number, TextMeta>): RenderGraphFrame;

/** @public */
export declare function buildRenderOp(cmd: RenderCommand, queues: RenderGraphQueues, queueState: RenderGraphQueueState, textMetaMap: Map<number, TextMeta>, ownerIds?: {
    rect: number | null;
    text: number | null;
}): RenderGraphOp | null;

/** @public */
export declare class CanvasContext {
    /** @internal draw command buffer — flushed by paintCanvasCommands */
    _commands: DrawCmd[];
    /** Current viewport transform — set by the render loop from props */
    viewport: Viewport;
    constructor(viewport?: Viewport);
    /** Clear the command buffer (called at start of each frame) */
    _reset(viewport?: Viewport): void;
    /** Draw an anti-aliased line segment. */
    line(x0: number, y0: number, x1: number, y1: number, style: StrokeStyle): void;
    /** Draw a quadratic bezier curve. */
    bezier(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, style: StrokeStyle): void;
    /** Draw a circle or ellipse. */
    circle(cx: number, cy: number, radius: number, style?: ShapeStyle): void;
    /** Draw an ellipse. */
    ellipse(cx: number, cy: number, rx: number, ry: number, style?: ShapeStyle): void;
    /** Draw a regular polygon (3=triangle, 4=square, 5=pentagon, 6=hexagon, etc). */
    polygon(cx: number, cy: number, radius: number, sides: number, style?: ShapeStyle & {
        rotation?: number;
    }): void;
    /** Draw a rectangle (optionally rounded). */
    rect(x: number, y: number, w: number, h: number, style?: ShapeStyle & {
        radius?: number;
    }): void;
    /** Draw text at a position. */
    text(x: number, y: number, text: string, color: number): void;
    /** Draw a glow/halo effect (useful for node highlights). */
    glow(cx: number, cy: number, rx: number, ry: number, color: number, intensity?: number): void;
    /** Draw a pre-decoded RGBA image buffer, scaled to fit (x,y,w,h). */
    drawImage(x: number, y: number, w: number, h: number, data: Uint8Array, imgW: number, imgH: number, opacity?: number, opaque?: boolean): void;
    /** Fill a radial gradient (circle fade from center color to edge color). */
    radialGradient(cx: number, cy: number, radius: number, from: number, to: number): void;
    /** Fill a linear gradient in a rectangular area. angle in degrees (0=left→right, 90=top→bottom). */
    linearGradient(x: number, y: number, w: number, h: number, from: number, to: number, angle?: number): void;
    /** Paint a procedural nebula field. Prefer baking once into an offscreen buffer for performance-sensitive scenes. */
    nebula(x: number, y: number, w: number, h: number, stops: {
        color: number;
        position: number;
    }[], options?: {
        seed?: number;
        scale?: number;
        octaves?: number;
        gain?: number;
        lacunarity?: number;
        warp?: number;
        detail?: number;
        dust?: number;
    }): void;
    /** Paint a procedural starfield. Prefer baking once into an offscreen buffer for static scenes. */
    starfield(x: number, y: number, w: number, h: number, options?: {
        seed?: number;
        count?: number;
        clusterCount?: number;
        clusterStars?: number;
        warmColor?: number;
        neutralColor?: number;
        coolColor?: number;
    }): void;
}

/** @public */
export declare type CanvasDrawCommand = DrawCmd;

/** @public */
export declare type CanvasPaintConfig = {
    renderObjectId?: number;
    color: number;
    onDraw: (ctx: CanvasContext) => void;
    displayListCommands?: DrawCmd[];
    viewport?: {
        x: number;
        y: number;
        zoom: number;
    };
    nativeDisplayListHandle?: bigint | null;
    displayListHash?: string | null;
};

/** @public */
export declare type CanvasRenderOp = {
    kind: "canvas";
    renderObjectId: number | null;
    command: RenderCommand;
    rect: RectangleRenderOp;
    canvas: CanvasPaintConfig;
};

/** @public */
export declare type Capabilities = {
    /** Terminal emulator name */
    kind: TerminalKind;
    /** Kitty graphics protocol (pixel images) */
    kittyGraphics: boolean;
    /** Kitty Unicode placeholders (pixel images in tmux) */
    kittyPlaceholder: boolean;
    /** Kitty keyboard protocol (enhanced key events) */
    kittyKeyboard: boolean;
    /** Sixel graphics support */
    sixel: boolean;
    /** 24-bit true color (16M colors) */
    truecolor: boolean;
    /** SGR mouse protocol (1006) */
    mouse: boolean;
    /** Focus in/out events (1004) */
    focus: boolean;
    /** Bracketed paste mode (2004) */
    bracketedPaste: boolean;
    /** Synchronized output (mode 2026) */
    syncOutput: boolean;
    /** Running inside tmux */
    tmux: boolean;
    /** Parent terminal behind tmux (if applicable) */
    parentKind: TerminalKind | null;
    /**
     * Best available Kitty graphics transmission mode.
     *   - "shm":    POSIX shared memory (fastest, ~0.01ms per frame)
     *   - "file":   temp file (fast, ~1-2ms per frame)
     *   - "direct": base64 escape codes (universal, ~5-10ms per frame)
     *
     * Auto-detected during createTerminal(). SSH/remote → always "direct".
     */
    transmissionMode: "shm" | "file" | "direct";
};

/** @public */
export declare function chooseGpuLayerStrategy(input: GpuLayerStrategyInput, nativePlanOverride?: NativeFramePlan | null): GpuLayerStrategyMode;

/** @public */
export declare type CircleCmd = {
    kind: "circle";
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    fill?: number;
    stroke?: number;
    strokeWidth: number;
};

/** @public */
export declare function clearDirty(expectedVersion?: number): void;

/** Clear the image cache (e.g., on hot reload). */
/** @public */
export declare function clearImageCache(): void;

/** @public */
export declare function clearSelection(): void;

/** Clear all prepared text caches. */
/** @public */
export declare function clearTextCache(): void;

/** @public */
export declare function cloneRenderGraphQueues(queues: RenderGraphQueues): RenderGraphQueues;

/** Close the library (if open) and reset the singleton. */
/** @public */
export declare function closeVexartLibrary(): void;

/**
 * Compositor-thread animation fast path (REQ-2B-301 through REQ-2B-305).
 *
 * When createTransition or createSpring targets 'transform' or 'opacity',
 * an AnimationDescriptor is registered here. The frame loop can then detect
 * when ONLY compositor-animated properties changed and skip the expensive
 * reconciler→walkTree→layout→paint pipeline.
 *
 * Phase 2b: Descriptor table + detection logic is in place.
 * The actual uniform-only GPU update falls back to full repaint initially;
 * the fast-path GPU plumbing lands in Phase 3.
 *
 * Architecture note:
 *   TS: createSpring/createTransition → registerAnimationDescriptor()
 *   Frame loop: isCompositorOnlyFrame() → if true, skip reconciler/paint
 *   GPU: (Phase 3) vexart_composite_update_uniform(target, nodeId, matrix)
 */
/** @public Properties that can animate on the compositor thread. */
export declare type CompositorProperty = "transform" | "opacity";

/** @public */
export declare const COMPRESS_MODE: {
    readonly AUTO: "auto";
};

/** @public */
export declare type CompressMode = boolean | (typeof COMPRESS_MODE)["AUTO"];

/** @public */
export declare function configureKittyTransportManager(options: ConfigureKittyTransportManagerOptions): void;

/** @public */
export declare interface ConfigureKittyTransportManagerOptions {
    preferredMode: TransmissionMode;
    probe: Record<Exclude<TransmissionMode, "direct">, boolean>;
}

/** @public */
export declare const createComponent: <T>(Comp: (props: T) => TGENode, props: T) => TGENode;

export { createContext }

/** @public */
export declare function createDirtyTracker(): DirtyTracker;

/** @public */
export declare const createElement: (tag: string) => TGENode;

/** Options for creating an extmark */
/** @public */
export declare type CreateExtmarkOptions = Omit<Extmark, "id">;

/** @public */
export declare function createGpuFrameComposer(layerComposer: LayerComposer): GpuFrameComposer;

/** @public */
export declare function createGpuRendererBackend(): GpuRendererBackend;

/** @public */
export declare function createHandle(node: TGENode): NodeHandle;

/**
 * Create a layer compositor for the kitty direct backend.
 *
 * @param write - Write function for Kitty graphics escapes.
 * @param rawWrite - Write function reserved for cursor positioning hooks.
 * @param mode - Transmission mode.
 */
/** @public */
export declare function createLayerComposer(write: (data: string) => void, rawWrite: (data: string) => void, mode?: TransmissionMode, compress?: CompressMode): LayerComposer;

/** @public */
export declare function createLayerStore(): LayerStore;

/** @public */
export declare function createNavigationStack(initialComponent?: (props: ScreenProps) => JSX.Element): NavigationStackHandle;

/** @public */
export declare function createNode(kind: TGENodeKind): TGENode;

/**
 * Create an input parser that emits typed events.
 *
 * Call `feed()` with each Buffer from stdin.on("data").
 * The handler receives parsed InputEvent objects.
 */
/** @public */
export declare function createParser(handler: InputHandler): InputParser;

/** @public */
export declare function createParticleSystem(config: ParticleConfig): ParticleSystem;

/** @public Create a PressEvent instance. */
export declare function createPressEvent(): PressEvent;

/** @public */
export declare function createRenderGraphQueues(): RenderGraphQueues;

/** @public */
export declare function createRenderLoop(term: Terminal, opts?: RenderLoopOptions): RenderLoop;

/** @public */
export declare function createRouter(initialPath: string): {
    current: () => string;
    navigate: (path: string, navParams?: NavigationParams) => void;
    goBack: () => boolean;
    params: () => NavigationParams | undefined;
    history: Accessor<NavigationEntry[]>;
};

/** @public */
export declare function createScaledImageCache(): ScaledImageCache;

/** @public */
export declare function createScrollHandle(scrollId: string): ScrollHandle;

/** @public */
export declare function createSlot(slotName: string, registry: SlotRegistry): () => JSX.Element | null;

/** Create a new slot registry. */
/** @public */
export declare function createSlotRegistry(): SlotRegistry;

/** @public */
export declare function createSpring(initial: number, config?: SpringConfig): [() => number, (target: number) => void];

/**
 * Create and initialize a terminal handle.
 *
 * @public
 */
export declare function createTerminal(opts?: TerminalOptions): Promise<Terminal>;

/** @public */
export declare const createTextNode: (value: string) => TGENode;

/** @public */
export declare function createTransition(initial: number, config?: TransitionConfig): [() => number, (target: number) => void];

/** @public */
export declare function createWriter(write: (data: string) => void): (data: string) => void;

/** @public */
export declare type DamageRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** @public */
export declare function damageRectArea(rect: DamageRect | null | undefined): number;

/** @public */
export declare function damageSumOverlapArea(rects: DamageRect[]): number;

/**
 * Dump nodes that were culled by AABB viewport culling.
 * Only meaningful when cullingEnabled is true in the WalkTreeState.
 *
 * @param root       - TGENode root to traverse
 * @param viewport   - Current viewport rect for AABB comparison
 * @returns Human-readable dump of all culled node subtree roots.
 */
/** @public */
export declare function debugDumpCulledNodes(root: TGENode, viewport: {
    width: number;
    height: number;
}): string;

/** @public */
export declare function debugDumpTree(target: NodeHandle | TGENode): string;

/**
 * Call at the START of each frame to track timing.
 * Returns a finish callback to call at the END of the frame.
 */
/** @public */
export declare function debugFrameStart(): () => void;

/** @public */
export declare const debugState: {
    readonly enabled: boolean;
    readonly fps: number;
    readonly frameTimeMs: number;
    readonly layerCount: number;
    readonly moveOnlyCount: number;
    readonly moveFallbackCount: number;
    readonly stableReuseCount: number;
    readonly dirtyBeforeCount: number;
    readonly repaintedCount: number;
    readonly nodeCount: number;
    readonly commandCount: number;
    readonly rendererStrategy: string | null;
    readonly rendererOutput: string | null;
    readonly resourceBytes: number;
    readonly gpuResourceBytes: number;
    readonly resourceEntries: number;
    readonly transmissionMode: string | null;
    readonly estimatedLayeredBytes: number;
    readonly estimatedFinalBytes: number;
    readonly interactionLatencyMs: number;
    readonly interactionType: string | null;
    readonly presentedInteractionSeq: number;
    readonly nativePresentationActive: boolean;
    readonly nativePresentationFallbackReason: string | null;
    readonly nativeStats: NativePresentationStats | null;
    readonly nativeFrameReasonFlags: number | null;
    readonly nativeFrameStats: NativeFrameExecutionStatsInput | null;
    readonly ffiCallCount: number;
};

/** @public */
export declare type DebugStats = {
    /** Whether debug overlay is visible */
    enabled: boolean;
    /** Frames per second */
    fps: number;
    /** Frame time in milliseconds */
    frameTimeMs: number;
    /** Number of compositing layers */
    layerCount: number;
    /** Layers moved via placement-only compositor updates this frame */
    moveOnlyCount: number;
    /** Layers that wanted move-only but had to repaint instead */
    moveFallbackCount: number;
    /** Stable layers reused without repaint */
    stableReuseCount: number;
    /** Dirty layers before rendering this frame */
    dirtyBeforeCount: number;
    /** Layers actually repainted this frame */
    repaintedCount: number;
    /** Total TGENode count in the tree */
    nodeCount: number;
    /** Total render commands from the layout adapter */
    commandCount: number;
    /** Selected renderer strategy for the current frame */
    rendererStrategy: string | null;
    /** Actual presentation/output path used for the current frame */
    rendererOutput: string | null;
    /** Total tracked renderer/cache bytes */
    resourceBytes: number;
    /** GPU-side tracked bytes subset */
    gpuResourceBytes: number;
    /** Total tracked cache/resource entries */
    resourceEntries: number;
    /** Active terminal transmission mode used for output cost decisions */
    transmissionMode: string | null;
    /** Estimated layered output bytes for this frame */
    estimatedLayeredBytes: number;
    /** Estimated final-frame output bytes for this frame */
    estimatedFinalBytes: number;
    /** Latency from latest input event to presented frame, if measured */
    interactionLatencyMs: number;
    /** Last interaction kind that produced the measured latency */
    interactionType: string | null;
    /** Monotonic sequence of the last interaction that reached presentation */
    presentedInteractionSeq: number;
    /** Whether native presentation is active for this frame */
    nativePresentationActive: boolean;
    /** Fallback reason if native presentation was disabled */
    nativePresentationFallbackReason: string | null;
    /** Last native presentation stats (if available) */
    nativeStats: NativePresentationStats | null;
    /** Native frame planner reason flags for the chosen strategy, if available */
    nativeFrameReasonFlags: number | null;
    /** Structured native frame execution stats for debug/inspection */
    nativeFrameStats: NativeFrameExecutionStats | null;
    /** FFI call count recorded for the latest frame */
    ffiCallCount: number;
};

/**
 * Format debug stats as a single-line string.
 * Useful for rendering in a text overlay.
 */
/** @public */
export declare function debugStatsLine(): string;

/** Update debug stats from the render loop. */
/** @public */
export declare function debugUpdateStats(stats: {
    layerCount: number;
    moveOnlyCount?: number;
    moveFallbackCount?: number;
    stableReuseCount?: number;
    dirtyBeforeCount: number;
    repaintedCount: number;
    nodeCount: number;
    commandCount: number;
    rendererStrategy?: string | null;
    rendererOutput?: string | null;
    dirtyPixelArea?: number;
    totalPixelArea?: number;
    overlapPixelArea?: number;
    overlapRatio?: number;
    fullRepaint?: boolean;
    resourceBytes?: number;
    gpuResourceBytes?: number;
    resourceEntries?: number;
    transmissionMode?: string | null;
    estimatedLayeredBytes?: number;
    estimatedFinalBytes?: number;
    interactionLatencyMs?: number;
    interactionType?: string | null;
    presentedInteractionSeq?: number;
    nativeStats?: NativePresentationStats | null;
    nativeFrameReasonFlags?: number | null;
    ffiCallCount?: number;
    ffiCallsBySymbol?: Record<string, number>;
}): void;

/** @public */
export declare type DecodedImage = {
    data: Uint8Array;
    width: number;
    height: number;
    nativeHandle?: bigint;
};

/**
 * Trigger image decode for a node. Non-blocking — sets the image extra buffer when done.
 * Called during walkTree when we encounter an img node with image state === "idle".
 */
/** @public */
export declare function decodeImageForNode(node: TGENode): void;

/** @public */
export declare function decodeMods(n: number): Modifiers;

/**
 * Decode paste bytes to string — normalizes line endings.
 */
/** @public */
export declare function decodePasteBytes(bytes: Uint8Array | string): string;

/** @public */
export declare function detect(): TerminalKind;

/** @public Flex direction enum for layout adapter direction values. */
export declare const DIRECTION: {
    readonly LEFT_TO_RIGHT: 0;
    readonly TOP_TO_BOTTOM: 1;
};

/** @public */
export declare const DIRTY_KIND: {
    readonly FULL: "full";
    readonly INTERACTION: "interaction";
    readonly NODE_VISUAL: "node-visual";
};

/** @public */
export declare type DirtyKind = (typeof DIRTY_KIND)[keyof typeof DIRTY_KIND];

/** @public */
export declare type DirtyScope = {
    kind: DirtyKind;
    nodeId?: number;
    rect?: DamageRect;
};

/** @public */
export declare type DirtyTracker = {
    markDirty: () => void;
    isDirty: () => boolean;
    clearDirty: (expectedVersion?: number) => void;
    dirtyVersion: () => number;
};

/** @public */
export declare function dispatchInput(event: InputEvent_2): void;

/** @public */
export declare type DragOptions = {
    onDragStart?: (evt: NodeMouseEvent) => boolean | void;
    onDrag: (evt: NodeMouseEvent) => void;
    onDragEnd?: (evt: NodeMouseEvent) => void;
    disabled?: () => boolean;
    interaction?: InteractionBinding;
};

/** @public */
export declare type DragProps = {
    ref: (handle: NodeHandle) => void;
    onMouseDown: (evt: NodeMouseEvent) => void;
    onMouseMove: (evt: NodeMouseEvent) => void;
    onMouseUp: (evt: NodeMouseEvent) => void;
};

/** @public */
export declare type DragState = {
    dragging: () => boolean;
    dragProps: DragProps;
};

/** @public */
export declare type DrawCmd = LineCmd | BezierCmd | CircleCmd | RectCmd | PolygonCmd | TextCmd | GlowCmd | ImageCmd | RadialGradientCmd | LinearGradientCmd | NebulaCmd | StarfieldCmd;

/** @public */
export declare const easing: {
    readonly linear: (t: number) => number;
    readonly easeIn: (t: number) => number;
    readonly easeOut: (t: number) => number;
    readonly easeInOut: (t: number) => number;
    readonly easeInCubic: (t: number) => number;
    readonly easeOutCubic: (t: number) => number;
    readonly easeInOutCubic: (t: number) => number;
    readonly easeInQuart: (t: number) => number;
    readonly easeOutQuart: (t: number) => number;
    readonly easeInOutQuart: (t: number) => number;
    readonly easeOutBack: (t: number) => number;
    readonly easeOutElastic: (t: number) => number;
    readonly cubicBezier: (x1: number, y1: number, x2: number, y2: number) => EasingFn;
};

/** @public */
export declare type EasingFn = (t: number) => number;

/** @public */
export declare const effect: <T>(fn: (prev?: T) => T, init?: T) => void;

/** @public */
export declare type EffectConfig = {
    renderObjectId?: number;
    color: number;
    cornerRadius: number;
    shadow?: ShadowDef | ShadowDef[];
    glow?: {
        radius: number;
        color: number;
        intensity: number;
    };
    gradient?: {
        type: "linear";
        from: number;
        to: number;
        angle: number;
    } | {
        type: "radial";
        from: number;
        to: number;
    };
    backdropBlur?: number;
    backdropBrightness?: number;
    backdropContrast?: number;
    backdropSaturate?: number;
    backdropGrayscale?: number;
    backdropInvert?: number;
    backdropSepia?: number;
    backdropHueRotate?: number;
    opacity?: number;
    cornerRadii?: {
        tl: number;
        tr: number;
        br: number;
        bl: number;
    };
    transform?: Float64Array;
    transformInverse?: Float64Array;
    transformBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** Self-filter applied to this element's own paint output (REQ-2B-401/402). */
    filter?: FilterConfig;
    _node?: TGENode;
    _stateHash?: number;
};

/** @public */
export declare type EffectRenderOp = {
    kind: "effect";
    renderObjectId: number | null;
    command: RenderCommand;
    rect: RectangleRenderOp;
    effect: EffectConfig;
    backdrop: BackdropRenderMetadata | null;
    transformStateId: number;
    clipStateId: number;
    effectStateId: number;
};

/** @public */
export declare function endNodeInteraction(node: TGENode, mode?: Exclude<InteractionMode, "none">): void;

/** @public */
export declare function endSync(write: (data: string) => void): void;

/** @public */
export declare function enter(stdin: NodeJS.ReadStream, write: (data: string) => void, caps: Capabilities): LifecycleState;

export { ErrorBoundary }

/** @public */
export declare function expandRect(rect: DamageRect, padding: number): DamageRect;

/** @public */
export declare const EXPECTED_BRIDGE_VERSION: 133888;

/**
 * Extmarks system — inline text decorations for textarea/editors.
 *
 * Extmarks are positioned marks that attach to character ranges in a text buffer.
 * They survive edits (shift with insertions/deletions) and can represent:
 *   - Syntax highlighting ranges (via styleId)
 *   - Autocomplete ghost text (via ghost flag)
 *   - Search match highlights
 *   - Diagnostic underlines
 *   - Inline annotations
 *
 * Architecture:
 *   - ExtmarkManager manages a flat list of extmarks
 *   - Each extmark has a type (registered via registerType)
 *   - Types have a numeric ID for fast filtering
 *   - Extmarks are queried by type or by range
 *
 * Usage:
 *   const mgr = new ExtmarkManager()
 *   const searchType = mgr.registerType("search")
 *   const ghostType = mgr.registerType("ghost")
 *
 *   mgr.create({ start: 10, end: 15, typeId: searchType, styleId: style.getStyleId("search.match") })
 *   mgr.create({ start: 42, end: 42, typeId: ghostType, ghost: true, data: { text: "suggestion" } })
 *
 *   const searchMarks = mgr.getAllForTypeId(searchType)
 *   mgr.clear()
 */
/** A single extmark — a positioned decoration in a text buffer */
/** @public */
export declare type Extmark = {
    id: number;
    /** Start character offset (inclusive) */
    start: number;
    /** End character offset (exclusive). For ghost text, start === end. */
    end: number;
    /** Type ID (from registerType) */
    typeId: number;
    /** Style ID (from SyntaxStyle.getStyleId) for visual rendering */
    styleId?: number;
    /** Foreground color override (packed RGBA) */
    fg?: number;
    /** Background color override (packed RGBA) */
    bg?: number;
    /** Priority for layering — higher wins on overlap */
    priority?: number;
    /** Ghost text flag — renders as semi-transparent text after the position */
    ghost?: boolean;
    /** Arbitrary data attached to this extmark */
    data?: Record<string, unknown>;
};

/**
 * ExtmarkManager — manages extmarks for a text buffer.
 *
 * Thread-safe for single-threaded use (no locks needed).
 * Extmarks are stored in a flat array sorted by start position.
 */
/** @public */
export declare class ExtmarkManager {
    private extmarks;
    private types;
    private nextId;
    private nextTypeId;
    /** Register a named extmark type. Returns a numeric type ID. */
    registerType(name: string): number;
    /** Get the type ID for a registered type name. Returns 0 if not found. */
    getTypeId(name: string): number;
    /** Create a new extmark. Returns its unique ID. */
    create(opts: CreateExtmarkOptions): number;
    /** Remove an extmark by ID. */
    remove(id: number): boolean;
    /** Get an extmark by ID. */
    get(id: number): Extmark | undefined;
    /** Get all extmarks for a given type ID. */
    getAllForTypeId(typeId: number): Extmark[];
    /** Get all extmarks that overlap a character range [start, end). */
    getInRange(start: number, end: number): Extmark[];
    /** Get all extmarks on a specific line (given line start/end offsets). */
    getForLine(lineStart: number, lineEnd: number): Extmark[];
    /** Get all ghost text extmarks. */
    getGhostTexts(): Extmark[];
    /** Clear all extmarks. */
    clear(): void;
    /** Clear all extmarks of a specific type. */
    clearType(typeId: number): void;
    /** Get the total number of extmarks. */
    count(): number;
    /**
     * Adjust extmark positions after a text edit.
     *
     * @param editStart - Character offset where the edit starts.
     * @param oldEnd - Character offset where the old text ended.
     * @param newEnd - Character offset where the new text ends.
     */
    adjustForEdit(editStart: number, oldEnd: number, newEnd: number): void;
}

/** @public */
export declare type FiletypeParserConfig = {
    filetype: string;
    aliases?: string[];
    wasm: string;
    queries: {
        highlights: string[];
        injections?: string[];
    };
};

/** @public */
export declare type FillStyle = {
    color: number;
};

/** @public Self-filter configuration applied to the element's own paint output. */
export declare type FilterConfig = {
    /** Gaussian blur radius in px. Default: 0 (no blur). */
    blur?: number;
    /** Brightness: 0=black, 100=unchanged, 200=2x bright. */
    brightness?: number;
    /** Contrast: 0=grey, 100=unchanged, 200=high contrast. */
    contrast?: number;
    /** Saturation: 0=grayscale, 100=unchanged, 200=hyper-saturated. */
    saturate?: number;
    /** Grayscale: 0=unchanged, 100=full grayscale. */
    grayscale?: number;
    /** Invert: 0=unchanged, 100=fully inverted. */
    invert?: number;
    /** Sepia: 0=unchanged, 100=full sepia. */
    sepia?: number;
    /** Hue rotation in degrees (0-360). */
    hueRotate?: number;
};

/** @public */
export declare type FlatRouteProps = {
    path: string;
    component: (props: RouteProps) => JSX.Element;
};

/** @public */
export declare const focusedId: Accessor<string | null>;

/** @public */
export declare type FocusEntry = {
    id: string;
    onKeyDown?: (event: KeyEvent) => void;
    onPress?: (event?: PressEvent) => void;
    node?: TGENode;
};

/** @public */
declare type FocusEvent_2 = {
    type: "focus";
    focused: boolean;
};
export { FocusEvent_2 as FocusEvent }

/** @public */
export declare type FocusHandle = {
    focused: () => boolean;
    focus: () => void;
    id: string;
};

/** @public */
export declare type FontDescriptor = {
    family: string;
    size: number;
    weight?: number;
    style?: "normal" | "italic";
};

export { For }

/** @public */
export declare type FrameSchedulerBoosts = {
    key: number;
    scroll: number;
    pointer: number;
};

/** @public */
export declare function fromConfig(config: {
    translateX?: number;
    translateY?: number;
    rotate?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    skewX?: number;
    skewY?: number;
    perspective?: number;
    rotateX?: number;
    rotateY?: number;
}, originX: number, originY: number): Matrix3;

/** @public */
export declare function getFocusedEntry(): FocusEntry | undefined;

/** Get font descriptor by ID. Falls back to default. */
/** @public */
export declare function getFont(id: number): FontDescriptor;

/** @public */
export declare function getFontAtlasCacheStats(): {
    atlasCount: number;
    bytes: number;
};

/** @public */
export declare function getGpuRendererBackendCacheStats(): GpuRendererBackendCacheStats;

/** @public */
export declare function getImageCacheStats(): {
    decodedCount: number;
    decodedBytes: number;
    pendingCount: number;
    scaledCacheCount: number;
    scaledEntries: number;
    scaledBytes: number;
};

/** @public */
export declare function getKittyTransportManagerState(): KittyTransportManagerState;

/** @public */
export declare function getKittyTransportStats(): KittyTransportStats;

/** @public */
export declare function getLatestInteractionTrace(): InteractionTrace;

/** Returns vexart version as proxy for kitty shm helper version. */
/** @public */
export declare function getNativeKittyShmHelperVersion(): number;

/** @public */
export declare function getNodeFocusId(node: TGENode): string | undefined;

/** @public */
export declare function getRendererBackend(): RendererBackend | null;

/** @public */
export declare function getRendererBackendName(): string;

/** @public */
export declare function getRendererResourceStats(): {
    image: {
        decodedCount: number;
        decodedBytes: number;
        pendingCount: number;
        scaledCacheCount: number;
        scaledEntries: number;
        scaledBytes: number;
    };
    textLayout: {
        preparedCount: number;
        layoutCount: number;
    };
    fontAtlas: {
        atlasCount: number;
        bytes: number;
    };
    gpuRenderer: GpuRendererBackendCacheStats;
    native: ResourceStats | null;
};

/** @public */
export declare function getSelectedText(): string;

/** @public */
declare function getSelection_2(): TextSelection | null;
export { getSelection_2 as getSelection }

/** @public */
export declare function getSize(stdout: NodeJS.WriteStream): TerminalSize;

/** @public */
export declare function getTextLayoutCacheStats(): {
    preparedCount: number;
    layoutCount: number;
};

/** @public */
export declare function getTreeSitterClient(): TreeSitterClient;

/** @public */
export declare type GlowCmd = {
    kind: "glow";
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    color: number;
    intensity: number;
};

/** @public */
export declare type GpuFrameComposer = {
    renderLayerRaw: (data: Uint8Array, width: number, height: number, imageId: number, pixelX: number, pixelY: number, z: number, cellW: number, cellH: number) => void;
    renderFinalFrameRaw: (data: Uint8Array, width: number, height: number, z: number, cellW: number, cellH: number) => void;
    patchLayer: (regionData: Uint8Array, imageId: number, rx: number, ry: number, rw: number, rh: number) => boolean;
    placeLayer: (imageId: number, pixelX: number, pixelY: number, z: number, cellW: number, cellH: number) => boolean;
    hasLayer: (imageId: number) => boolean;
    removeLayer: (imageId: number) => void;
    clear: () => void;
    destroy: () => void;
};

/** @public */
export declare type GpuLayerStrategyInput = {
    dirtyLayerCount: number;
    dirtyPixelArea: number;
    totalPixelArea: number;
    overlapPixelArea: number;
    overlapRatio: number;
    fullRepaint: boolean;
    hasSubtreeTransforms: boolean;
    hasActiveInteraction: boolean;
    transmissionMode: "direct" | "file" | "shm";
    estimatedLayeredBytes: number;
    estimatedFinalBytes: number;
    lastStrategy: GpuLayerStrategyMode | null;
    framesSinceChange: number;
};

/** @public */
export declare type GpuLayerStrategyMode = "skip-present" | "layered-dirty" | "layered-region" | "final-frame";

/** @public */
export declare type GpuRendererBackend = RendererBackend & {
    getLastStrategy: () => GpuLayerStrategyMode | null;
};

/** @public */
export declare type GpuRendererBackendCacheStats = {
    layerTargetCount: number;
    layerTargetBytes: number;
    textImageCount: number;
    textImageBytes: number;
    glyphAtlasCount: number;
    glyphAtlasBytes: number;
    canvasSpriteCount: number;
    canvasSpriteBytes: number;
    transformSpriteCount: number;
    transformSpriteBytes: number;
    fallbackSpriteCount: number;
    fallbackSpriteBytes: number;
    backdropSourceCount: number;
    backdropSourceBytes: number;
    backdropSpriteCount: number;
    backdropSpriteBytes: number;
};

/** @public */
export declare const GRAPH_MAGIC: 1448624466;

/** @public */
export declare const GRAPH_VERSION: 131072;

/** @public */
export declare function hasActiveAnimations(): boolean;

/** @public */
export declare function hasActiveNodeInteraction(node: TGENode | null | undefined): boolean;

/** @public */
export declare function hasInteractionInSubtree(node: TGENode | null | undefined): boolean;

/** @public */
export declare function hasRecentInteraction(now: number, interactionBoostUntilMs: number, capturedNodeId: number, pointerDown: boolean): boolean;

/**
 * Convert tree-sitter highlights to per-line colored tokens.
 *
 * @public
 * @param source - Full source text.
 * @param highlights - Highlight ranges from the worker.
 * @param style - Scope-to-color style mapping.
 * @returns One token array per line.
 */
export declare function highlightsToTokens(source: string, highlights: SimpleHighlight[], style: SyntaxStyle): Token[][];

/** @public */
export declare type HoverOptions = {
    onEnter?: () => void;
    onLeave?: () => void;
    delay?: number;
    leaveDelay?: number;
    disabled?: () => boolean;
};

/** @public */
export declare type HoverProps = {
    onMouseOver: (evt: NodeMouseEvent) => void;
    onMouseOut: (evt: NodeMouseEvent) => void;
};

/** @public */
export declare type HoverState = {
    hovered: () => boolean;
    hoverProps: HoverProps;
};

/** @public */
export declare function identity(): Matrix3;

/** @public */
export declare type ImageCmd = {
    kind: "image";
    x: number;
    y: number;
    w: number;
    h: number;
    data: Uint8Array;
    imgW: number;
    imgH: number;
    opacity: number;
    opaque?: boolean;
};

/** @public */
export declare type ImagePaintConfig = {
    renderObjectId?: number;
    color: number;
    cornerRadius: number;
    imageBuffer: {
        data: Uint8Array;
        width: number;
        height: number;
    };
    nativeImageHandle?: bigint | null;
    objectFit: "contain" | "cover" | "fill" | "none";
};

/** @public */
export declare type ImageRenderOp = {
    kind: "image";
    renderObjectId: number | null;
    command: RenderCommand;
    rect: RectangleRenderOp;
    image: ImagePaintConfig;
};

export { Index }

/** @public */
export declare function inferCaps(kind: TerminalKind): Capabilities;

/** @public */
declare type InputEvent_2 = KeyEvent | MouseEvent_2 | FocusEvent_2 | PasteEvent | ResizeEvent;
export { InputEvent_2 as InputEvent }

/** @public */
export declare type InputHandler = (event: InputEvent_2) => void;

/** @public */
export declare type InputParser = {
    /** Feed raw data from stdin. Emits events via the handler. */
    feed: (data: Buffer) => void;
    /** Destroy the parser, clear state. */
    destroy: () => void;
};

/** @public */
export declare type InputSubscriber = (event: InputEvent_2) => void;

/** @public */
export declare const insert: <T>(parent: any, accessor: T | (() => T), marker?: any | null, initial?: any) => TGENode;

/** @public */
export declare function insertChild(parent: TGENode, child: TGENode, anchor?: TGENode): void;

/** @public */
export declare const insertNode: (parent: TGENode, node: TGENode, anchor?: TGENode | undefined) => void;

/** @public */
export declare type InteractionBinding = "auto" | "none" | InteractionLayerState;

/** @public */
export declare type InteractionKind = "pointer" | "scroll" | "key";

/** @public */
export declare type InteractionLayerState = {
    ref: (handle: NodeHandle) => void;
    node: () => TGENode | null;
    mode: () => InteractionMode;
    begin: (mode?: Exclude<InteractionMode, "none">) => void;
    end: (mode?: Exclude<InteractionMode, "none">) => void;
};

/** @public */
export declare type InteractionMode = "none" | "drag";

/** @public */
export declare type InteractionTrace = {
    seq: number;
    at: number;
    kind: string | null;
};

/** @public Interactive style props usable in hoverStyle, activeStyle, and focusStyle. */
export declare type InteractiveStyleProps = Partial<Pick<TGEProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "borderRadius" | "shadow" | "boxShadow" | "glow" | "gradient" | "backdropBlur" | "backdropBrightness" | "backdropContrast" | "backdropSaturate" | "backdropGrayscale" | "backdropInvert" | "backdropSepia" | "backdropHueRotate" | "opacity" | "filter">>;

/** @public */
export declare function intersectRect(a: DamageRect, b: DamageRect): DamageRect | null;

/** @public */
export declare function inTmux(): boolean;

/** @public */
export declare function invert(m: Matrix3): Matrix3 | null;

/** Check if debug is enabled (reactive). */
/** @public */
export declare function isDebugEnabled(): boolean;

/** @public */
export declare function isDirty(): boolean;

/** @public */
export declare function isEmptyRect(rect: DamageRect | null | undefined): boolean;

/** @public */
export declare function isFullyOutsideScrollViewport(node: TGENode): boolean;

/** @public */
export declare function isIdentity(m: Matrix3): boolean;

/**
 * Check if the MSDF font system is available in the current dylib.
 */
export declare function isMsdfFontAvailable(): boolean;

/** @public */
export declare const KANAGAWA: ThemeTokenStyle[];

/** @public */
export declare type KeyboardState = {
    key: () => KeyEvent | null;
    pressed: (name: string) => boolean;
};

/** @public */
export declare type KeyEvent = {
    type: "key";
    key: string;
    char: string;
    mods: Modifiers;
};

/** @public */
export declare type KittyTransportFailureReason = (typeof TRANSPORT_FAILURE_REASON)[keyof typeof TRANSPORT_FAILURE_REASON];

/** @public */
export declare type KittyTransportHealth = (typeof TRANSPORT_HEALTH)[keyof typeof TRANSPORT_HEALTH];

/** @public */
export declare interface KittyTransportManagerState {
    preferredMode: TransmissionMode;
    activeMode: TransmissionMode;
    probe: Record<Exclude<TransmissionMode, "direct">, boolean>;
    health: Record<TransmissionMode, KittyTransportHealth>;
    lastFailureReason: KittyTransportFailureReason | null;
    telemetry: Record<TransmissionMode, KittyTransportTelemetryBucket>;
}

/** @public */
export declare type KittyTransportStats = {
    transmitCalls: number;
    patchCalls: number;
    payloadBytes: number;
    estimatedTtyBytes: number;
    byMode: Record<TransmissionMode, {
        transmitCalls: number;
        patchCalls: number;
        payloadBytes: number;
        estimatedTtyBytes: number;
    }>;
};

/** @public */
export declare interface KittyTransportTelemetryBucket {
    success: number;
    failure: number;
    fallback: number;
}

/** @public */
export declare type Layer = {
    /** Unique layer ID. Also used as Kitty image ID. */
    id: number;
    /** Z-order for terminal compositing. Higher = on top. */
    z: number;
    /** Position in pixels relative to screen origin. */
    x: number;
    y: number;
    /** Size in pixels. */
    width: number;
    height: number;
    /** Whether this layer needs repainting. */
    dirty: boolean;
    /** Previous position/size — to detect if placement needs updating. */
    prevX: number;
    prevY: number;
    prevW: number;
    prevH: number;
    prevZ: number;
    /** Accumulated global damage rect for this layer. */
    damageRect: DamageRect | null;
};

/** @public */
export declare type LayerComposer = {
    /** Render raw RGBA bytes directly, avoiding a PixelBuffer wrapper upstream. */
    renderLayerRaw: (data: Uint8Array, width: number, height: number, imageId: number, pixelX: number, pixelY: number, z: number, cellW: number, cellH: number) => void;
    /**
     * [Experimental] Patch a dirty region of an existing layer.
     * Uses Kitty animation frame protocol (a=f) to update only the changed pixels.
     * Returns false if the image hasn't been transmitted yet (caller should use renderLayer).
     */
    patchLayer: (regionData: Uint8Array, imageId: number, rx: number, ry: number, rw: number, rh: number) => boolean;
    /** Re-place an already transmitted image without re-uploading pixels. */
    placeLayer: (imageId: number, pixelX: number, pixelY: number, z: number, cellW: number, cellH: number) => boolean;
    /** Return whether an image has already been transmitted and can be patched/placed. */
    hasLayer: (imageId: number) => boolean;
    /** Remove a layer's image from the terminal. */
    removeLayer: (imageId: number) => void;
    /** Remove all layer images. */
    clear: () => void;
    /** Destroy — clean up all images. */
    destroy: () => void;
};

/** @public */
export declare type LayerStore = {
    createLayer: (z: number) => Layer;
    getLayer: (id: number) => Layer | undefined;
    removeLayer: (layer: Layer) => void;
    allLayers: () => Layer[];
    markLayerDirty: (id: number) => void;
    markAllDirty: () => void;
    anyLayerDirty: () => boolean;
    updateLayerGeometry: (layer: Layer, x: number, y: number, w: number, h: number, opts?: {
        moveOnly?: boolean;
    }) => void;
    markLayerClean: (layer: Layer) => void;
    markLayerDamaged: (layer: Layer, rect: DamageRect) => void;
    getLayerRect: (layer: Layer) => DamageRect;
    getPreviousLayerRect: (layer: Layer) => DamageRect | null;
    imageIdForLayer: (layer: Layer) => number;
    resetLayers: () => void;
    dirtyCount: () => number;
    layerCount: () => number;
};

/** @public Computed layout geometry written each frame after layout. */
export declare type LayoutRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** @public */
export declare function leave(stdin: NodeJS.ReadStream, write: (data: string) => void, caps: Capabilities, state: LifecycleState): void;

/** @public */
export declare type LifecycleState = {
    active: boolean;
    rawModeWas: boolean;
};

/** @public */
export declare type LinearGradientCmd = {
    kind: "linearGradient";
    x: number;
    y: number;
    w: number;
    h: number;
    from: number;
    to: number;
    angle: number;
};

/**
 * Imperative drawing API for canvas nodes.
 * Draw commands are buffered during onDraw and consumed by the GPU renderer.
 */
/** @public */
export declare type LineCmd = {
    kind: "line";
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: number;
    width: number;
};

/** @public */
export declare function markDirty(scope?: DirtyScope): void;

export declare function markLayerDamageByKey(key: string, rect: DamageRect): void;

export declare function markLayerDirtyByKey(key: string): void;

/** @public */
export declare function markNodeLayerDamaged(nodeId: number, rect?: DamageRect): void;

export { Match }

/** @public 3×3 matrix as 9-element Float64Array (row-major). */
export declare type Matrix3 = Float64Array;

/** @public */
export declare const memo: <T>(fn: () => T, equal: boolean) => () => T;

/** @public */
export declare const mergeProps: (...sources: unknown[]) => unknown;

/**
 * Input event types for @vexart/engine.
 *
 * All parsed input is normalized to one of these event types.
 * The parser transforms raw stdin bytes → typed events.
 */
/** @public */
export declare type Modifiers = {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
};

/** @public */
export declare function mount(component: () => any, terminal: Terminal, opts?: MountOptions): MountHandle;

/** @public */
export declare type MountHandle = {
    suspend: () => void;
    resume: () => void;
    suspended: () => boolean;
    destroy: () => void;
};

/** @public */
export declare type MountOptions = {
    maxFps?: number;
    experimental?: {
        idleMaxFps?: number;
        interactionMaxFps?: number;
        frameBudgetMs?: number;
        forceLayerRepaint?: boolean;
        nativePresentation?: boolean;
        nativeLayerRegistry?: boolean;
    };
};

/** @public */
export declare type MouseAction = "press" | "release" | "move" | "scroll";

/** @public */
export declare const MouseButton: {
    readonly LEFT: 0;
    readonly MIDDLE: 1;
    readonly RIGHT: 2;
    readonly RELEASE: 3;
    readonly SCROLL_UP: 64;
    readonly SCROLL_DOWN: 65;
};

/** @public */
declare type MouseEvent_2 = {
    type: "mouse";
    action: MouseAction;
    button: number;
    x: number;
    y: number;
    mods: Modifiers;
};
export { MouseEvent_2 as MouseEvent }

/** @public */
export declare type MouseState = {
    mouse: () => MouseEvent_2 | null;
    pos: () => {
        x: number;
        y: number;
    };
};

/**
 * msdf-font.ts
 * TypeScript wrappers for the MSDF font system FFI.
 *
 * Lazy-loaded: if the dylib doesn't have font symbols, all functions
 * return graceful fallbacks (null/false/0). The bitmap text path
 * continues to work unchanged.
 */
/**
 * Initialize the MSDF font system. Returns the number of discovered
 * font faces, or -1 if the native font system is not available.
 */
export declare function msdfFontInit(): number;

/**
 * Query a system font by family names. Returns an opaque handle or null.
 *
 * @param families — array of CSS-like family names, e.g. ["JetBrains Mono", "monospace"]
 * @param weight — CSS font-weight (100-900, default 400)
 * @param italic — whether to prefer italic face
 */
export declare function msdfFontQuery(families: string[], weight?: number, italic?: boolean): bigint | null;

/**
 * Measure text dimensions using the MSDF font system metrics.
 *
 * @returns { width, height } in pixels, or null if measurement failed.
     */
 export declare function msdfMeasureText(text: string, families?: string[], fontSize?: number, weight?: number, italic?: boolean): MsdfTextMeasurement | null;

 export declare type MsdfTextMeasurement = {
     width: number;
     height: number;
 };

 /** @public */
 export declare function multiply(a: Matrix3, b: Matrix3): Matrix3;

 /** @public */
 export declare type MutationOptions<T, V> = {
     /** Called before the mutation — return optimistic data to set immediately. */
     onMutate?: (variables: V) => T | undefined;
     /** Called on success. */
     onSuccess?: (data: T, variables: V) => void;
     /** Called on error. Receives the previous data for rollback. */
     onError?: (error: Error, variables: V, previousData: T | undefined) => void;
     /** Called after success or error. */
     onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void;
 };

 /** @public */
 export declare type MutationResult<T, V> = {
     /** The result of the last successful mutation. */
     data: () => T | undefined;
     /** Whether the mutation is in progress. */
     loading: () => boolean;
     /** Error from the last mutation attempt. */
     error: () => Error | undefined;
     /** Trigger the mutation. */
     mutate: (variables: V) => Promise<T | undefined>;
     /** Reset state to idle. */
     reset: () => void;
 };

 /** @internal */
 declare const NATIVE_FRAME_STRATEGY: {
     readonly SKIP_PRESENT: 0;
     readonly LAYERED_DIRTY: 1;
     readonly LAYERED_REGION: 2;
     readonly FINAL_FRAME: 3;
 };

 declare type NativeFrameExecutionStats = NativeFrameExecutionStatsInput;

 declare type NativeFrameExecutionStatsInput = {
     strategy: NativeFrameStrategy | GpuLayerStrategyMode | null;
     reasonFlags: number | null;
     dirtyLayerCount: number;
     dirtyPixelArea: number;
     totalPixelArea: number;
     overlapPixelArea: number;
     overlapRatio: number;
     fullRepaint: boolean;
     transmissionMode: "direct" | "file" | "shm" | null;
     estimatedLayeredBytes: number;
     estimatedFinalBytes: number;
     repaintedCount: number;
     stableReuseCount: number;
     moveOnlyCount: number;
     moveFallbackCount: number;
     resourceBytes: number;
     gpuResourceBytes: number;
     resourceEntries: number;
     rendererOutput: string | null;
     nativePresentationStats: unknown;
     ffiCallCount: number;
     ffiCallsBySymbol: Record<string, number>;
 };

 declare type NativeFramePlan = {
     strategy: NativeFrameStrategy;
     reasonFlags: number;
 };

 declare type NativeFrameStrategy = (typeof NATIVE_FRAME_STRATEGY)[keyof typeof NATIVE_FRAME_STRATEGY];

 /**
  * kitty-shm-native.ts — native Kitty shared-memory path
  *
  * Rewired from libkitty-shm-helper to libvexart's vexart_kitty_shm_* exports.
  * Per design §11, §5.6 (Translation 4), REQ-NB-006.
  *
  * Signature uses explicit name/data lengths plus an out handle for ARM64-safe FFI.
  *
  * Returns i32 (0=OK, negative=error); handle via out_handle pointer.
  */
 /** @public */
 export declare interface NativeKittyShmHandle {
     /** SHM handle — stored as number for API compatibility with kitty.ts consumers.
      *  Internally: the u64 handle from vexart_kitty_shm_prepare is stored in _bigintHandle.
      *  Values that exceed Number.MAX_SAFE_INTEGER will be truncated — acceptable since
      *  SHM handles are typically small fd values on macOS. */
     handle: number;
     name: string;
     /** BigInt handle for passing to vexart_kitty_shm_release. */
     _bigintHandle: bigint;
 }

 /** @public */
 export declare type NativePresentationStats = {
     /** Struct version — always 1 for Phase 2b. */
     version: number;
     /** Presentation mode (0=unknown, 1=final-frame, 2=layer, 3=region, 4=delete). */
     mode: number;
     /** Raw RGBA bytes transferred through JS fallback paths (0 = normal native path). */
     rgbaBytesRead: number;
     /** Kitty escape bytes emitted to stdout. */
     kittyBytesEmitted: number;
     /** GPU readback time in microseconds. */
     readbackUs: number;
     /** Kitty encoding time in microseconds. */
     encodeUs: number;
     /** stdout write time in microseconds. */
     writeUs: number;
     /** Total end-to-end time in microseconds. */
     totalUs: number;
     /** Transport mode used (0=direct, 1=file, 2=shm). */
     transport: number;
     /** Flags bitfield (bit 0=native_used, bit 1=fallback, bit 2=valid). */
     flags: number;
     /** Native zlib compression time in microseconds. */
     compressUs: number;
     /** Native SHM prepare/copy/sync time in microseconds. */
     shmPrepareUs: number;
     /** Raw input byte count before compression. */
     rawBytes: number;
     /** Payload byte count written after compression policy. */
     payloadBytes: number;
 };

 /** @public */
 export declare type NavigationEntry = {
     path: string;
     params?: NavigationParams;
 };

 /** @public */
 declare type NavigationParams = Record<string, unknown>;

 /** @public */
 export declare type NavigationStackHandle = {
     push: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void;
     pop: () => boolean;
     goBack: () => boolean;
     replace: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void;
     reset: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void;
     depth: () => number;
     current: () => ScreenEntry | undefined;
     stack: () => ScreenEntry[];
 };

 /** @public */
 export declare type NebulaCmd = {
     kind: "nebula";
     x: number;
     y: number;
     w: number;
     h: number;
     stops: {
         color: number;
         position: number;
     }[];
     seed: number;
     scale: number;
     octaves: number;
     gain: number;
     lacunarity: number;
     warp: number;
     detail: number;
     dust: number;
 };

 /** @public */
 export declare const NO_MODS: Modifiers;

 declare type NodeCanvasExtra = {
     displayListCommands: DrawCmd[] | null;
     displayListHash: string | null;
     drawCacheKey: string | null;
     nativeHandle: bigint | null;
 };

 /** @public */
 export declare type NodeHandle = {
     readonly id: number;
     readonly kind: string;
     readonly layout: LayoutRect;
     readonly isDestroyed: boolean;
     focus: () => void;
     blur: () => void;
     readonly isFocused: boolean;
     readonly children: NodeHandle[];
     readonly parent: NodeHandle | null;
     readonly _node: TGENode;
 };

 declare type NodeImageExtra = {
     buffer: {
         data: Uint8Array;
         width: number;
         height: number;
     } | null;
     state: "idle" | "loading" | "loaded" | "error";
     nativeHandle: bigint | null;
 };

 /** @public Mouse event passed to onMouseDown, onMouseUp, onMouseMove, onMouseOver, and onMouseOut handlers. */
 export declare type NodeMouseEvent = {
     /** Pointer X in absolute pixels (screen-space). */
     x: number;
     /** Pointer Y in absolute pixels (screen-space). */
     y: number;
     /** Pointer X relative to the node's layout origin. */
     nodeX: number;
     /** Pointer Y relative to the node's layout origin. */
     nodeY: number;
     /** Node layout width — useful for ratio calculations (e.g. slider). */
     width: number;
     /** Node layout height. */
     height: number;
 };

 /** @public */
 export declare const ONE_DARK: ThemeTokenStyle[];

 /** Register a callback to be called whenever the global markDirty fires.
  *  The render loop uses this to chain markAllDirty (layer store). */
 /** @public */
 export declare function onGlobalDirty(cb: (scope: DirtyScope) => void): () => void;

 /** @public */
 export declare function onInput(handler: InputSubscriber): () => void;

 /** @public */
 export declare function onPostScroll(cb: () => void): () => void;

 /** @public */
 export declare function onResize(stdout: NodeJS.WriteStream, handler: ResizeHandler): () => void;

 /**
  * Open the vexart native library.
  *
  * @public
  */
 export declare function openVexartLibrary(): ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>>;

 /** @public */
 export declare function parentTerminal(): TerminalKind;

 /** @public */
 export declare function parseAlignX(value: string | undefined): number;

 /** @public */
 export declare function parseAlignY(value: string | undefined): number;

 /** @public */
 export declare function parseColor(value: string | number | undefined): number;

 /** @public */
 export declare function parseDirection(value: string | undefined): number;

 /** @public Try to parse a keyboard event from the data. Returns the event and consumed byte count, or null. */
 export declare function parseKey(data: string): [KeyEvent, number] | null;

 /** @public Try to parse a mouse event from the data. Returns the event and consumed byte count, or null. */
 export declare function parseMouse(data: string): [MouseEvent_2, number] | null;

 /** @public */
 export declare function parseSizing(value: number | string | undefined): SizingInfo | null;

 /** @public */
 export declare type ParticleConfig = {
     /** Number of particles. */
     count: number;
     /** World-space bounds for spawning. */
     bounds: {
         x: number;
         y: number;
         w: number;
         h: number;
     };
     /** Min/max radius in pixels. */
     radius?: {
         min: number;
         max: number;
     };
     /** Min/max velocity (pixels per second). */
     speed?: {
         min: number;
         max: number;
     };
     /** Base color (packed RGBA u32). Alpha varies per particle. */
     color?: number;
     /** Min/max alpha (0-255). */
     alpha?: {
         min: number;
         max: number;
     };
     /** Min/max lifetime in seconds (0 = immortal). */
     lifetime?: {
         min: number;
         max: number;
     };
     /** Enable glow effect on particles. */
     glow?: boolean;
     /** Glow radius multiplier (default 3). */
     glowRadius?: number;
     /** Glow intensity (0-100, default 40). */
     glowIntensity?: number;
     /** Enable twinkle (alpha oscillation). */
     twinkle?: boolean;
     /** Twinkle speed multiplier (default 1). */
     twinkleSpeed?: number;
     /** Drift direction bias in pixels per second. */
     drift?: {
         dx: number;
         dy: number;
     };
 };

 /** @public */
 export declare type ParticleSystem = {
     /** Advance simulation by dt seconds. */
     tick: (dt: number) => void;
     /** Draw particles to a CanvasContext. */
     draw: (ctx: CanvasContext) => void;
     /** Reset all particles (re-randomize). */
     reset: () => void;
     /** Current particle count. */
     count: number;
 };

 /** @public */
 export declare function passthroughSupported(): boolean;

 /** @public */
 export declare type PasteEvent = {
     type: "paste";
     text: string;
 };

 /**
  * Patch a region of an already-transmitted image using animation frame (a=f).
  *
  * Uses Kitty's animation frame protocol to update a sub-rectangle of an
  * existing image. The terminal composites the new data over the existing frame.
  *
  * @param regionData - Raw RGBA pixel data for the dirty region only.
  * @param rx - X offset within the image where the patch starts.
  * @param ry - Y offset within the image where the patch starts.
  * @param rw - Width of the patch region.
  * @param rh - Height of the patch region.
  *
  * Experimental: requires the image to have been transmitted at least once.
  */
 /** @public */
 export declare function patchRegion(write: (data: string) => void, id: number, regionData: Uint8Array, rx: number, ry: number, rw: number, rh: number, opts?: {
     mode?: TransmissionMode;
     compress?: CompressMode;
 }): void;

 /** @public */
 export declare function perspective(distance: number, rotateX?: number, rotateY?: number): Matrix3;

 /** @public */
 export declare type PolygonCmd = {
     kind: "polygon";
     cx: number;
     cy: number;
     radius: number;
     sides: number;
     rotation: number;
     fill?: number;
     stroke?: number;
     strokeWidth: number;
 };

 /** @public */
 export declare function prepareNativeKittyShm(name: string, data: Uint8Array, mode?: number): NativeKittyShmHandle;

 /** @public Event passed to onPress handlers. Supports stopPropagation like DOM events. */
 export declare type PressEvent = {
     /** Prevent the event from bubbling to parent nodes. */
     stopPropagation: () => void;
     /** Whether stopPropagation() was called. */
     readonly propagationStopped: boolean;
 };

 /**
  * Probe if the terminal supports temp file transmission.
  *
  * Writes a 1x1 pixel to a temp file, sends a query action (a=q),
  * and checks if terminal responds with OK.
  */
 /** @public */
 export declare function probeFile(write: (data: string) => void, onData: (handler: (data: Buffer) => void) => void, offData: (handler: (data: Buffer) => void) => void, timeout?: number): Promise<boolean>;

 /**
  * Probe for Kitty graphics protocol support.
  *
  * @public
  */
 export declare function probeKittyGraphics(write: (data: string) => void, onData: (handler: (data: Buffer) => void) => void, offData: (handler: (data: Buffer) => void) => void, timeout?: number): Promise<boolean>;

 export declare function probeShm(write: (data: string) => void, onData: (handler: (data: Buffer) => void) => void, offData: (handler: (data: Buffer) => void) => void, timeout?: number): Promise<boolean>;

 /** @public */
 export declare function pushFocusScope(): () => void;

 /**
  * Query terminal background and foreground colors.
  *
  * @public
  */
 export declare function queryColors(write: (data: string) => void, onData: (handler: (data: Buffer) => void) => void, offData: (handler: (data: Buffer) => void) => void, timeout?: number): Promise<{
     bg: [number, number, number] | null;
     fg: [number, number, number] | null;
 }>;

 /** @public */
 export declare type QueryOptions = {
     /** Whether to run the query immediately. Default: true. */
     enabled?: boolean;
     /** Auto-refetch interval in ms. 0 = disabled. Default: 0. */
     refetchInterval?: number;
     /** Retry count on error. Default: 0. */
     retry?: number;
     /** Retry delay in ms. Default: 1000. */
     retryDelay?: number;
 };

 /**
  * Query terminal pixel dimensions.
  *
  * @public
  */
 export declare function queryPixelSize(write: (data: string) => void, onData: (handler: (data: Buffer) => void) => void, offData: (handler: (data: Buffer) => void) => void, cols: number, rows: number, timeout?: number): Promise<{
     pixelWidth: number;
     pixelHeight: number;
     cellWidth: number;
     cellHeight: number;
 }>;

 /**
  * Data fetching hooks for UI state.
  * These helpers expose lightweight query and mutation primitives for Solid-based apps.
  */
 /** @public */
 export declare type QueryResult<T> = {
     /** The fetched data (undefined while loading or on error). */
     data: () => T | undefined;
     /** Whether the query is currently fetching. */
     loading: () => boolean;
     /** Error from the last fetch attempt. */
     error: () => Error | undefined;
     /** Re-run the query. */
     refetch: () => void;
     /** Manually set the data (for optimistic updates). */
     mutate: (data: T | ((prev: T | undefined) => T)) => void;
 };

 /** @public */
 export declare type RadialGradientCmd = {
     kind: "radialGradient";
     cx: number;
     cy: number;
     radius: number;
     from: number;
     to: number;
 };

 /** @public */
 export declare type RawCommandRenderOp = {
     kind: "raw-command";
     renderObjectId: number | null;
     command: RenderCommand;
 };

 /** @public */
 export declare type RawImage = DecodedImage;

 /** @public */
 export declare type RawImageData = {
     data: Uint8Array;
     width: number;
     height: number;
 };

 /** @public */
 export declare type RectangleRenderInputs = {
     renderObjectId: number | null;
     color: number;
     radius: number;
     image: ImagePaintConfig | null;
     canvas: CanvasPaintConfig | null;
     effect: EffectConfig | null;
 };

 /** @public */
 export declare type RectangleRenderOp = {
     kind: "rectangle";
     renderObjectId: number | null;
     command: RenderCommand;
     inputs: RectangleRenderInputs;
 };

 /** @public */
 export declare function rectBottom(rect: DamageRect): number;

 /** @public */
 export declare type RectCmd = {
     kind: "rect";
     x: number;
     y: number;
     w: number;
     h: number;
     fill?: number;
     stroke?: number;
     strokeWidth: number;
     radius: number;
 };

 /** @public */
 export declare function rectRight(rect: DamageRect): number;

 /** Register a font for use with Vexart text rendering. */
 /** @public */
 export declare function registerFont(id: number, desc: FontDescriptor): void;

 /** @public */
 export declare function registerNodeFocusable(node: TGENode): () => void;

 /** @public */
 export declare function releaseNativeKittyShm(handle: number, unlinkName: boolean): void;

 /** @public */
 export declare function releasePointerCapture(nodeId: number): void;

 /** @public Release scroll state for an unmounted scroll container. */
 export declare function releaseScrollHandle(scrollId: string): void;

 /** @public */
 export declare function removeChild(parent: TGENode, child: TGENode): void;

 /** @public */
 export declare interface RenderBounds {
     x: number;
     y: number;
     width: number;
     height: number;
 }

 /** @public */
 export declare type RenderCommand = {
     type: number;
     x: number;
     y: number;
     width: number;
     height: number;
     color: [number, number, number, number];
     cornerRadius: number;
     extra1: number;
     extra2: number;
     text?: string;
     /** Stable node ID for matching render ops to effects/images. */
     nodeId?: number;
 };

 /**
  * Renderer backend extension point.
  *
  * The runtime currently ships with a GPU render-graph backend, but the loop
  * talks to it through this interface so alternative backends can plug into the
  * same frame lifecycle in the future (for example WebGL, Vulkan, remote, or
  * test/instrumentation backends).
  *
  * Hooks are intentionally split by phase:
  * - beginFrame: inspect frame-wide heuristics and choose a strategy
  * - paint: render one layer or standalone target
  * - reuseLayer: opt into cached-layer reuse without repainting
  * - endFrame: finalize frame-wide presentation work
  */
 /** @public */
 export declare type RendererBackend = {
     name: string;
     beginFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFramePlan | void;
     paint: (ctx: RendererBackendPaintContext) => RendererBackendPaintResult | void;
     reuseLayer?: (ctx: {
         frame: RendererBackendFrameContext;
         layer: RendererBackendLayerContext;
     }) => boolean | void;
     compositeRetainedFrame?: (ctx: {
         frame: RendererBackendFrameContext;
         layers: RendererBackendRetainedLayer[];
     }) => RendererBackendFrameResult | null | void;
     endFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFrameResult | null | void;
     drainProfile?: () => RendererBackendProfile;
     destroy?: () => void;
 };

 /** @public */
 export declare type RendererBackendFrameContext = {
     viewportWidth: number;
     viewportHeight: number;
     dirtyLayerCount: number;
     layerCount: number;
     dirtyPixelArea: number;
     totalPixelArea: number;
     overlapPixelArea: number;
     overlapRatio: number;
     fullRepaint: boolean;
     useLayerCompositing: boolean;
     hasSubtreeTransforms: boolean;
     hasActiveInteraction: boolean;
     transmissionMode: "direct" | "file" | "shm";
     estimatedLayeredBytes: number;
     estimatedFinalBytes: number;
 };

 /** @public */
 export declare type RendererBackendFramePlan = {
     strategy: GpuLayerStrategyMode | null;
     nativePlan?: NativeFramePlan | null;
 };

 /** @public */
 export declare type RendererBackendFrameResult = {
     output: "none";
     strategy: GpuLayerStrategyMode | null;
 } | {
     output: "final-frame-raw";
     strategy: GpuLayerStrategyMode | null;
     finalFrame?: {
         data: Uint8Array;
         width: number;
         height: number;
     };
 } | {
     /** Native Kitty output was emitted for the full frame — no RGBA payload in JS. */
     output: "native-presented";
     strategy: GpuLayerStrategyMode | null;
     stats?: NativePresentationStats | null;
 };

 /** @public */
 export declare type RendererBackendLayerBacking = {
     kind: "gpu" | "raw";
     imageId: number;
     targetKey: string;
     width: number;
     height: number;
 };

 /** @public */
 export declare type RendererBackendLayerContext = {
     key: string;
     z: number;
     backing: RendererBackendLayerBacking | null;
     subtreeTransform: {
         p0: {
             x: number;
             y: number;
         };
         p1: {
             x: number;
             y: number;
         };
         p2: {
             x: number;
             y: number;
         };
         p3: {
             x: number;
             y: number;
         };
     } | null;
     isBackground: boolean;
     bounds: DamageRect;
     dirtyRect: DamageRect | null;
     repaintRect: DamageRect | null;
     allowRegionalRepaint: boolean;
     retainedDuringInteraction: boolean;
 };

 /** @public */
 export declare type RendererBackendPaintContext = {
     targetWidth: number;
     targetHeight: number;
     backing: RendererBackendLayerBacking | null;
     /** GPU target descriptor for the current paint. Width/height only — no raw bytes. */
     target: {
         width: number;
         height: number;
     };
     commands: RenderCommand[];
     graph: RenderGraphFrame;
     offsetX: number;
     offsetY: number;
     cellWidth?: number;
     cellHeight?: number;
     frame: RendererBackendFrameContext | null;
     layer: RendererBackendLayerContext | null;
 };

 /** @public */
 export declare type RendererBackendPaintResult = {
     output: "kitty-payload";
     strategy?: GpuLayerStrategyMode | null;
     kittyPayload?: {
         data: Uint8Array;
         width: number;
         height: number;
         region?: DamageRect;
     };
 } | {
     output: "skip-present";
     strategy?: GpuLayerStrategyMode | null;
 } | {
     /** Native Kitty output was emitted directly from Rust — no RGBA payload in JS. */
     output: "native-presented";
     strategy?: GpuLayerStrategyMode | null;
     stats?: NativePresentationStats | null;
 };

 /** @public */
 export declare type RendererBackendProfile = {
     compositeMs: number;
     readbackMs: number;
     nativeEmitMs: number;
     nativeReadbackMs: number;
     nativeCompressMs: number;
     nativeShmPrepareMs: number;
     nativeWriteMs: number;
     nativeRawBytes: number;
     nativePayloadBytes: number;
     uniformUpdateMs: number;
 };

 /** @public */
 export declare type RendererBackendRetainedLayer = {
     key: string;
     z: number;
     bounds: DamageRect;
     subtreeTransform: {
         p0: {
             x: number;
             y: number;
         };
         p1: {
             x: number;
             y: number;
         };
         p2: {
             x: number;
             y: number;
         };
         p3: {
             x: number;
             y: number;
         };
     } | null;
     isBackground: boolean;
     opacity: number;
 };

 /** @public */
 export declare type RenderGraphFrame = {
     ops: RenderGraphOp[];
 };

 /** @public */
 export declare type RenderGraphOp = RectangleRenderOp | ImageRenderOp | CanvasRenderOp | EffectRenderOp | BorderRenderOp | TextRenderOp | RawCommandRenderOp;

 /** @public */
 export declare type RenderGraphQueues = {
     effects: Map<number, EffectConfig>;
     images: Map<number, ImagePaintConfig>;
     canvases: Map<number, CanvasPaintConfig>;
 };

 /** @public */
 export declare type RenderGraphQueueState = {
     borderEffectIndex: number;
 };

 /** @public */
 export declare type RenderLoop = {
     root: TGENode;
     start: () => void;
     stop: () => void;
     frame: () => void;
     feedScroll: (dx: number, dy: number) => void;
     feedPointer: (x: number, y: number, down: boolean) => void;
     nudgeInteraction: (kind: "pointer" | "scroll" | "key") => void;
     requestInteractionFrame: (kind: "pointer" | "scroll" | "key") => void;
     needsPointerRepaint: () => boolean;
     setPointerCapture: (nodeId: number) => void;
     releasePointerCapture: (nodeId: number) => void;
     onPostScroll: (cb: () => void) => () => void;
     markNodeLayerDamaged: (nodeId: number, rect?: DamageRect) => void;
     suspend: () => void;
     resume: () => void;
     suspended: () => boolean;
     /** Schedule a task to run during frame budget drain. Returns cancel function. */
     scheduleTask: (priority: "user-blocking" | "user-visible" | "background", fn: () => void) => () => void;
     destroy: () => void;
 };

 /** @public */
 export declare type RenderLoopOptions = {
     experimental?: {
         frameBudgetMs?: number;
         maxFps?: number;
         idleMaxFps?: number;
         interactionMaxFps?: number;
         forceLayerRepaint?: boolean;
         nativePresentation?: boolean;
         nativeLayerRegistry?: boolean;
     };
 };

 /** @public */
 export declare function reportKittyTransportFailure(mode: TransmissionMode, reason: KittyTransportFailureReason): void;

 /** @public */
 export declare function reportKittyTransportSuccess(mode: TransmissionMode): void;

 /** @public */
 export declare function requestInteractionFrame(kind: "pointer" | "scroll" | "key"): void;

 /** @public */
 export declare function resetFocus(): void;

 /** @public */
 export declare function resetKittyTransportManager(): void;

 /** @public */
 export declare function resetKittyTransportStats(): void;

 /** @public */
 export declare function resetRenderGraphQueues(queues: RenderGraphQueues): void;

 /** @public */
 export declare function resetScrollHandles(): void;

 /** @public */
 export declare function resetSelection(): void;

 /** @public */
 export declare type ResizeEvent = {
     type: "resize";
 };

 /** @public */
 export declare type ResizeHandler = (size: TerminalSize) => void;

 /** @public */
 export declare function resolveKittyTransportMode(requestedMode: TransmissionMode): "direct" | "file" | "shm";

 /**
  * Resolve effective props:
  *   1. Merge `style` prop under direct props (direct wins)
  *   2. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow
  *   3. Resolve padding shorthand: [Y,X] or [T,R,B,L]
  *   4. Merge hoverStyle/activeStyle/focusStyle when active
  */
 /** @public */
 export declare function resolveProps(node: TGENode): TGEProps;

 /** @public */
 export declare type ResourceStats = {
     budgetBytes: number;
     currentUsage: number;
     highWaterMark: number;
     resourcesByKind: Record<string, {
         count: number;
         bytes: number;
     }>;
     evictionsLastFrame: number;
     evictionsTotal: number;
 };

 /** @public */
 export declare class RGBA {
     readonly r: number;
     readonly g: number;
     readonly b: number;
     readonly a: number;
     constructor(r: number, g: number, b: number, a?: number);
     static fromInts(r: number, g: number, b: number, a?: number): RGBA;
     static fromHex(hex: string): RGBA;
     static fromValues(r: number, g: number, b: number, a?: number): RGBA;
     toU32(): number;
     valueOf(): number;
     toString(): string;
 }

 /** @public */
 export declare function rotate(degrees: number): Matrix3;

 /** @public */
 export declare type RouteDefinition = {
     path: string;
     component: (props: RouteProps) => JSX.Element;
 };

 /** @public */
 export declare type RouteProps = {
     params?: NavigationParams;
 };

 /** @public */
 export declare type RouterContextValue = {
     current: () => string;
     navigate: (path: string, params?: NavigationParams) => void;
     goBack: () => boolean;
     params: () => NavigationParams | undefined;
     history: () => NavigationEntry[];
 };

 /** @public */
 export declare type RouterProps = {
     initial?: string;
     children?: JSX.Element;
 };

 /** @public */
 export declare function scale(s: number): Matrix3;

 /** @public */
 export declare type ScaledImageCache = {
     get: (src: RawImage, targetW: number, targetH: number, key: string) => RawImage;
     clear: () => void;
 };

 /**
  * Scale image pixels to fit a target box.
  * Returns a new RGBA buffer at the target dimensions.
  */
 /** @public */
 export declare function scaleImage(src: DecodedImage, targetW: number, targetH: number, fit?: "contain" | "cover" | "fill" | "none"): {
     data: Uint8Array;
     width: number;
     height: number;
     offsetX: number;
     offsetY: number;
 };

 /** @public */
 export declare function scaleXY(sx: number, sy: number): Matrix3;

 /** @public */
 export declare type ScreenEntry = {
     key: string;
     component: (props: ScreenProps) => JSX.Element;
     params?: NavigationParams;
 };

 /** @public */
 export declare type ScreenProps = {
     params?: NavigationParams;
     goBack: () => void;
 };

 /**
  * scroll.ts — programmatic scroll state
  *
  * Provides scroll handles for programmatic scroll control.
  * Flexily layout output drives scroll geometry;
  * scroll state is managed TS-side.
  *
  * The ScrollHandle API is preserved for API continuity. Scroll positions
  * are tracked in this module; the vexart composite layer handles the
  * scissor clipping during paint (paint-side, unchanged).
  *
  * Scroll IDs are stable strings shared by scroll containers and handles.
  */
 /** @public */
 export declare type ScrollHandle = {
     readonly scrollX: number;
     readonly scrollY: number;
     readonly contentWidth: number;
     readonly contentHeight: number;
     readonly viewportWidth: number;
     readonly viewportHeight: number;
     readonly y: number;
     readonly height: number;
     readonly scrollHeight: number;
     readonly scrollTop: number;
     scrollTo: (y: number) => void;
     scrollBy: (dy: number) => void;
     scrollIntoView: (y: number, height: number) => void;
     readonly _scrollId: string;
 };

 /** @public */
 export declare const selectionSignal: Accessor<TextSelection | null>;

 /** Set debug overlay state explicitly. */
 /** @public */
 export declare function setDebug(enabled: boolean): void;

 /** @public */
 export declare function setFocus(id: string): void;

 /** @public */
 export declare const setFocusedId: Setter<string | null>;

 /** @public */
 export declare function setPointerCapture(nodeId: number): void;

 /** @public */
 export declare const setProp: <T>(node: TGENode, name: string, value: T, prev?: T | undefined) => T;

 /** @public */
 export declare function setRendererBackend(backend: RendererBackend | null): void;

 /** @public */
 export declare function setSelection(sel: TextSelection | null): void;

 /** @public */
 export declare type ShadowDef = {
     x: number;
     y: number;
     blur: number;
     color: number;
 };

 /** @public */
 export declare type ShapeStyle = {
     fill?: number;
     stroke?: number;
     strokeWidth?: number;
     glow?: {
         color: number;
         radius: number;
         intensity?: number;
     };
 };

 /** @public */
 export declare function shouldFreezeInteractionLayer(node: TGENode | null | undefined): boolean;

 /** @public */
 export declare function shouldPromoteInteractionLayer(node: TGENode | null | undefined): boolean;

 export { Show }

 /** @public */
 export declare type SimpleHighlight = [number, number, string];

 /** @public */
 export declare type SimpleThemeRules = Record<string, string | number>;

 /** @public Sizing type enum for layout adapter sizing values. */
 export declare const SIZING: {
     readonly FIT: 0;
     readonly GROW: 1;
     readonly PERCENT: 2;
     readonly FIXED: 3;
 };

 /** @public */
 export declare type SizingInfo = {
     type: number;
     value: number;
 };

 /** @public */
 export declare function skew(degreesX: number, degreesY: number): Matrix3;

 /** A renderable component factory */
 /** @public */
 export declare type SlotComponent = () => JSX.Element;

 /** @public */
 export declare type SlotRegistry = {
     /** Register a component in a named slot. Returns an unregister function. */
     register: (slotName: string, component: SlotComponent) => () => void;
     /** Get all components registered for a slot. */
     getSlot: (slotName: string) => SlotComponent[];
     /** Check if a slot has any registered components. */
     hasSlot: (slotName: string) => boolean;
     /** Clear all slots. */
     clear: () => void;
     /** Reactive version counter — increments on any registration change. */
     version: () => number;
 };

 /** @public */
 export declare const solidRender: (code: () => TGENode, node: TGENode) => () => void;

 /** @public */
 export declare const spread: <T>(node: any, accessor: (() => T) | T, skipChildren?: boolean) => void;

 /** @public */
 export declare type SpringConfig = {
     stiffness?: number;
     damping?: number;
     mass?: number;
     precision?: number;
     compositor?: {
         nodeId: number;
         property: CompositorProperty;
     };
 };

 /** @public */
 export declare type StarfieldCmd = {
     kind: "starfield";
     x: number;
     y: number;
     w: number;
     h: number;
     seed: number;
     count: number;
     clusterCount: number;
     clusterStars: number;
     warmColor: number;
     neutralColor: number;
     coolColor: number;
 };

 /** @public */
 export declare type StrokeStyle = {
     color: number;
     width?: number;
 };

 /**
  * SyntaxStyle — maps tree-sitter capture names to colors.
  *
  * Follows opentui's pattern:
  *   - Theme rules: { scope: ["keyword", "keyword.function"], style: { foreground: "#c678dd" } }
  *   - Dot-notation fallback: "function.method" → "function" if no exact match
  *   - getStyleId(name) returns a numeric ID for highlight integration
  *
  * Unlike opentui, this is TS-only because Vexart renders per-token <text>
  * elements with individual colors — no native text buffer.
  *
  * Usage:
  *   const style = SyntaxStyle.fromTheme([
  *     { scope: ["keyword"], style: { foreground: "#c678dd" } },
  *     { scope: ["string"], style: { foreground: "#98c379" } },
  *   ])
  *
  *   style.colorFor("keyword")  // → 0xc678ddff
  *   style.colorFor("keyword.function")  // → 0xc678ddff (dot-fallback)
  */
 /** @public */
 export declare type StyleDefinition = {
     fg?: number;
     bg?: number;
     bold?: boolean;
     italic?: boolean;
     underline?: boolean;
 };

 export { Switch }

 /** @public */
 export declare class SyntaxStyle {
     private styles;
     private idMap;
     private nextId;
     private defaultColor;
     private constructor();
     /** Create from structured theme rules.
      *
      * @public
      */
     static fromTheme(rules: ThemeTokenStyle[], defaultColor?: string | number): SyntaxStyle;
     /** Create from simple scope-to-color rules.
      *
      * @public
      */
     static fromSimple(rules: SimpleThemeRules, defaultColor?: string | number): SyntaxStyle;
     /** Register a named style. */
     registerStyle(name: string, def: StyleDefinition): number;
     /**
      * Get the style definition for a scope name.
      *
      * Supports dot-notation fallback:
      *   "function.method" → looks for "function.method", then "function"
      */
     getStyle(name: string): StyleDefinition | undefined;
     /** Get the foreground color for a scope name. Falls back to default. */
     colorFor(name: string): number;
     /** Get the numeric ID for a scope name (for extmark integration). */
     getStyleId(name: string): number;
     /** Get the default (fallback) color. */
     getDefaultColor(): number;
     /** Get all registered styles. */
     getAllStyles(): Map<string, StyleDefinition>;
 }

 /** @public */
 export declare type Terminal = {
     /** Terminal emulator kind */
     kind: TerminalKind;
     /** Resolved capabilities */
     caps: Capabilities;
     /** Current terminal size */
     size: TerminalSize;
     /** Write to stdout (tmux passthrough-wrapped for Kitty graphics) */
     write: (data: string) => void;
     /** Write to stdout WITHOUT tmux wrapping (for ANSI sequences, cursor, SGR) */
     rawWrite: (data: string) => void;
     /** Write raw bytes to stdout */
     writeBytes: (data: Uint8Array) => void;
     /** Begin synchronized output frame */
     beginSync: () => void;
     /** End synchronized output frame */
     endSync: () => void;
     /** Subscribe to resize events. Returns unsubscribe. */
     onResize: (handler: ResizeHandler) => () => void;
     /** Subscribe to stdin data. Returns unsubscribe. */
     onData: (handler: (data: Buffer) => void) => () => void;
     /** Terminal background color (queried), null if unavailable */
     bgColor: [number, number, number] | null;
     /** Terminal foreground color (queried), null if unavailable */
     fgColor: [number, number, number] | null;
     /** Whether terminal background is dark */
     isDark: boolean;
     /** Set the terminal window title via OSC 2 */
     setTitle: (title: string) => void;
     /** Write text to system clipboard via OSC 52 */
     writeClipboard: (text: string) => void;
     /** Suspend Vexart mode — restore terminal for external process ($EDITOR). Call resume() to re-enter. */
     suspend: () => void;
     /** Resume Vexart mode after suspend — re-enter raw mode, alt screen, mouse, etc. */
     resume: () => void;
     /** Destroy the terminal — restore original state, remove handlers */
     destroy: () => void;
 };

 /**
  * Terminal identification.
  *
  * Detects which terminal emulator is running by inspecting
  * environment variables. Each terminal sets specific env vars
  * that uniquely identify it.
  *
  * Detection order matters — more specific checks first.
  */
 /** @public */
 export declare type TerminalKind = "ghostty" | "kitty" | "wezterm" | "iterm2" | "alacritty" | "foot" | "contour" | "xterm" | "unknown";

 /** @public */
 export declare type TerminalOptions = {
     /** stdin stream (default: process.stdin) */
     stdin?: NodeJS.ReadStream;
     /** stdout stream (default: process.stdout) */
     stdout?: NodeJS.WriteStream;
     /** Skip active probing (faster init, uses static inference only) */
     skipProbe?: boolean;
     /** Skip color query */
     skipColors?: boolean;
     /** Probe timeout in ms */
     probeTimeout?: number;
 };

 /**
  * Terminal size detection and resize handling.
  *
  * Provides terminal dimensions in both cells and pixels.
  * Pixel dimensions are essential for Vexart — they determine
  * the resolution of the pixel buffer.
  *
  * Cell pixel size (cellWidth, cellHeight) is derived from:
  *   pixelWidth / cols  and  pixelHeight / rows
  *
  * This gives us the "downsample factor" — how many pixels
  * fit in one terminal cell. Typically ~8x16 or ~10x20.
  */
 /** @public */
 export declare type TerminalSize = {
     /** Terminal width in columns (cells) */
     cols: number;
     /** Terminal height in rows (cells) */
     rows: number;
     /** Terminal width in pixels (0 if unavailable) */
     pixelWidth: number;
     /** Terminal height in pixels (0 if unavailable) */
     pixelHeight: number;
     /** Single cell width in pixels */
     cellWidth: number;
     /** Single cell height in pixels */
     cellHeight: number;
 };

 /** @public */
 export declare type TextCmd = {
     kind: "text";
     x: number;
     y: number;
     text: string;
     color: number;
 };

 /** @public */
 export declare type TextMeta = {
     nodeId: number;
     content: string;
     fontId: number;
     fontSize: number;
     lineHeight: number;
 };

 /** @public */
 export declare type TextRenderInputs = {
     text: string;
     fontId: number;
     fontSize: number;
     lineHeight: number;
     maxWidth: number;
     textHeight: number;
 };

 /** @public */
 export declare type TextRenderOp = {
     kind: "text";
     renderObjectId: number | null;
     command: RenderCommand;
     inputs: TextRenderInputs;
 };

 /** @public */
 export declare type TextSelection = {
     text: string;
     sourceId: number;
     start: number;
     end: number;
 };

 /** @public */
 export declare type TGENode = {
     kind: TGENodeKind;
     props: TGEProps;
     text: string;
     children: TGENode[];
     parent: TGENode | null;
     /** Stable unique identifier for this node */
     id: number;
     /** Whether this node has been removed from the tree */
     destroyed: boolean;
     /** Computed layout rect — written after the layout pass */
     layout: LayoutRect;
     /** Interactive state — managed by render loop hit-testing */
     _hovered: boolean;
     _active: boolean;
     _focused: boolean;
     /** Image-only extra data, allocated lazily for img nodes. */
     _imageExtra: NodeImageExtra | null;
     /** Canvas-only extra data, allocated lazily for canvas nodes. */
     _canvasExtra: NodeCanvasExtra | null;
     /** Pre-parsed width sizing — resolved once in setProperty, read every frame */
     _widthSizing: SizingInfo | null;
     /** Pre-parsed height sizing — resolved once in setProperty, read every frame */
     _heightSizing: SizingInfo | null;
     /** Prop keys applied from the JSX style object during the previous style merge. */
     _styleKeys?: Set<string>;
     /** Computed LOCAL transform matrix — set after layout if node has transform prop */
     _transform: Float64Array | null;
     /** Inverse LOCAL transform matrix — for local-space calculations */
     _transformInverse: Float64Array | null;
     /** Accumulated transform matrix — local × parent's accumulated (hierarchy) */
     _accTransform: Float64Array | null;
     /** Inverse accumulated transform — for hit-testing (screen → local coords) */
     _accTransformInverse: Float64Array | null;
     /** Transient engine-managed interaction mode for compositor optimizations. */
     _interactionMode: InteractionMode;
     /** Cached effective visual props from resolveProps(). */
     _vp: TGEProps | null;
     /** True when cached effective visual props must be recomputed. */
     _vpDirty: boolean;
     /** Sibling position maintained by insert/remove for O(1) next-sibling lookup. */
     _siblingIndex: number;
     /** Count of focusable nodes in this subtree, including self. */
     _focusableCount: number;
     /** Pre-order index assigned by walkTree for paint-order comparisons. */
     _dfsIndex: number;
     /** Nearest scroll-container ancestor id, or 0 when none. */
     _scrollContainerId: number;
     /** Consecutive frames where this node's layer/subtree stayed clean. */
     _stableFrameCount: number;
     /** Consecutive frames where this node's layer/subtree changed. */
     _unstableFrameCount: number;
     /** True when this node was promoted by automatic compositor heuristics. */
     _autoLayer: boolean;
     /** Key of the owning compositor layer, or "bg" for the default layer. */
     _layerKey: string | null;
     /** Last text measurement cache key and result for per-node frame reuse. */
     _lastMeasuredText: string | null;
     _lastMeasuredFontId: number;
     _lastMeasuredFontSize: number;
     _lastMeasurement: {
         width: number;
         height: number;
     } | null;
 };

 /** @public */
 export declare type TGENodeKind = "box" | "text" | "img" | "canvas" | "root";

 /** Plugin interface.
  *  @template Context — extra context the host app provides (theme, api, etc.) */
 /** @public */
 export declare type TgePlugin<Context = {}> = {
     /** Plugin name (for debugging) */
     name: string;
     /** Setup function — called once during mount. Return cleanup function if needed. */
     setup: (api: TgePluginApi<Context>) => void | (() => void);
 };

 /** Plugin API exposed to plugins during setup.
  *  Base API includes slots + terminal. Apps extend with custom context
  *  (theme, app state, etc.) by passing a richer object to setup(). */
 /** @public */
 export declare type TgePluginApi<Context = {}> = {
     /** Register/unregister components in named slots */
     slots: SlotRegistry;
     /** Access to the terminal */
     terminal: Terminal;
 } & Context;

 /** @public */
 export declare type TGEProps = {
     direction?: "row" | "column";
     /** Alias for direction (opentui compat) */
     flexDirection?: "row" | "column";
     padding?: number;
     paddingX?: number;
     paddingY?: number;
     margin?: number;
     marginX?: number;
     marginY?: number;
     gap?: number;
     alignX?: "left" | "right" | "center" | "space-between";
     alignY?: "top" | "bottom" | "center" | "space-between";
     /** Alias for alignX (opentui compat) */
     justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end";
     /** Alias for alignY (opentui compat) */
     alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end";
     width?: number | string;
     height?: number | string;
     /** When set, width behaves as "grow" (opentui compat) */
     flexGrow?: number;
     /** Accepted for CSS compatibility. Flexily handles shrinking automatically. */
     flexShrink?: number;
     backgroundColor?: string | number;
     cornerRadius?: number;
     /** CSS-friendly alias for cornerRadius (Decision 1) */
     borderRadius?: number;
     cornerRadii?: {
         tl: number;
         tr: number;
         br: number;
         bl: number;
     };
     borderColor?: string | number;
     borderWidth?: number;
     /** Opacity: 0.0 = fully transparent, 1.0 = fully opaque. Multiplies alpha of entire element. */
     opacity?: number;
     layer?: boolean;
     /** Declarative interaction state used by engine-level drag/compositor policies. */
     interactionMode?: InteractionMode;
     debugName?: string;
     scrollX?: boolean;
     scrollY?: boolean;
     scrollSpeed?: number;
     scrollId?: string;
     floating?: "parent" | "root" | {
         attachTo: string;
     };
     floatOffset?: {
         x: number;
         y: number;
     };
     zIndex?: number;
     floatAttach?: {
         element?: number;
         parent?: number;
     };
     pointerPassthrough?: boolean;
     viewportClip?: boolean;
     minWidth?: number;
     maxWidth?: number;
     minHeight?: number;
     maxHeight?: number;
     paddingLeft?: number;
     paddingRight?: number;
     paddingTop?: number;
     paddingBottom?: number;
     marginLeft?: number;
     marginRight?: number;
     marginTop?: number;
     marginBottom?: number;
     borderLeft?: number;
     borderRight?: number;
     borderTop?: number;
     borderBottom?: number;
     borderBetweenChildren?: number;
     shadow?: {
         x: number;
         y: number;
         blur: number;
         color: string | number;
     } | Array<{
         x: number;
         y: number;
         blur: number;
         color: string | number;
     }>;
     /** CSS-friendly alias for shadow (Decision 1) */
     boxShadow?: TGEProps["shadow"];
     glow?: {
         radius: number;
         color: string | number;
         intensity?: number;
     };
     gradient?: {
         type: "linear";
         from: string | number;
         to: string | number;
         angle?: number;
     } | {
         type: "radial";
         from: string | number;
         to: string | number;
     };
     backdropBlur?: number;
     /** Backdrop brightness filter. 0=black, 100=unchanged, 200=2x bright. */
     backdropBrightness?: number;
     /** Backdrop contrast filter. 0=grey, 100=unchanged, 200=high contrast. */
     backdropContrast?: number;
     /** Backdrop saturation filter. 0=grayscale, 100=unchanged, 200=hyper-saturated. */
     backdropSaturate?: number;
     /** Backdrop grayscale filter. 0=unchanged, 100=full grayscale. */
     backdropGrayscale?: number;
     /** Backdrop invert filter. 0=unchanged, 100=fully inverted. */
     backdropInvert?: number;
     /** Backdrop sepia filter. 0=unchanged, 100=full sepia. */
     backdropSepia?: number;
     /** Backdrop hue-rotate filter. 0-360 degrees, 0/360=unchanged. */
     backdropHueRotate?: number;
     /**
      * Self-filter applied to this element's own paint output.
      * Unlike backdropBlur/backdropFilter which affect content BEHIND the element,
      * `filter` affects the element's own rendered pixels (REQ-2B-401).
      */
     filter?: FilterConfig;
     /**
      * Hint that this property will change soon — pre-promotes the node to its own
      * GPU compositing layer to avoid runtime promotion cost (REQ-2B-501).
      * Accepted values: "transform", "opacity", "filter", "scroll".
      */
     willChange?: string | string[];
     /**
      * Containment boundary hint (REQ-2B-502).
      * - 'none': no containment (default).
      * - 'layout': size changes inside do not re-lay out siblings.
      * - 'paint': content clipped to bounds; no overflow visible.
      * - 'strict': layout + paint combined.
      */
     contain?: 'none' | 'layout' | 'paint' | 'strict';
     hoverStyle?: InteractiveStyleProps;
     activeStyle?: InteractiveStyleProps;
     /** Focus state — applied when element has focus (Decision 7) */
     focusStyle?: InteractiveStyleProps;
     /** Unified press handler — fires on mouse click + Enter/Space when focused (Decision 6) */
     onPress?: (event?: PressEvent) => void;
     /** Make this element focusable via Tab navigation. Like HTML tabindex="0". */
     focusable?: boolean;
     /** Keyboard event handler — fires when this element is focused and a key is pressed. */
     onKeyDown?: (event: any) => void;
     /** Fires when mouse button is pressed while over this node. */
     onMouseDown?: (event: NodeMouseEvent) => void;
     /** Fires when mouse button is released while over this node. */
     onMouseUp?: (event: NodeMouseEvent) => void;
     /** Fires when pointer moves over this node (every frame while hovered). */
     onMouseMove?: (event: NodeMouseEvent) => void;
     /** Fires when pointer enters this node's bounds. */
     onMouseOver?: (event: NodeMouseEvent) => void;
     /** Fires when pointer leaves this node's bounds. */
     onMouseOut?: (event: NodeMouseEvent) => void;
     /** Transform configuration: translate, rotate, scale, skew, perspective. */
     transform?: {
         translateX?: number;
         translateY?: number;
         rotate?: number;
         scale?: number;
         scaleX?: number;
         scaleY?: number;
         skewX?: number;
         skewY?: number;
         perspective?: number;
         rotateX?: number;
         rotateY?: number;
     };
     /** Transform origin point. Default: "center". */
     transformOrigin?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | {
         x: number;
         y: number;
     };
     /** CSS-style prop — merged with direct props (direct props win). Decision 3. */
     style?: Partial<TGEProps>;
     /** Image source — file path or URL. Decoded async on first render. */
     src?: string;
     /** How the image fits within its layout box. Default: "contain". */
     objectFit?: "contain" | "cover" | "fill" | "none";
     /** Imperative draw callback — compat/lab canvas API, called each frame with a CanvasContext. */
     onDraw?: (ctx: CanvasContext) => void;
     /** Optional cache key for static canvas draw lists. Change it when onDraw output changes. */
     drawCacheKey?: string | number;
     /** Viewport transform for pan and zoom. */
     viewport?: {
         x: number;
         y: number;
         zoom: number;
     };
     color?: string | number;
     fontSize?: number;
     fontId?: number;
     lineHeight?: number;
     wordBreak?: "normal" | "keep-all";
     whiteSpace?: "normal" | "pre-wrap";
     fontFamily?: string;
     fontWeight?: number;
     fontStyle?: "normal" | "italic";
 };

 /** @public */
 export declare type ThemeTokenStyle = {
     scope: string[];
     style: {
         foreground?: string | number;
         background?: string | number;
         bold?: boolean;
         italic?: boolean;
         underline?: boolean;
     };
 };

 /** Toggle debug overlay on/off. */
 /** @public */
 export declare function toggleDebug(): void;

 /** @public */
 export declare type Token = {
     text: string;
     color: number;
 };

 /** @public */
 export declare function transformBounds(m: Matrix3, w: number, h: number): {
     x: number;
     y: number;
     width: number;
     height: number;
 };

 /** @public */
 export declare function transformPoint(m: Matrix3, x: number, y: number): {
     x: number;
     y: number;
 };

 /** @public */
 export declare type TransitionConfig = {
     duration?: number;
     easing?: EasingFn;
     delay?: number;
     compositor?: {
         nodeId: number;
         property: CompositorProperty;
     };
 };

 /** @public */
 export declare function translate(tx: number, ty: number): Matrix3;

 /** @public */
 export declare function translateRect(rect: DamageRect, dx: number, dy: number): DamageRect;

 /** @public */
 export declare type TransmissionMode = "shm" | "file" | "direct";

 /** Transmit raw RGBA/RGB bytes without constructing a PixelBuffer wrapper upstream. */
 /** @public */
 export declare function transmitRaw(write: (data: string) => void, image: RawImageData, id: number, opts?: {
     action?: "t" | "T" | "p";
     format?: 24 | 32;
     z?: number;
     placementId?: number;
     mode?: TransmissionMode;
     compress?: CompressMode;
 }): void;

 /** Transmit + place raw RGBA/RGB bytes without a PixelBuffer intermediary. */
 /** @public */
 export declare function transmitRawAt(write: (data: string) => void, image: RawImageData, id: number, col: number, row: number, opts?: {
     z?: number;
     placementId?: number;
     mode?: TransmissionMode;
     compress?: CompressMode;
     format?: 24 | 32;
 }): void;

 /** @public */
 export declare const TRANSPORT_FAILURE_REASON: {
     readonly PROBE_FAILED: "probe_failed";
     readonly SHM_OPEN_FAILED: "shm_open_failed";
     readonly FTRUNCATE_FAILED: "ftruncate_failed";
     readonly MMAP_FAILED: "mmap_failed";
     readonly FILE_WRITE_FAILED: "file_write_failed";
     readonly RUNTIME_TRANSPORT_ERROR: "runtime_transport_error";
 };

 /** @public */
 export declare const TRANSPORT_HEALTH: {
     readonly UNKNOWN: "unknown";
     readonly HEALTHY: "healthy";
     readonly DEGRADED: "degraded";
     readonly UNSUPPORTED: "unsupported";
 };

 /** @public */
 export declare class TreeSitterClient {
     private worker;
     private initialized;
     private initPromise;
     private callbacks;
     private idCounter;
     /** Initialize the client — spawns worker, loads default parsers. */
     initialize(): Promise<void>;
     private doInit;
     private sendAndWait;
     private handleMessage;
     /** Register an additional parser at runtime. */
     addFiletypeParser(config: FiletypeParserConfig): void;
     /**
      * One-shot highlight — parse content and return highlights.
      *
      * Returns SimpleHighlight[] = [startIndex, endIndex, groupName][]
      * Each highlight maps a byte range to a capture name (e.g., "keyword", "string").
      */
     highlightOnce(content: string, filetype: string): Promise<SimpleHighlight[]>;
     /** Check if client is ready. */
     isReady(): boolean;
     /** Destroy worker and clean up. */
     destroy(): void;
 }

 /** @public */
 export declare function unbindLoop(): void;

 /** @public */
 export declare function unionRect(a: DamageRect, b: DamageRect): DamageRect;

 /** @public */
 export declare function unregisterNodeFocusable(node: TGENode): void;

 /** @public */
 export declare function updateNodeFocusEntry(node: TGENode): void;

 /** @public Update scroll container geometry from layout output. */
 export declare function updateScrollContainerGeometry(scrollId: string, viewportWidth: number, viewportHeight: number, contentWidth: number, contentHeight: number): void;

 /** @public */
 export declare const use: <A, T>(fn: (element: TGENode, arg: A) => T, element: TGENode, arg: A) => T;

 export { useContext }

 /** @public */
 export declare function useDrag(opts: DragOptions): DragState;

 /** @public */
 export declare function useFocus(opts?: {
     id?: string;
     onKeyDown?: (event: KeyEvent) => void;
     onPress?: () => void;
 }): FocusHandle;

 /** @public */
 export declare function useHover(opts?: HoverOptions): HoverState;

 /** @public */
 export declare function useInput(): () => InputEvent_2 | null;

 /** @public */
 export declare function useInteractionLayer(): InteractionLayerState;

 /** @public */
 export declare function useKeyboard(): KeyboardState;

 /** @public */
 export declare function useMouse(): MouseState;

 /** @public */
 export declare function useMutation<T, V = void>(mutator: (variables: V) => Promise<T>, options?: MutationOptions<T, V>): MutationResult<T, V>;

 /** @public */
 export declare function useQuery<T>(fetcher: () => Promise<T>, options?: QueryOptions): QueryResult<T>;

 /** @public */
 export declare function useRouter(): RouterContextValue;

 /** @public */
 export declare function useTerminalDimensions(terminal: Terminal): {
     width: () => number;
     height: () => number;
     cols: () => number;
     rows: () => number;
     cellWidth: () => number;
     cellHeight: () => number;
 };

 /** @public */
 export declare const VEXART_SYMBOLS: {
     readonly vexart_version: {
         readonly args: [];
         readonly returns: FFIType.uint32_t;
     };
     readonly vexart_context_create: {
         readonly args: [FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_context_destroy: {
         readonly args: [FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_context_resize: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_paint_dispatch: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_paint_upload_image: {
         readonly args: [FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_paint_remove_image: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_target_create: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_target_destroy: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_target_begin_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_target_end_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_render_image_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.float, FFIType.float, FFIType.float, FFIType.float, FFIType.uint32_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_render_image_transform_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_update_uniform: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_copy_region_to_image: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_image_filter_backdrop: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_image_mask_rounded_rect: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_readback_rgba: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_composite_readback_region_rgba: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_text_load_atlas: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_text_dispatch: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_text_measure: {
         readonly args: [FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.uint32_t, FFIType.float, FFIType.ptr, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_frame: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_set_transport: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_shm_prepare: {
         readonly args: [FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_shm_release: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_frame_with_stats: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_layer_target: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_region: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_emit_region_target: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_kitty_delete_layer: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_upsert: {
         readonly args: [FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_mark_dirty: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_reuse: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_remove: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_clear: {
         readonly args: [FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_layer_present_dirty: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_resource_get_stats: {
         readonly args: [FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_resource_set_budget: {
         readonly args: [FFIType.uint64_t, FFIType.uint32_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_image_asset_register: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_image_asset_touch: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_image_asset_release: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_canvas_display_list_update: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t, FFIType.ptr];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_canvas_display_list_touch: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_canvas_display_list_release: {
         readonly args: [FFIType.uint64_t, FFIType.uint64_t, FFIType.uint64_t];
         readonly returns: FFIType.int32_t;
     };
     readonly vexart_get_last_error_length: {
         readonly args: [];
         readonly returns: FFIType.uint32_t;
     };
     readonly vexart_copy_last_error: {
         readonly args: [FFIType.ptr, FFIType.uint32_t];
         readonly returns: FFIType.uint32_t;
     };
 };

 /**
  * Retrieve the current thread's last vexart error string.
  * Calls vexart_get_last_error_length + vexart_copy_last_error into a temporary buffer.
  * Returns empty string if no error is set.
  */
 /** @public */
 export declare function vexartGetLastError(): string;

 /** @public */
 export declare class VexartNativeError extends Error {
     readonly code: number;
     constructor(code: number, message: string);
 }

 /**
  * Returns the bridge version reported by the native library.
  * Use assertBridgeVersion to validate it matches EXPECTED_BRIDGE_VERSION.
  */
 /** @public */
 export declare function vexartVersion(): number;

 /** @public */
 export declare type Viewport = {
     x: number;
     y: number;
     zoom: number;
 };

 /** @public */
 export declare function wrapPassthrough(raw: string): string;

 /**
  * Write the 16-byte graph buffer header into a graph buffer.
  *
  * @public
  * @param view - DataView over the graph buffer.
  * @param cmdCount - Number of commands that follow.
  * @param payloadBytes - Total payload bytes after the header.
  */
 export declare function writeHeader(view: DataView, cmdCount: number, payloadBytes: number): void;

 export { }
