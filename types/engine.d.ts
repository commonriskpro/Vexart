import { Accessor } from 'solid-js';
import { createComponent } from 'solid-js';
import { createContext } from 'solid-js';
import { createEffect } from 'solid-js';
import { createMemo } from 'solid-js';
import { ErrorBoundary } from 'solid-js';
import { For } from 'solid-js';
import { Index } from 'solid-js';
import type { JSX } from 'solid-js';
import { Match } from 'solid-js';
import { Show } from 'solid-js';
import { Switch } from 'solid-js';
import { useContext } from 'solid-js';

/**
 * Register additional parsers before client initialization.
 *
 * @public
 */
export declare function addDefaultParsers(parsers: FiletypeParserConfig[]): void;

/** @public */
export declare type AnimationAccessor = (() => number) & {
    stop: () => void;
    cancel: () => void;
};

/** @public */
export declare type AnimationSignal = [
AnimationAccessor,
(target: number) => void,
() => void
] & {
    stop: () => void;
    cancel: () => void;
};

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
export declare class CanvasContext {
    /* Excluded from this release type: _commands */
    /** Current viewport transform — set by the render loop from props */
    viewport: Viewport;
    constructor(viewport?: Viewport);
    /* Excluded from this release type: _reset */
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
/** @public Clear active focus. */
export declare function clearFocus(): void;

/** Clear all registered fonts and restore default font (id 0). */
/** @public */
export declare function clearFontRegistry(): void;

/** @public */
export declare function clearSelection(): void;

/** Clear all text measurement and layout caches. */
/** @public */
export declare function clearTextCache(): void;

/** @public Properties that can animate on the compositor thread. */
declare const COMPOSITOR_PROPERTY: {
    readonly TRANSFORM: "transform";
    readonly OPACITY: "opacity";
};

/** @public */
declare type CompositorProperty = (typeof COMPOSITOR_PROPERTY)[keyof typeof COMPOSITOR_PROPERTY];

/** @public Per-corner radius values. */
export declare type CornerRadii = {
    tl: number;
    tr: number;
    br: number;
    bl: number;
};

export { createComponent }

export { createContext }

export { createEffect }

/** Options for creating an extmark */
/** @public */
export declare type CreateExtmarkOptions = Omit<Extmark, "id">;

export { createMemo }

/** @public */
export declare function createParticleSystem(config: ParticleConfig): ParticleSystem;

/** @public */
export declare function createScrollHandle(scrollId: string): ScrollHandle;

/** @public */
export declare function createSlot(slotName: string, registry: SlotRegistry): () => JSX.Element | null;

/** Create a new slot registry. */
/** @public */
export declare function createSlotRegistry(): SlotRegistry;

/** @public */
export declare function createSpring(initial: number, config?: SpringConfig): AnimationSignal;

/**
 * Create and initialize a terminal handle.
 *
 * @public
 */
export declare function createTerminal(opts?: TerminalOptions): Promise<Terminal>;

/** @public */
export declare function createTransition(initial: number, config?: TransitionConfig): AnimationSignal;

/** @public */
export declare function debugDumpTree(target: NodeHandle): string;

/**
 * Format debug stats as a single-line string.
 * Useful for rendering in a text overlay.
 */
/** @public */
export declare function debugStatsLine(): string;

/**
 * Decode paste bytes to string — normalizes line endings.
 */
/** @public */
export declare function decodePasteBytes(bytes: Uint8Array | string): string;

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

export { ErrorBoundary }

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
export declare const focusedId: Accessor<string | null>;

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

/**
 * Text layout — native Rust font measurement for Vexart.
 *
 * All text measurement uses vexart_font_measure (Rust/ttf-parser) via FFI.
 * This ensures measurement and MSDF rendering use identical font metrics.
 *
 * Word wrapping is implemented in TS with greedy word-wrap using
 * native per-word measurements — same algorithm as Rust's font::layout.
 *
 * Replaces the former Pretext + @napi-rs/canvas (Skia polyfill) path.
 */
/** @public */
export declare type FontDescriptor = {
    family: string;
    size: number;
    weight?: number;
    style?: "normal" | "italic";
};

export { For }

/** Get font descriptor by ID. Falls back to default. */
/** @public */
export declare function getFont(id: number): FontDescriptor;

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
export declare function getSelectedText(): string;

/** @public */
declare function getSelection_2(): TextSelection | null;
export { getSelection_2 as getSelection }

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

/** @public Glow effect configuration (pre-parse, accepts string | number colors). */
export declare type GlowConfig = {
    radius: number;
    color: string | number;
    intensity?: number;
};

/** @public Gradient configuration (pre-parse, accepts string | number colors). */
export declare type GradientConfig = {
    type: "linear";
    from: string | number;
    to: string | number;
    angle?: number;
} | {
    type: "radial";
    from: string | number;
    to: string | number;
};

/** @beta */
export declare type GridAreaPlacement = string | {
    readonly rowStart: GridLineRef | "auto";
    readonly columnStart: GridLineRef | "auto";
    readonly rowEnd: GridLineRef | "auto";
    readonly columnEnd: GridLineRef | "auto";
};

/** @beta */
export declare type GridAutoFlow = "row" | "column" | "row-dense" | "column-dense";

/** @beta */
export declare type GridBreadth = number | GridPercent | "auto" | "min-content" | "max-content";

/** @beta */
export declare type GridContentAlignment = "start" | "end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch";

/** @beta */
export declare type GridErrorCode = "GRID_INVALID_VALUE" | "GRID_INVALID_TRACK" | "GRID_INVALID_REPEAT" | "GRID_TRACK_LIMIT" | "GRID_INVALID_AREA" | "GRID_CONFLICTING_PLACEMENT" | "GRID_INVALID_PLACEMENT" | "GRID_LINE_UNRESOLVED" | "GRID_UNSUPPORTED_ALIGNMENT" | "GRID_MEASURE_INVALID";

/** @beta */
export declare type GridFitContent = {
    readonly fitContent: number | GridPercent;
};

/** @beta */
export declare type GridFr = {
    readonly fr: number;
};

/** @beta */
export declare type GridItemAlignment = "start" | "end" | "center" | "stretch";

/** @beta */
export declare type GridLayoutError = {
    readonly code: GridErrorCode;
    readonly path: string;
    readonly nodeId: number;
};

/** @beta */
export declare type GridLineRef = number | {
    readonly name: string;
    readonly occurrence?: number;
} | {
    readonly span: number;
    readonly name?: string;
};

/** @beta */
export declare type GridMaxBreadth = GridBreadth | GridFr;

/** @beta */
export declare type GridMinMax = {
    readonly minmax: readonly [GridBreadth, GridMaxBreadth];
};

/** @beta */
export declare type GridPercent = {
    readonly percent: number;
};

/** @beta */
export declare type GridPlacement = {
    readonly start?: GridLineRef | "auto";
    readonly end?: GridLineRef | "auto";
};

/** @beta */
export declare type GridRepeatCount = number | "auto-fill" | "auto-fit";

/** @beta */
export declare type GridTrack = GridTrackSize | {
    readonly size: GridTrackSize;
    readonly before?: readonly string[];
    readonly after?: readonly string[];
} | {
    readonly repeat: {
        readonly count: GridRepeatCount;
        readonly tracks: readonly GridTrack[];
    };
};

/** @beta */
export declare type GridTrackSize = GridBreadth | GridFr | GridMinMax | GridFitContent;

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

export { Index }

/** @public */
declare type InputEvent_2 = KeyEvent | MouseEvent_2 | FocusEvent_2 | PasteEvent | ResizeEvent;
export { InputEvent_2 as InputEvent }

/** @public */
declare type InputSubscriber = (event: InputEvent_2) => void;

/** @public */
declare const INTERACTION_MODE: {
    readonly NONE: "none";
    readonly DRAG: "drag";
};

/** @public */
export declare type InteractionBinding = "auto" | "none" | InteractionLayerState;

/** @public */
export declare type InteractionLayerState = {
    ref: (handle: NodeHandle) => void;
    node: () => NodeHandle | null;
    mode: () => InteractionMode;
    begin: (mode?: Exclude<InteractionMode, "none">) => void;
    end: (mode?: Exclude<InteractionMode, "none">) => void;
};

/** @public */
export declare type InteractionMode = (typeof INTERACTION_MODE)[keyof typeof INTERACTION_MODE];

/** @public Interactive style props usable in hoverStyle, activeStyle, and focusStyle. */
export declare type InteractiveStyleProps = Partial<Pick<TGEProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "borderRadius" | "shadow" | "boxShadow" | "glow" | "gradient" | "backdropBlur" | "backdropBrightness" | "backdropContrast" | "backdropSaturate" | "backdropGrayscale" | "backdropInvert" | "backdropSepia" | "backdropHueRotate" | "opacity" | "filter">>;

/** Check if debug is enabled (reactive). */
/** @public */
export declare function isDebugEnabled(): boolean;

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

/** @public Computed layout geometry written each frame after layout. */
export declare type LayoutRect = {
    x: number;
    y: number;
    width: number;
    height: number;
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

export { Match }

/** Measure text dimensions (width and height) for a single line (no wrapping). */
/** @public */
export declare function measureText(text: string, fontIdOrOptions?: number | MeasureTextOptions): {
    width: number;
    height: number;
};

/** Options for single-line text width measurement. */
/** @public */
export declare type MeasureTextOptions = {
    fontId?: number;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    fontStyle?: string;
};

/** Measure text width for a single line (no wrapping). Uses native Rust FFI. */
/** @public */
export declare function measureTextWidth(text: string, fontIdOrOptions?: number | MeasureTextOptions): number;

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
declare const MOUSE_ACTION: {
    readonly PRESS: "press";
    readonly RELEASE: "release";
    readonly MOVE: "move";
    readonly SCROLL: "scroll";
};

/** @public */
export declare type MouseAction = (typeof MOUSE_ACTION)[keyof typeof MOUSE_ACTION];

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
export declare type NodeHandle = {
    readonly id: number;
    readonly kind: string;
    readonly layout: LayoutRect;
    readonly isDestroyed: boolean;
    readonly text?: string;
    readonly props: Readonly<Record<string, unknown>>;
    readonly imageState?: "idle" | "loading" | "loaded" | "error";
    readonly canvasCommands?: readonly CanvasDrawCommand[];
    readonly canvasDrawCacheKey?: string;
    focus: () => void;
    blur: () => void;
    readonly isFocused: boolean;
    readonly children: NodeHandle[];
    readonly parent: NodeHandle | null;
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

/** @public */
export declare function onInput(handler: InputSubscriber): () => void;

/** @public */
export declare function onPostScroll(cb: () => void): () => void;

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
export declare type PasteEvent = {
    type: "paste";
    text: string;
};

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

/** @public Event passed to onPress handlers. Supports stopPropagation like DOM events. */
export declare type PressEvent = {
    /** Prevent the event from bubbling to parent nodes. */
    stopPropagation: () => void;
    /** Whether stopPropagation() was called. */
    readonly propagationStopped: boolean;
};

/** @public */
export declare function pushFocusScope(): () => void;

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

/** Register a font for use with Vexart text rendering. */
/** @public */
export declare function registerFont(id: number, desc: FontDescriptor): void;

/** @public */
export declare function releasePointerCapture(nodeId: number): void;

/** @public Release scroll state for an unmounted scroll container. */
export declare function releaseScrollHandle(scrollId: string): void;

/** @public */
export declare type ResizeEvent = {
    type: "resize";
};

/** @public */
export declare type ResizeHandler = (size: TerminalSize) => void;

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
    readonly scrollId: string;
    /* Excluded from this release type: _scrollId */
};

/** @public */
export declare const selectionSignal: Accessor<TextSelection | null>;

/** Set debug overlay state explicitly. */
/** @public */
export declare function setDebug(enabled: boolean): void;

/** @public */
export declare function setFocus(id: string | null): void;

/** @public */
export declare function setPointerCapture(nodeId: number): void;

/** @public */
export declare function setSelection(sel: TextSelection | null): void;

/** @public Shadow definition (pre-parse, accepts string | number colors). */
export declare type ShadowConfig = {
    x: number;
    y: number;
    blur: number;
    color: string | number;
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

export { Show }

/** @public */
export declare type SimpleHighlight = [number, number, string];

/** @public */
export declare type SimpleThemeRules = Record<string, string | number>;

/** @public */
export declare type SizingInfo = {
    type: number;
    value: number;
};

/** Supported sizing keywords. @public */
export declare type SizingKeyword = "fit" | "grow" | "auto" | "fill";

/** Sizing percentage token (e.g. "100%", "50%"). @public */
export declare type SizingPercent = `${number}%`;

/** Sizing pixel token (e.g. "100px", "20px"). @public */
export declare type SizingPx = `${number}px`;

/** Sizing dimension unit for width and height. @public */
export declare type SizingUnit = number | SizingKeyword | SizingPercent | SizingPx;

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
export declare type TerminalKind = "ghostty" | "kitty" | "wezterm" | "iterm2" | "alacritty" | "foot" | "contour" | "herdr" | "xterm" | "unknown";

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
    /** Manage process-level OS exit signals via ProcessSignalHub (default: true) */
    manageProcessSignals?: boolean;
    /** AbortSignal to trigger terminal destruction and cleanup */
    signal?: AbortSignal;
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
export declare type TextSelection = {
    text: string;
    sourceId: number;
    start: number;
    end: number;
};

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
    /** @beta */
    layout?: "flex" | "grid";
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
    /** @beta */
    justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end" | "start" | "end" | "space-around" | "space-evenly" | "stretch";
    /** @beta */
    alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end" | "start" | "end" | "stretch";
    /** @beta */
    gridTemplateColumns?: readonly GridTrack[];
    /** @beta */
    gridTemplateRows?: readonly GridTrack[];
    /** @beta */
    gridAutoColumns?: GridTrackSize;
    /** @beta */
    gridAutoRows?: GridTrackSize;
    /** @beta */
    gridAutoFlow?: GridAutoFlow;
    /** @beta */
    gridTemplateAreas?: readonly (readonly (string | null)[])[];
    /** @beta */
    gridColumn?: GridPlacement;
    /** @beta */
    gridRow?: GridPlacement;
    /** @beta */
    gridArea?: GridAreaPlacement;
    /** @beta */
    alignContent?: GridContentAlignment;
    /** @beta */
    justifyItems?: GridItemAlignment;
    /** @beta */
    justifySelf?: GridItemAlignment;
    /** @beta */
    alignSelf?: GridItemAlignment;
    width?: SizingUnit;
    height?: SizingUnit;
    /** When set, width behaves as "grow" (opentui compat) */
    flexGrow?: number;
    /** Accepted for CSS compatibility. Flexily handles shrinking automatically. */
    flexShrink?: number;
    backgroundColor?: string | number;
    cornerRadius?: number;
    /** CSS-friendly alias for cornerRadius (Decision 1) */
    borderRadius?: number;
    cornerRadii?: CornerRadii;
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
    shadow?: ShadowConfig | ShadowConfig[];
    /** CSS-friendly alias for shadow (Decision 1) */
    boxShadow?: TGEProps["shadow"];
    glow?: GlowConfig;
    gradient?: GradientConfig;
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
    /** Alias for onPress (web convention). If both are provided, onPress takes precedence. */
    onClick?: (event?: PressEvent) => void;
    /** Make this element focusable via Tab navigation. Like HTML tabindex="0". */
    focusable?: boolean;
    /** Explicit ID for focus registration (defaults to id or node-focus-${id}) */
    focusId?: string;
    /** Keyboard event handler — fires when this element is focused and a key is pressed. */
    onKeyDown?: (event: KeyEvent) => void;
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
    transform?: TransformConfig;
    /** Transform origin point. Default: "center". */
    transformOrigin?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | {
        x: number;
        y: number;
    };
    /** Class name resolved by pluggable class name resolver. */
    className?: string;
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
    viewport?: ViewportConfig;
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

/** @public 2D transform configuration. */
export declare type TransformConfig = {
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

/** Unregister a font by ID. Returns false if id is 0 (default font cannot be unregistered). */
/** @public */
export declare function unregisterFont(id: number): boolean;

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
export declare function useTerminalDimensions(terminal: Terminal): {
    width: () => number;
    height: () => number;
    cols: () => number;
    rows: () => number;
    cellWidth: () => number;
    cellHeight: () => number;
};

/** @public */
export declare type Viewport = {
    x: number;
    y: number;
    zoom: number;
};

/** @public Viewport transform for canvas pan/zoom. */
export declare type ViewportConfig = {
    x: number;
    y: number;
    zoom: number;
};

export { }
