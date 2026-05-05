import { Accessor } from 'solid-js';
import { batch } from 'solid-js';
import { createContext } from 'solid-js';
import { createEffect } from 'solid-js';
import { createMemo } from 'solid-js';
import { createSignal } from 'solid-js';
import { ErrorBoundary } from 'solid-js';
import { For } from 'solid-js';
import { Index } from 'solid-js';
import { JSX } from 'solid-js';
import { Match } from 'solid-js';
import { onCleanup } from 'solid-js';
import { onMount } from 'solid-js';
import { Show } from 'solid-js';
import { Switch } from 'solid-js';
import { untrack } from 'solid-js';
import { useContext } from 'solid-js';

/** @public */
export declare type AppBoxProps = TGEProps & ClassNameProps;

/** @public */
export declare type AppContext = {
    /** The terminal instance */
    terminal: Terminal;
    /** The mount handle for suspend/resume/destroy */
    handle: MountHandle;
    /** Gracefully shut down the app */
    destroy: () => void;
};

/** @public */
export declare type AppRouteDefinition = {
    path: string;
    component: RouteComponent;
    layouts?: RouteLayoutComponent[];
    loading?: RouteComponent;
    error?: RouteErrorComponent;
    notFound?: RouteComponent;
    focusId?: string | null;
};

/** @public */
export declare type AppRouteMatch = {
    route: AppRouteDefinition;
    params: RouteParams;
};

/** @public */
export declare type AppRouter = {
    current: () => AppRouterState;
    history: () => AppRouterState[];
    match: () => AppRouteMatch | null;
    push: (path: string, options?: NavigationOptions) => void;
    replace: (path: string, options?: NavigationOptions) => void;
    navigate: (path: string, options?: NavigationOptions) => void;
    back: () => boolean;
    forward: () => boolean;
};

/** @public */
export declare type AppRouterContextValue = AppRouter;

/** @public */
export declare type AppRouterFocusRestorer = (focusId: string, state: AppRouterState) => void;

/** @public */
export declare type AppRouterProviderProps = {
    router: AppRouter;
    children?: JSX.Element;
};

/** @public */
export declare type AppRouterState = {
    path: string;
    params: RouteParams;
};

/** @public */
export declare type AppTextProps = TGEProps & ClassNameProps;

/** Async validator — same signature but returns a Promise. */
/** @public */
export declare type AsyncFieldValidator<T> = (value: T, allValues: Record<string, any>) => Promise<string | undefined | null>;

/** @public */
export declare function Avatar(props: AvatarProps): JSX;

/** @public */
export declare interface AvatarProps {
    name: string;
    size?: AvatarSize;
    color?: string | number;
}

/**
 * Avatar — shadcn-compatible avatar with fallback initial.
 *
 * Sizes: sm (24px), default (32px), lg (40px)
 * Shows a colored circle with the first character of the name.
 */
/** @public */
export declare type AvatarSize = "sm" | "default" | "lg";

/** @public */
export declare function Badge(props: BadgeProps): JSX;

/** @public */
export declare interface BadgeProps {
    variant?: BadgeVariant;
    children?: any;
}

/**
 * Badge — shadcn-compatible badge with semantic variants.
 *
 * Variants: default, secondary, outline, destructive
 *
 * Theme reactivity: variant colors use getter functions so themeColors
 * signals are read inside SolidJS effects (not captured eagerly).
 */
/** @public */
export declare type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export { batch }

/** @public */
declare type BezierCmd = {
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
export declare function Box(props: AppBoxProps): JSX.Element;

/** @public */
export declare type BoxProps = TGEProps & {
    children?: JSX.Element;
};

/** @public */
export declare function Button(props: ButtonProps): JSX;

/** @public */
export declare interface ButtonProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    onPress?: (event?: PressEvent) => void;
    focusId?: string;
    children?: any;
}

/** @public */
export declare type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg";

/** @public */
export declare type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";

/** @public */
declare class CanvasContext {
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
declare type Capabilities = {
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
export declare function Card(props: CardProps): JSX;

/** @public */
export declare function CardAction(props: CardActionProps): JSX;

/** @public */
export declare interface CardActionProps {
    children?: any;
}

/** @public */
export declare function CardContent(props: CardContentProps): JSX;

/** @public */
export declare interface CardContentProps {
    children?: any;
}

/** @public */
export declare function CardDescription(props: CardDescriptionProps): JSX;

/** @public */
export declare interface CardDescriptionProps {
    children?: any;
}

/** @public */
export declare function CardFooter(props: CardFooterProps): JSX;

/** @public */
export declare interface CardFooterProps {
    children?: any;
}

/** @public */
export declare function CardHeader(props: CardHeaderProps): JSX;

/** @public */
export declare interface CardHeaderProps {
    children?: any;
}

/**
 * Card — styled card composition using Void design tokens.
 *
 * @public
 */
/** @public */
export declare interface CardProps {
    children?: any;
    size?: "default" | "sm";
}

/** @public */
export declare function CardTitle(props: CardTitleProps): JSX;

/** @public */
export declare interface CardTitleProps {
    children?: any;
}

/** @public */
export declare function Checkbox(props: CheckboxProps): JSX.Element;

/** @public */
export declare type CheckboxProps = {
    /** Whether the checkbox is checked. */
    checked: boolean;
    /** Called with the new value when toggled. */
    onChange?: (checked: boolean) => void;
    /** Disabled state. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Render function — receives state, returns visual. */
    renderCheckbox: (ctx: CheckboxRenderContext) => JSX.Element;
};

/** @public */
export declare type CheckboxRenderContext = {
    checked: boolean;
    focused: boolean;
    disabled: boolean;
    /** Spread on the root element for click toggle + keyboard + focus. */
    toggleProps: {
        focusable: true;
        onPress: () => void;
    };
};

/** @public */
declare type CircleCmd = {
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
export declare const CLASS_NAME_UNKNOWN_BEHAVIOR: {
    readonly IGNORE: "ignore";
    readonly WARN: "warn";
    readonly ERROR: "error";
};

/** @public */
export declare type ClassNameDiagnostic = {
    className: string;
    reason: string;
    suggestion?: string;
};

/** @public */
export declare type ClassNameProps = {
    className?: string;
    children?: JSX.Element;
};

/** @public */
export declare type ClassNameResolveOptions = {
    unknownClass?: ClassNameUnknownBehavior;
    onDiagnostic?: (diagnostic: ClassNameDiagnostic) => void;
};

/** @public */
export declare type ClassNameResolveResult = {
    props: VexartStyleProps;
    diagnostics: ClassNameDiagnostic[];
};

/** @public */
export declare type ClassNameUnknownBehavior = (typeof CLASS_NAME_UNKNOWN_BEHAVIOR)[keyof typeof CLASS_NAME_UNKNOWN_BEHAVIOR];

/** @public */
export declare type CliResult = {
    code: number;
    output: string;
};

/** @public */
export declare function Code(props: CodeProps): JSX.Element;

/** @public */
export declare type CodeProps = {
    content: string;
    language: string;
    syntaxStyle: SyntaxStyle;
    width?: number | string;
    height?: number | string;
    /** Visual theme — all styling comes from here. */
    theme?: Partial<CodeTheme>;
    lineNumbers?: boolean;
    streaming?: boolean;
};

/** @public */
export declare type CodeTheme = {
    /** Background color. */
    bg: string | number;
    /** Line number foreground color. */
    lineNumberFg: string | number;
    /** Corner radius. */
    radius: number;
    /** Inner padding. */
    padding: number;
};

/** @public */
export declare const colors: {
    readonly background: "#0a0a0a";
    readonly foreground: "#fafafa";
    readonly card: "#171717";
    readonly cardForeground: "#fafafa";
    readonly popover: "#171717";
    readonly popoverForeground: "#fafafa";
    readonly primary: "#e5e5e5";
    readonly primaryForeground: "#171717";
    readonly secondary: "#262626";
    readonly secondaryForeground: "#fafafa";
    readonly muted: "#262626";
    readonly mutedForeground: "#a3a3a3";
    readonly accent: "#262626";
    readonly accentForeground: "#fafafa";
    readonly destructive: "#dc2626";
    readonly destructiveForeground: "#fafafa";
    readonly border: "#ffffff25";
    readonly input: "#ffffff40";
    readonly ring: "#737373";
    readonly ringSubtle: "#73737380";
    readonly transparent: "#00000000";
};

/** Color token map — keys match the default void tokens, values are hex strings. */
/** @public */
export declare type ColorTokens = {
    [K in keyof typeof colors]: string;
};

/** @public */
export declare function Combobox(props: ComboboxProps): JSX.Element;

/** @public */
export declare type ComboboxInputContext = {
    /** Current text in the input. */
    inputValue: string;
    /** Placeholder text. */
    placeholder: string;
    /** Whether the dropdown is open. */
    open: boolean;
    /** Whether the input is focused. */
    focused: boolean;
    /** Whether the combobox is disabled. */
    disabled: boolean;
    /** Currently selected label. */
    selectedLabel: string | undefined;
};

/** @public */
export declare type ComboboxOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

/** @public */
export declare type ComboboxOptionContext = {
    /** Whether this option is highlighted via keyboard. */
    highlighted: boolean;
    /** Whether this option is the selected value. */
    selected: boolean;
    /** Whether this option is disabled. */
    disabled: boolean;
};

/** @public */
export declare type ComboboxProps = {
    /** Currently selected value. */
    value?: string;
    /** Called when a value is selected. */
    onChange?: (value: string) => void;
    /** All available options (filtering happens internally). */
    options: ComboboxOption[];
    /** Placeholder when no value. */
    placeholder?: string;
    /** Disabled state. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Custom filter function. Default: case-insensitive label contains. */
    filter?: (option: ComboboxOption, query: string) => boolean;
    /** Render the input area. */
    renderInput: (ctx: ComboboxInputContext) => JSX.Element;
    /** Render each option. */
    renderOption: (option: ComboboxOption, ctx: ComboboxOptionContext) => JSX.Element;
    /** Render the dropdown container. */
    renderContent?: (children: JSX.Element) => JSX.Element;
    /** Render empty state when no options match. */
    renderEmpty?: () => JSX.Element;
};

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
declare type CompositorProperty = "transform" | "opacity";

/** @public */
export declare function createApp(component: () => JSX.Element, options?: CreateAppOptions): Promise<AppContext>;

/** @public */
export declare type CreateAppOptions = {
    /** Keys that trigger app exit. Default: ["ctrl+c"] */
    quit?: string[];
    /** Engine mount options (maxFps, experimental, etc.) */
    mount?: MountOptions;
    /** Called when app is mounted and running */
    onReady?: (ctx: AppContext) => void;
    /** Called on unhandled error. Default: console.error + process.exit(1) */
    onError?: (error: Error) => void;
};

/** @public */
export declare function createAppRouter(routes: AppRouteDefinition[], initialPath?: string, options?: CreateAppRouterOptions): AppRouter;

/** @public */
export declare type CreateAppRouterOptions = {
    defaultFocusId?: string | null;
    restoreFocus?: boolean;
    onFocus?: AppRouterFocusRestorer;
};

/** @public */
export declare const createComponent: <T>(Comp: (props: T) => TGENode, props: T) => TGENode;

export { createContext }

export { createEffect }

/** Options for creating an extmark */
/** @public */
declare type CreateExtmarkOptions = Omit<Extmark, "id">;

/** @public */
export declare function createForm<T extends Record<string, any>>(options: FormOptions<T>): FormHandle<T>;

/** @public */
export declare function createHandle(node: TGENode): NodeHandle;

export { createMemo }

/** @public */
export declare function createScrollHandle(scrollId: string): ScrollHandle;

export { createSignal }

/** @public */
export declare function createSpring(initial: number, config?: SpringConfig): [() => number, (target: number) => void];

/**
 * Create a theme definition from partial overrides.
 * Overrides are merged with the default void tokens.
 */
/** @public */
export declare function createTheme(overrides?: ThemeDefinition): Required<ThemeDefinition>;

/** @public */
export declare function createToaster(options: ToasterOptions): ToasterHandle;

/** @public */
export declare function createTransition(initial: number, config?: TransitionConfig): [() => number, (target: number) => void];

/** @public */
export declare function createVoidToaster(options?: VoidToasterOptions): ToasterHandle;

/** @public */
declare type DamageRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** @public */
export declare const darkTheme: Required<ThemeDefinition>;

/**
 * Decode paste bytes to string — normalizes line endings.
 */
/** @public */
export declare function decodePasteBytes(bytes: Uint8Array | string): string;

/** @public */
export declare function defineConfig(config: VexartAppConfig): VexartAppConfig;

/** @public */
export declare const Dialog: typeof DialogRoot & {
    Overlay: typeof DialogOverlay;
    Content: typeof DialogContent;
    Close: typeof DialogClose;
};

/** @public Wrapper for a child element that closes the dialog when activated. */
export declare function DialogClose(props: DialogCloseProps): JSX;

/** @public */
export declare type DialogCloseProps = {
    /** Element that closes the dialog when activated. */
    children?: any;
};

/** @public The dialog panel that contains the content. */
export declare function DialogContent(props: DialogContentProps): JSX;

/** @public */
export declare type DialogContentProps = {
    /** Content of the dialog panel. */
    children?: any;
    /** Width of the dialog. Default: "fit" */
    width?: number | string;
    /** Max width constraint. */
    maxWidth?: number;
    /** Padding inside the content area. */
    padding?: number;
    /** Corner radius. */
    cornerRadius?: number;
    /** Background color. */
    backgroundColor?: string | number;
};

/** @public */
export declare function DialogOverlay(props: DialogOverlayProps): JSX;

/** @public */
export declare type DialogOverlayProps = {
    /** Background color of the overlay. Default: none (headless). */
    backgroundColor?: string | number;
    /** Backdrop blur radius. */
    backdropBlur?: number;
    /** Called when the overlay is clicked. Default: calls Dialog's onClose. */
    onClick?: () => void;
    children?: any;
};

/**
 * Dialog — headless modal dialog primitive.
 *
 * Provides focus scoping, overlay/content composition, and close behavior.
 *
 * @public
 */
/** @public */
export declare type DialogProps = {
    /** Dialog content. Should contain Dialog.Overlay and/or Dialog.Content. */
    children?: any;
    /** Called when the dialog should close (Escape key or overlay click). */
    onClose?: () => void;
};

declare function DialogRoot(props: DialogProps): JSX;

/** @public */
export declare function Diff(props: DiffProps): JSX.Element;

/** @public */
export declare type DiffProps = {
    diff: string;
    showLineNumbers?: boolean;
    width?: number | string;
    /** Visual theme — all styling comes from here. */
    theme?: Partial<DiffTheme>;
};

/** @public */
export declare type DiffTheme = {
    /** Default text color. */
    fg: string | number;
    /** Muted text color (empty sign column). */
    muted: string | number;
    /** Container background. */
    bg: string | number;
    /** Container corner radius. */
    radius: number;
    /** Added line background. */
    addedBg: string | number;
    /** Removed line background. */
    removedBg: string | number;
    /** Context line background. */
    contextBg: string | number;
    /** Added sign (+) color. */
    addedSign: string | number;
    /** Removed sign (-) color. */
    removedSign: string | number;
    /** Line number foreground. */
    lineNumberFg: string | number;
    /** Line number background. */
    lineNumberBg: string | number;
    /** Hunk header background. */
    headerBg: string | number;
    /** Hunk header foreground. */
    headerFg: string | number;
    /** Horizontal padding for lines. */
    linePadding: number;
};

/** @public */
declare const DIRTY_KIND: {
    readonly FULL: "full";
    readonly INTERACTION: "interaction";
    readonly NODE_VISUAL: "node-visual";
};

/** @public */
declare type DirtyKind = (typeof DIRTY_KIND)[keyof typeof DIRTY_KIND];

/** @public */
declare type DirtyScope = {
    kind: DirtyKind;
    nodeId?: number;
    rect?: DamageRect;
};

/** @public */
export declare function discoverAppRoutes(options?: RouteManifestOptions): Promise<FileSystemRouteManifest>;

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
declare type DrawCmd = LineCmd | BezierCmd | CircleCmd | RectCmd | PolygonCmd | TextCmd | GlowCmd | ImageCmd | RadialGradientCmd | LinearGradientCmd | NebulaCmd | StarfieldCmd;

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
declare type Extmark = {
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
declare class ExtmarkManager {
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
export declare type FieldState = {
    /** Current error message (undefined = valid). */
    error: () => string | undefined;
    /** Whether the field has been focused and blurred. */
    touched: () => boolean;
    /** Whether the value differs from initial. */
    dirty: () => boolean;
};

/**
 * Form validation system — reactive form state management.
 *
 * Creates reactive field state plus sync/async validation helpers.
 *
 * @public
 */
/** Validator returns error string or undefined/null for valid. */
/** @public */
export declare type FieldValidator<T> = (value: T, allValues: Record<string, any>) => string | undefined | null;

/** @public */
export declare type FileSystemRoute = {
    path: string;
    file: string;
    layouts: string[];
    loading?: string;
    error?: string;
    notFound?: string;
};

/** @public */
export declare type FileSystemRouteFile = {
    path: string;
    routePath: string;
    kind: RouteFileKind;
};

/** @public */
export declare type FileSystemRouteManifest = {
    root: string;
    appDir: string;
    routes: FileSystemRoute[];
    layouts: FileSystemRouteFile[];
    files: FileSystemRouteFile[];
};

/** @public Self-filter configuration applied to the element's own paint output. */
declare type FilterConfig = {
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

/** @public */
export declare type FocusHandle = {
    focused: () => boolean;
    focus: () => void;
    id: string;
};

/** @public */
export declare const font: {
    readonly xs: 10;
    readonly sm: 12;
    readonly base: 14;
    readonly lg: 16;
    readonly xl: 20;
    readonly "2xl": 24;
    readonly "3xl": 30;
    readonly "4xl": 36;
};

export { For }

/** @public */
export declare type FormHandle<T extends Record<string, any>> = {
    /** Reactive field values — form.values.fieldName() */
    values: {
        [K in keyof T]: () => T[K];
    };
    /** Reactive field errors — form.errors.fieldName() */
    errors: {
        [K in keyof T]: () => string | undefined;
    };
    /** Reactive field touched state — form.touched.fieldName() */
    touched: {
        [K in keyof T]: () => boolean;
    };
    /** Reactive field dirty state — form.dirty.fieldName() */
    dirty: {
        [K in keyof T]: () => boolean;
    };
    /** Set a field value. Runs sync validation if validateOnChange. */
    setValue: <K extends keyof T>(field: K, value: T[K]) => void;
    /** Set a field error manually. */
    setError: <K extends keyof T>(field: K, error: string | undefined) => void;
    /** Mark a field as touched (call on blur). Runs validation. */
    setTouched: <K extends keyof T>(field: K) => void;
    /** Whether any field has an error. */
    isValid: () => boolean;
    /** Whether the form is currently submitting. */
    submitting: () => boolean;
    /** Submit the form — validates, then calls onSubmit if valid. */
    submit: () => void;
    /** Reset to initial values, clear errors/touched/dirty. */
    reset: () => void;
    /** Get all current values as a plain object. */
    getValues: () => T;
};

/** @public */
export declare type FormOptions<T extends Record<string, any>> = {
    /** Initial values for all fields. */
    initialValues: T;
    /** Per-field sync validators. */
    validate?: {
        [K in keyof T]?: FieldValidator<T[K]>;
    };
    /** Per-field async validators (run on blur/submit). */
    validateAsync?: {
        [K in keyof T]?: AsyncFieldValidator<T[K]>;
    };
    /** Form-level validator — runs on submit after field validators. */
    validateForm?: (values: T) => Record<string, string> | undefined | null;
    /** Submit handler — only called when validation passes. */
    onSubmit: (values: T) => void | Promise<void>;
    /** Validate on every change (default: false — validate on blur/submit). */
    validateOnChange?: boolean;
};

/**
 * Get the current active theme definition (non-reactive snapshot).
 */
/** @public */
export declare function getTheme(): Required<ThemeDefinition>;

/** @public */
export declare type Glow = {
    radius: number;
    color: number;
    intensity?: number;
};

/** @public */
declare type GlowCmd = {
    kind: "glow";
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    color: number;
    intensity: number;
};

/** @public */
export declare type GlowConfig = {
    radius: number;
    color: string | number;
    intensity?: number;
};

/** @public */
export declare const glows: Record<"ring" | "destructive" | "success", Glow>;

/** @public */
export declare function H1(props: TypographyProps): JSX;

/** @public */
export declare function H2(props: TypographyProps): JSX;

/** @public */
export declare function H3(props: TypographyProps): JSX;

/** @public */
export declare function H4(props: TypographyProps): JSX;

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
declare type ImageCmd = {
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
export declare function Input(props: InputProps): JSX.Element;

/** @public */
declare type InputEvent_2 = KeyEvent | MouseEvent_2 | FocusEvent_2 | PasteEvent | ResizeEvent;

/** @public */
export declare type InputProps = {
    value: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    focusId?: string;
    /** Width. Default: "grow". */
    width?: number | string;
    /** Height. Default: auto from theme padding + line height. */
    height?: number;
    /** Visual theme for self-rendering mode. Ignored when renderInput is set. */
    theme?: Partial<InputTheme>;
    /**
     * Optional render function for fully headless mode.
     * When provided, the Input delegates ALL visuals to this function
     * and ignores the theme prop.
     */
    renderInput?: (ctx: InputRenderContext) => JSX.Element;
};

/** @public */
export declare type InputRenderContext = {
    /** Current text value. */
    value: string;
    /** Text to display (value or placeholder). */
    displayText: string;
    /** Whether showing placeholder. */
    showPlaceholder: boolean;
    /** Cursor position (character index). */
    cursor: number;
    /** Whether the cursor blink is visible. */
    blink: boolean;
    /** Whether the input is focused. */
    focused: boolean;
    /** Whether the input is disabled. */
    disabled: boolean;
    /** Selection range [start, end] or null. */
    selection: [number, number] | null;
    /** Spread on the root element — adds focusable + click-to-focus support. */
    inputProps: {
        focusable: true;
        onPress: () => void;
    };
};

/** @public */
declare type InputSubscriber = (event: InputEvent_2) => void;

/** @public */
declare type InputTheme = {
    /** Cursor / focused border accent color. */
    accent: string | number;
    /** Primary text color. */
    fg: string | number;
    /** Placeholder / muted text color. */
    muted: string | number;
    /** Background color. */
    bg: string | number;
    /** Border color when unfocused. */
    border: string | number;
    /** Corner radius. */
    radius: number;
    /** Inner padding (horizontal). */
    paddingX: number;
    /** Inner padding (vertical). */
    paddingY: number;
    /** Font size. */
    fontSize: number;
};

/** @public */
declare type InteractionBinding = "auto" | "none" | InteractionLayerState;

/** @public */
declare type InteractionLayerState = {
    ref: (handle: NodeHandle) => void;
    node: () => TGENode | null;
    mode: () => InteractionMode;
    begin: (mode?: Exclude<InteractionMode, "none">) => void;
    end: (mode?: Exclude<InteractionMode, "none">) => void;
};

/** @public */
declare type InteractionMode = "none" | "drag";

/** @public Interactive style props usable in hoverStyle, activeStyle, and focusStyle. */
declare type InteractiveStyleProps = Partial<Pick<TGEProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "borderRadius" | "shadow" | "boxShadow" | "glow" | "gradient" | "backdropBlur" | "backdropBrightness" | "backdropContrast" | "backdropSaturate" | "backdropGrayscale" | "backdropInvert" | "backdropSepia" | "backdropHueRotate" | "opacity" | "filter">>;

/** @public */
export declare const KANAGAWA: ThemeTokenStyle[];

declare const KEY_BINDING_ACTION: {
    readonly CURSOR_LEFT: "cursor-left";
    readonly CURSOR_RIGHT: "cursor-right";
    readonly CURSOR_UP: "cursor-up";
    readonly CURSOR_DOWN: "cursor-down";
    readonly LINE_START: "line-start";
    readonly LINE_END: "line-end";
    readonly BUFFER_START: "buffer-start";
    readonly BUFFER_END: "buffer-end";
    readonly PAGE_UP: "page-up";
    readonly PAGE_DOWN: "page-down";
    readonly DELETE_BACK: "delete-back";
    readonly DELETE_FORWARD: "delete-forward";
    readonly SELECT_ALL: "select-all";
    readonly NEWLINE: "newline";
    readonly SUBMIT: "submit";
};

/** @public */
export declare type KeyBinding = {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    action: KeyBindingAction;
};

/** @public */
export declare type KeyBindingAction = (typeof KEY_BINDING_ACTION)[keyof typeof KEY_BINDING_ACTION];

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
export declare function Large(props: TypographyProps): JSX;

/** @public Computed layout geometry written each frame after layout. */
declare type LayoutRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** @public */
export declare function Lead(props: TypographyProps): JSX;

/** @public */
export declare const lightTheme: Required<ThemeDefinition>;

/** @public */
declare type LinearGradientCmd = {
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
declare type LineCmd = {
    kind: "line";
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: number;
    width: number;
};

/** @public */
export declare function List(props: ListProps): JSX.Element;

/** @public */
export declare type ListItemContext = {
    selected: boolean;
    focused: boolean;
    index: number;
    /** Spread on the item element for click selection. */
    itemProps: {
        onPress: () => void;
    };
};

/** @public */
export declare type ListProps = {
    items: string[];
    selectedIndex: number;
    onSelectedChange?: (index: number) => void;
    onSelect?: (index: number) => void;
    disabled?: boolean;
    focusId?: string;
    /** Render each item. REQUIRED — no default visual. */
    renderItem: (item: string, ctx: ListItemContext) => JSX.Element;
    /** Render the list container. Default: vertical box. */
    renderList?: (children: JSX.Element) => JSX.Element;
};

/** @public */
export declare function markDirty(scope?: DirtyScope): void;

/** @public */
export declare function Markdown(props: MarkdownProps): JSX.Element;

/** @public */
export declare type MarkdownProps = {
    content: string;
    syntaxStyle: SyntaxStyle;
    /** Default text color (shorthand — overrides theme.fg). */
    color?: number;
    width?: number | string;
    streaming?: boolean;
    /** Visual theme — all styling comes from here. */
    theme?: Partial<MarkdownTheme>;
};

/** @public */
export declare type MarkdownTheme = {
    /** Default text foreground. */
    fg: string | number;
    /** Muted/dim text (html fallback, etc). */
    muted: string | number;
    /** Heading color. */
    heading: string | number;
    /** Link color. */
    link: string | number;
    /** Bold text color. */
    bold: string | number;
    /** Italic text color. */
    italic: string | number;
    /** Inline code foreground. */
    codeFg: string | number;
    /** Inline code background. */
    codeBg: string | number;
    /** Code block theme (passed through to Code component). */
    codeBlockBg: string | number;
    /** Blockquote left border color. */
    blockquoteBorder: string | number;
    /** List bullet/number color. */
    listBullet: string | number;
    /** Table header background. */
    tableBg: string | number;
    /** Table header text color. */
    tableHeader: string | number;
    /** Horizontal rule color. */
    hrColor: string | number;
    /** Strikethrough text color. */
    del: string | number;
};

export { Match }

/** @public */
export declare function matchRoute(routes: AppRouteDefinition[], path: string): AppRouteMatch | null;

/** @public */
export declare const memo: <T>(fn: () => T, equal: boolean) => () => T;

/** @public */
export declare function mergeClassNameProps<T extends Record<string, unknown>>(props: T, className?: string | null): T & VexartStyleProps;

/** @public */
export declare function mergeConfig(config?: VexartAppConfig): Required<VexartAppConfig>;

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
export declare function mountApp(component: () => JSX.Element, options?: MountAppOptions): Promise<MountHandle>;

/** @public */
export declare type MountAppOptions = {
    terminal?: Terminal;
    mount?: MountOptions;
};

/** @public */
declare type MountHandle = {
    suspend: () => void;
    resume: () => void;
    suspended: () => boolean;
    destroy: () => void;
};

/** @public */
declare type MountOptions = {
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
declare type MouseAction = "press" | "release" | "move" | "scroll";

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
export declare function Muted(props: TypographyProps): JSX;

/** @public */
export declare type NavigationOptions = {
    replace?: boolean;
    focusId?: string | null;
};

/** @public */
declare type NebulaCmd = {
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
export declare function normalizePath(path: string): string;

export { onCleanup }

/** @public */
export declare const ONE_DARK: ThemeTokenStyle[];

/** @public */
export declare function onInput(handler: InputSubscriber): () => void;

export { onMount }

/**
 * OverlayRoot — attach visual content to the root overlay plane.
 *
 * @public
 */
export declare function OverlayRoot(props: OverlayRootProps): JSX.Element;

/** @public */
export declare type OverlayRootProps = {
    children?: JSX.Element;
    zIndex?: number;
};

/** @public */
export declare function P(props: TypographyProps): JSX;

/** @public */
export declare function Page(props: PageProps): JSX.Element;

/** @public */
export declare type PageProps = AppBoxProps & {
    children?: JSX.Element;
};

/** @public */
declare type PasteEvent = {
    type: "paste";
    text: string;
};

/** @public */
declare type PolygonCmd = {
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
export declare function Popover(props: PopoverProps): JSX.Element;

/** @public */
export declare type PopoverProps = {
    /** Controlled open state. */
    open: boolean;
    /** Called when open state should change. */
    onOpenChange: (open: boolean) => void;
    /** Render the trigger element. */
    renderTrigger: (ctx: PopoverTriggerContext) => JSX.Element;
    /** Render the popover content (only when open). */
    renderContent: () => JSX.Element;
    /** Placement. Default: "bottom". */
    placement?: "top" | "bottom" | "left" | "right";
    /** Offset from trigger. Default: 4. */
    offset?: number;
};

/**
 * Popover — truly headless popover primitive.
 *
 * Similar to `Tooltip`, but intended for interactive content.
 *
 * @public
 */
/** @public */
export declare type PopoverTriggerContext = {
    open: boolean;
    toggle: () => void;
};

/** @public */
export declare function Portal(props: PortalProps): JSX.Element;

/** @public */
export declare type PortalProps = {
    children?: JSX.Element;
};

/** @public Event passed to onPress handlers. Supports stopPropagation like DOM events. */
export declare type PressEvent = {
    /** Prevent the event from bubbling to parent nodes. */
    stopPropagation: () => void;
    /** Whether stopPropagation() was called. */
    readonly propagationStopped: boolean;
};

/** @public */
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;

/** @public */
export declare type ProgressBarProps = {
    value: number;
    max?: number;
    width?: number;
    height?: number;
    /** Render function — receives computed values, returns visual. */
    renderBar: (ctx: ProgressBarRenderContext) => JSX.Element;
};

/** @public */
export declare type ProgressBarRenderContext = {
    /** Value between 0 and 1. */
    ratio: number;
    /** Computed fill width in px. */
    fillWidth: number;
    /** Total bar width in px. */
    width: number;
    /** Bar height in px. */
    height: number;
    /** Raw value. */
    value: number;
    /** Max value. */
    max: number;
};

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
declare type RadialGradientCmd = {
    kind: "radialGradient";
    cx: number;
    cy: number;
    radius: number;
    from: number;
    to: number;
};

/** @public */
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;

/** @public */
export declare type RadioGroupProps = {
    /** Currently selected value. */
    value?: string;
    /** Called with the new value when selection changes. */
    onChange?: (value: string) => void;
    /** List of radio options. */
    options: RadioOption[];
    /** Disabled — entire group is not focusable. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Render each option. Receives the option + context. */
    renderOption: (option: RadioOption, ctx: RadioOptionContext) => JSX.Element;
    /** Render the container wrapping all options. Default: column box. */
    renderGroup?: (children: JSX.Element) => JSX.Element;
};

/** @public */
export declare type RadioOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

/** @public */
export declare type RadioOptionContext = {
    /** Whether this option is currently selected. */
    selected: boolean;
    /** Whether this specific option is focused (selected + group focused). */
    focused: boolean;
    /** Whether this option is disabled. */
    disabled: boolean;
    /** Index of this option. */
    index: number;
    /** Spread on the option element for click selection. */
    optionProps: {
        onPress: () => void;
    };
};

/** @public */
export declare const radius: {
    readonly sm: number;
    readonly md: number;
    readonly lg: 10;
    readonly xl: number;
    readonly xxl: number;
    readonly full: 9999;
};

/** @public */
declare type RectCmd = {
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
export declare function releasePointerCapture(nodeId: number): void;

/** @public */
declare type ResizeEvent = {
    type: "resize";
};

/** @public */
declare type ResizeHandler = (size: TerminalSize) => void;

/** @public */
export declare function resolveClassName(className: string | undefined | null, options?: ClassNameResolveOptions): ClassNameResolveResult;

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
 * RichText — wraps children <Span> elements in a horizontal row.
 * Flexily will lay them out left-to-right within the container width.
 */
/** @public */
export declare function RichText(props: RichTextProps): JSX.Element;

/** @public */
export declare type RichTextProps = {
    maxWidth?: number;
    lineHeight?: number;
    children?: JSX.Element;
};

/** @public */
export declare const ROUTE_FILE_KIND: {
    readonly PAGE: "page";
    readonly LAYOUT: "layout";
    readonly LOADING: "loading";
    readonly ERROR: "error";
    readonly NOT_FOUND: "not-found";
};

/** @public */
export declare const ROUTE_FOCUS_ID = "vexart-route-root";

/** @public */
export declare type RouteComponent = (props: {
    params: RouteParams;
}) => JSX.Element;

/** @public */
export declare type RouteErrorComponent = (props: {
    error: unknown;
    params: RouteParams;
}) => JSX.Element;

/** @public */
export declare type RouteFileKind = (typeof ROUTE_FILE_KIND)[keyof typeof ROUTE_FILE_KIND];

/** @public */
export declare function routeFilePathToRoutePath(file: string, options?: RouteManifestOptions): string;

/** @public */
export declare type RouteLayoutComponent = (props: {
    children: JSX.Element;
    params: RouteParams;
}) => JSX.Element;

/** @public */
export declare type RouteManifestOptions = {
    root?: string;
    appDir?: string;
};

/** @public */
export declare function RouteOutlet(props: RouteOutletProps): () => JSX.Element;

/** @public */
export declare type RouteOutletProps = {
    router?: AppRouter;
    notFound?: RouteComponent;
};

/** @public */
export declare type RouteParams = Record<string, string>;

/** @public */
export declare function RouterProvider(props: AppRouterProviderProps): JSX.Element;

/** @public */
export declare function runCli(argv?: string[]): Promise<CliResult>;

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
declare type ScrollHandle = {
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
export declare function ScrollView(props: ScrollViewProps): JSX.Element;

/** @public */
export declare type ScrollViewProps = {
    /** Ref callback — receives a ScrollHandle for programmatic control. */
    ref?: (handle: ScrollHandle) => void;
    width?: number | string;
    height?: number | string;
    scrollX?: boolean;
    scrollY?: boolean;
    scrollSpeed?: number;
    /** Show scrollbar. Default: true (auto-hides when content fits). */
    showScrollbar?: boolean;
    backgroundColor?: string | number;
    cornerRadius?: number;
    borderColor?: string | number;
    borderWidth?: number;
    direction?: "row" | "column";
    padding?: number;
    paddingX?: number;
    paddingY?: number;
    gap?: number;
    alignX?: "left" | "right" | "center";
    alignY?: "top" | "bottom" | "center";
    children?: JSX.Element;
};

/** @public */
export declare const Select: typeof SelectRoot & {
    Trigger: typeof SelectTrigger;
    Content: typeof SelectContent;
    Item: typeof SelectItem;
};

/** @public */
export declare function SelectContent(props: SelectContentProps): JSX.Element;

/** @public */
export declare type SelectContentProps = {
    children?: JSX.Element;
};

/** @public */
export declare function SelectItem(props: SelectItemProps): JSX.Element;

/** @public */
export declare type SelectItemProps = {
    value: string;
    disabled?: boolean;
    children?: JSX.Element;
};

/** @public */
export declare type SelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

/** @public */
export declare type SelectOptionContext = {
    /** Whether this option is currently highlighted via keyboard. */
    highlighted: boolean;
    /** Whether this option is the selected value. */
    selected: boolean;
    /** Whether this option is disabled. */
    disabled: boolean;
};

/** @public */
export declare type SelectProps = {
    /** Currently selected value. */
    value?: string;
    /** Called with the new value when an option is selected. */
    onChange?: (value: string) => void;
    /** Options list. */
    options?: SelectOption[];
    /** Placeholder text when no value is selected. */
    placeholder?: string;
    /** Disabled state — not focusable. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Render the trigger element. Receives context about current state. */
    renderTrigger?: (ctx: SelectTriggerContext) => JSX.Element;
    /** Render each option. Receives the option + context. */
    renderOption?: (option: SelectOption, ctx: SelectOptionContext) => JSX.Element;
    /** Render the dropdown container wrapping options. Default: just children. */
    renderContent?: (children: JSX.Element) => JSX.Element;
    /** Children — for compound component pattern (advanced). */
    children?: JSX.Element;
};

declare function SelectRoot(props: SelectProps): JSX.Element;

/** @public */
export declare function SelectTrigger(props: SelectTriggerProps): JSX.Element;

/** @public */
export declare type SelectTriggerContext = {
    /** Currently selected label (or undefined). */
    selectedLabel: string | undefined;
    /** Placeholder text. */
    placeholder: string;
    /** Whether the dropdown is open. */
    open: boolean;
    /** Whether this element is focused. */
    focused: boolean;
    /** Whether the select is disabled. */
    disabled: boolean;
};

/** @public */
export declare type SelectTriggerProps = {
    children?: JSX.Element;
};

/** @public */
export declare function Separator(props: SeparatorProps): JSX;

/**
 * Separator — styled visual divider.
 *
 * @public
 */
/** @public */
export declare interface SeparatorProps {
    orientation?: "horizontal" | "vertical";
}

/** @public */
export declare function setFocus(id: string): void;

/** @public */
export declare function setPointerCapture(nodeId: number): void;

/**
 * Switch the active theme at runtime.
 * Updates all reactive color signals — only subscribed components re-render.
 */
/** @public */
export declare function setTheme(theme: Required<ThemeDefinition>): void;

/** @public */
export declare type Shadow = {
    x: number;
    y: number;
    blur: number;
    color: number;
};

/** @public */
export declare type ShadowConfig = {
    x: number;
    y: number;
    blur: number;
    color: string | number;
};

/** @public */
export declare const shadows: Record<"xs" | "sm" | "md" | "lg" | "xl", Shadow[]>;

/** @public */
declare type ShapeStyle = {
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
export declare type SimpleThemeRules = Record<string, string | number>;

/** @public */
declare type SizingInfo = {
    type: number;
    value: number;
};

/** @public */
export declare function Skeleton(props: SkeletonProps): JSX;

/**
 * Skeleton — styled loading placeholder.
 *
 * @public
 */
/** @public */
export declare interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    cornerRadius?: number;
}

/** @public */
export declare function Slider(props: SliderProps): JSX.Element;

/** @public */
export declare type SliderProps = {
    /** Current value. */
    value: number;
    /** Called when value changes. */
    onChange: (value: number) => void;
    /** Minimum value. Default: 0. */
    min?: number;
    /** Maximum value. Default: 100. */
    max?: number;
    /** Step increment. Default: 1. */
    step?: number;
    /** Large step (Page Up/Down). Default: step * 10. */
    largeStep?: number;
    /** Disabled state. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Render function. */
    renderSlider: (ctx: SliderRenderContext) => JSX.Element;
};

/** @public */
export declare type SliderRenderContext = {
    /** Current value. */
    value: number;
    /** Min value. */
    min: number;
    /** Max value. */
    max: number;
    /** Value as percentage 0-100. */
    percentage: number;
    /** Whether the slider is focused. */
    focused: boolean;
    /** Whether the slider is disabled. */
    disabled: boolean;
    /** Whether the user is currently dragging the slider. */
    dragging: boolean;
    /** Spread these props on the track element for mouse interaction. */
    trackProps: SliderTrackProps;
};

/** @public */
export declare type SliderTrackProps = {
    ref: (handle: any) => void;
    onMouseDown: (evt: NodeMouseEvent) => void;
    onMouseMove: (evt: NodeMouseEvent) => void;
    onMouseUp: (evt: NodeMouseEvent) => void;
    focusable: true;
};

/** @public */
export declare function Small(props: TypographyProps): JSX;

/** @public */
export declare const space: {
    readonly px: 1;
    readonly 0.5: 2;
    readonly 1: 4;
    readonly 1.5: 6;
    readonly 2: 8;
    readonly 2.5: 10;
    readonly 3: 12;
    readonly 3.5: 14;
    readonly 4: 16;
    readonly 5: 20;
    readonly 6: 24;
    readonly 7: 28;
    readonly 8: 32;
    readonly 9: 36;
    readonly 10: 40;
};

/**
 * Span — inline text fragment. Rendered as a <text> node.
 * Can be used inside RichText or standalone.
 */
/** @public */
export declare function Span(props: SpanProps): JSX.Element;

/** @public */
export declare type SpanProps = {
    color?: string | number;
    fontSize?: number;
    fontId?: number;
    fontWeight?: number;
    fontStyle?: "normal" | "italic";
    children?: JSX.Element;
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
declare type StarfieldCmd = {
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
declare type StrokeStyle = {
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
export declare type SwitchProps = {
    /** Whether the switch is on. */
    checked: boolean;
    /** Called with the new value when toggled. */
    onChange?: (checked: boolean) => void;
    /** Disabled state. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Render function — receives state, returns visual. */
    renderSwitch: (ctx: SwitchRenderContext) => JSX.Element;
};

/** @public */
export declare type SwitchRenderContext = {
    checked: boolean;
    focused: boolean;
    disabled: boolean;
    /** Spread on the root element for click toggle + keyboard + focus. */
    toggleProps: {
        focusable: true;
        onPress: () => void;
    };
};

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
export declare type TabItem = {
    label: string;
    content: () => JSX.Element;
};

/** @public */
export declare function Table(props: TableProps): JSX.Element;

/** @public */
export declare type TableCellContext = {
    selected: boolean;
    focused: boolean;
    rowIndex: number;
    /** Spread on the row element for click selection. */
    rowProps: {
        onPress: () => void;
    };
};

/** @public */
export declare type TableColumn = {
    key: string;
    header: string;
    width?: number | "grow";
    align?: "left" | "center" | "right";
};

/** @public */
export declare type TableProps = {
    columns: TableColumn[];
    data: Record<string, any>[];
    selectedRow?: number;
    onSelectedRowChange?: (index: number) => void;
    onRowSelect?: (index: number, row: Record<string, any>) => void;
    showHeader?: boolean;
    disabled?: boolean;
    focusId?: string;
    /** Render a header cell. If not provided, header is not rendered. */
    renderHeader?: (column: TableColumn) => JSX.Element;
    /** Render a data cell. REQUIRED — no default visual. */
    renderCell: (value: any, column: TableColumn, rowIndex: number, ctx: TableCellContext) => JSX.Element;
    /** Render a row container. Default: horizontal box. */
    renderRow?: (children: JSX.Element, rowIndex: number, ctx: TableCellContext) => JSX.Element;
    /** Render the table container. Default: vertical box. */
    renderTable?: (children: JSX.Element) => JSX.Element;
};

/** @public */
export declare type TabRenderContext = {
    active: boolean;
    focused: boolean;
    index: number;
    /** Spread on the tab header element for click-to-switch. */
    tabProps: {
        onPress: () => void;
    };
};

/** @public */
export declare function Tabs(props: TabsProps): JSX.Element;

/** @public */
export declare type TabsProps = {
    activeTab: number;
    onTabChange?: (index: number) => void;
    tabs: TabItem[];
    focusId?: string;
    /** Render each tab header. REQUIRED — no default visual. */
    renderTab: (tab: TabItem, ctx: TabRenderContext) => JSX.Element;
    /** Render the tab header bar container. Default: horizontal box. */
    renderTabBar?: (children: JSX.Element) => JSX.Element;
    /** Render the active panel container. Default: just the content. */
    renderPanel?: (content: JSX.Element) => JSX.Element;
    /** Render the entire tabs container. Default: vertical box. */
    renderContainer?: (tabBar: JSX.Element, panel: JSX.Element) => JSX.Element;
};

/** @public */
export declare type TabsVariant = "default" | "line";

/** @public */
declare type Terminal = {
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
declare type TerminalKind = "ghostty" | "kitty" | "wezterm" | "iterm2" | "alacritty" | "foot" | "contour" | "xterm" | "unknown";

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
declare type TerminalSize = {
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
declare function Text_2(props: AppTextProps): JSX.Element;
export { Text_2 as Text }

/** @public */
export declare function Textarea(props: TextareaProps): JSX.Element;

/** @public */
export declare type TextareaHandle = {
    /** Full text content */
    readonly plainText: string;
    /** Absolute cursor offset (char index from start) */
    readonly cursorOffset: number;
    /** Cursor row (0-indexed) */
    readonly cursorRow: number;
    /** Cursor column (0-indexed) */
    readonly cursorCol: number;
    /** Visual cursor with offset, row, col */
    readonly visualCursor: VisualCursor;
    /** Replace all text */
    setText: (text: string) => void;
    /** Insert text at current cursor position */
    insertText: (text: string) => void;
    /** Clear all text */
    clear: () => void;
    /** Get text in a range [start, end) */
    getTextRange: (start: number, end: number) => string;
    /** Move cursor to end of buffer */
    gotoBufferEnd: () => void;
    /** Move cursor to end of current line */
    gotoLineEnd: () => void;
    /** Focus the textarea */
    focus: () => void;
    /** Remove focus from the textarea */
    blur: () => void;
    /** Cursor color used to render the caret. */
    get cursorColor(): string | number;
    set cursorColor(color: string | number);
    /** Access the extmarks manager for this textarea */
    readonly extmarks: ExtmarkManager;
};

/** @public */
export declare type TextareaProps = {
    /** Ref callback — receives a TextareaHandle for imperative control. */
    ref?: (handle: TextareaHandle) => void;
    /** Current text value (multi-line string). */
    value: string;
    /** Called with the new value on every edit. */
    onChange?: (value: string) => void;
    /** Called on Ctrl+Enter (submit). */
    onSubmit?: (value: string) => void;
    /** Called when the cursor moves. */
    onCursorChange?: (row: number, col: number) => void;
    /**
     * Called on every key event BEFORE internal handling.
     * Return nothing to let default handling proceed.
     * The handler can call event-specific logic or preventDefault-style
     * by consuming the event in onChange.
     */
    onKeyDown?: (event: KeyEvent) => void;
    /** Called on paste events. */
    onPaste?: (text: string) => void;
    /** Placeholder text shown when value is empty. */
    placeholder?: string;
    /** Width in pixels. Default: 400. */
    width?: number;
    /** Height in pixels. Default: 200. */
    height?: number;
    /** Accent color for the focused border and cursor. */
    color?: number;
    /** Disabled state. */
    disabled?: boolean;
    /** Focus ID override. */
    focusId?: string;
    /** Custom key bindings — merged with defaults. */
    keyBindings?: KeyBinding[];
    /** Syntax highlighting style. When set, enables per-token coloring. */
    syntaxStyle?: SyntaxStyle;
    /** Language for syntax highlighting (e.g. "typescript"). Required with syntaxStyle. */
    language?: string;
    /** Visual theme — all styling comes from here. */
    theme?: Partial<TextareaTheme>;
};

/** @public */
export declare type TextareaTheme = {
    /** Accent color (cursor, focused border). */
    accent: string | number;
    /** Primary text color. */
    fg: string | number;
    /** Muted text color (placeholder, ghost text). */
    muted: string | number;
    /** Background when enabled. */
    bg: string | number;
    /** Background when disabled. */
    disabledBg: string | number;
    /** Border color when unfocused. */
    border: string | number;
    /** Corner radius. */
    radius: number;
    /** Inner padding. */
    padding: number;
};

/** @public */
declare type TextCmd = {
    kind: "text";
    x: number;
    y: number;
    text: string;
    color: number;
};

/** @public */
declare type TGENode = {
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
declare type TGENodeKind = "box" | "text" | "img" | "canvas" | "root";

/** @public */
declare type TGEProps = {
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
export declare const theme: {
    readonly colors: {
        readonly background: "#0a0a0a";
        readonly foreground: "#fafafa";
        readonly card: "#171717";
        readonly cardForeground: "#fafafa";
        readonly popover: "#171717";
        readonly popoverForeground: "#fafafa";
        readonly primary: "#e5e5e5";
        readonly primaryForeground: "#171717";
        readonly secondary: "#262626";
        readonly secondaryForeground: "#fafafa";
        readonly muted: "#262626";
        readonly mutedForeground: "#a3a3a3";
        readonly accent: "#262626";
        readonly accentForeground: "#fafafa";
        readonly destructive: "#dc2626";
        readonly destructiveForeground: "#fafafa";
        readonly border: "#ffffff25";
        readonly input: "#ffffff40";
        readonly ring: "#737373";
        readonly ringSubtle: "#73737380";
        readonly transparent: "#00000000";
    };
    readonly radius: {
        readonly sm: number;
        readonly md: number;
        readonly lg: 10;
        readonly xl: number;
        readonly xxl: number;
        readonly full: 9999;
    };
    readonly space: {
        readonly px: 1;
        readonly 0.5: 2;
        readonly 1: 4;
        readonly 1.5: 6;
        readonly 2: 8;
        readonly 2.5: 10;
        readonly 3: 12;
        readonly 3.5: 14;
        readonly 4: 16;
        readonly 5: 20;
        readonly 6: 24;
        readonly 7: 28;
        readonly 8: 32;
        readonly 9: 36;
        readonly 10: 40;
    };
    readonly font: {
        readonly xs: 10;
        readonly sm: 12;
        readonly base: 14;
        readonly lg: 16;
        readonly xl: 20;
        readonly "2xl": 24;
        readonly "3xl": 30;
        readonly "4xl": 36;
    };
    readonly weight: {
        readonly normal: 400;
        readonly medium: 500;
        readonly semibold: 600;
        readonly bold: 700;
    };
    readonly shadows: Record<"xs" | "sm" | "md" | "lg" | "xl", Shadow[]>;
    readonly glows: Record<"ring" | "destructive" | "success", Glow>;
};

/** @public */
export declare const themeColors: ColorTokens;

/** @public */
export declare type ThemeDefinition = {
    colors: Partial<ColorTokens>;
};

/**
 * ThemeProvider component — provides theme context to children.
 * For most apps, the global setTheme() is sufficient.
 * Use ThemeProvider only if you need nested/different themes in subtrees.
 */
/** @public */
export declare function ThemeProvider(props: {
    theme?: Required<ThemeDefinition>;
    children?: JSX.Element;
}): JSX.Element;

/** @public */
declare type ThemeTokenStyle = {
    scope: string[];
    style: {
        foreground?: string | number;
        background?: string | number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
    };
};

/** @public */
export declare type ToastData = {
    id: number;
    message: string;
    variant: ToastVariant;
    duration: number;
    description?: string;
};

/** @public */
export declare type ToasterHandle = {
    toast: (input: ToastInput) => number;
    dismiss: (id: number) => void;
    dismissAll: () => void;
    Toaster: () => JSX.Element;
};

/** @public */
export declare type ToasterOptions = {
    /** Position on screen. Default: "bottom-right". */
    position?: ToastPosition;
    /** Max visible toasts. Default: 5. */
    maxVisible?: number;
    /** Default duration in ms. Default: 3000. */
    defaultDuration?: number;
    /** Gap between toasts in px. Default: 4. */
    gap?: number;
    /** Padding from screen edges in px. Default: 16. */
    padding?: number;
    /** Render function for each toast. REQUIRED — no default visual. */
    renderToast: (toast: ToastData, dismiss: () => void) => JSX.Element;
};

/** @public */
export declare type ToastInput = string | {
    message: string;
    variant?: ToastVariant;
    duration?: number;
    description?: string;
};

/** @public */
export declare type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

/** @public */
export declare type ToastVariant = "default" | "success" | "error" | "warning" | "info";

/** @public */
export declare function ToggleSwitch(props: SwitchProps): JSX.Element;

/** @public */
export declare function Tooltip(props: TooltipProps): JSX.Element;

/** @public */
export declare type TooltipProps = {
    /** Text content to show in the tooltip. */
    content: string;
    /** Render function for the tooltip visual. Receives the content string. */
    renderTooltip: (content: string) => JSX.Element;
    /** Trigger element(s). */
    children: JSX.Element;
    /** Delay before showing (ms). Default: 0 (instant). */
    showDelay?: number;
    /** Delay before hiding (ms). Default: 0 (instant). */
    hideDelay?: number;
    /** Whether the tooltip is disabled. */
    disabled?: boolean;
    /** Placement relative to trigger. Default: "top". */
    placement?: "top" | "bottom" | "left" | "right";
    /** Offset from trigger in pixels. Default: 4. */
    offset?: number;
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

/**
 * Typography — shadcn-compatible text presets.
 *
 * H1, H2, H3, H4, P, Lead, Large, Small, Muted
 */
/** @public */
export declare interface TypographyProps {
    children?: any;
    color?: string | number;
}

export { untrack }

/** @public */
export declare function useAppTerminal(): Terminal;

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
export declare function useKeyboard(): KeyboardState;

/** @public */
export declare function useMouse(): MouseState;

/** @public */
export declare function useMutation<T, V = void>(mutator: (variables: V) => Promise<T>, options?: MutationOptions<T, V>): MutationResult<T, V>;

/** @public */
export declare function useQuery<T>(fetcher: () => Promise<T>, options?: QueryOptions): QueryResult<T>;

/** @public */
export declare function useRouter(): AppRouter;

/** @public */
export declare function useTerminalDimensions(terminal: Terminal): {
    width: () => number;
    height: () => number;
    cols: () => number;
    rows: () => number;
    cellWidth: () => number;
    cellHeight: () => number;
};

/**
 * Access the current theme context (reactive).
 */
/** @public */
export declare function useTheme(): {
    colors: ColorTokens;
    setTheme: (theme: Required<ThemeDefinition>) => void;
};

/** @public */
export declare type VexartAppConfig = {
    app?: VexartAppConfigApp;
    theme?: VexartAppConfigTheme;
    styles?: VexartAppConfigStyles;
    terminal?: VexartAppConfigTerminal;
};

/** @public */
export declare type VexartAppConfigApp = {
    name?: string;
    defaultRoute?: string;
};

/** @public */
export declare type VexartAppConfigStyles = {
    className?: boolean;
    unknownClass?: ClassNameUnknownBehavior;
};

/** @public */
export declare type VexartAppConfigTerminal = {
    minColumns?: number;
    minRows?: number;
};

/** @public */
export declare type VexartAppConfigTheme = {
    preset?: "void" | string;
};

/** @public */
export declare type VexartStyleProps = Partial<TGEProps>;

/** @public */
declare type Viewport = {
    x: number;
    y: number;
    zoom: number;
};

/** @public */
export declare function VirtualList<T>(props: VirtualListProps<T>): JSX.Element;

/** @public */
export declare type VirtualListItemContext = {
    /** Whether this item is selected (for single-select mode). */
    selected: boolean;
    /** Whether this item is highlighted via keyboard. */
    highlighted: boolean;
    /** Whether the mouse is hovering this item. */
    hovered: boolean;
    /** Absolute index in the full list. */
    index: number;
};

/** @public */
export declare type VirtualListProps<T> = {
    /** Full list of items. */
    items: T[];
    /** Fixed height per item in pixels. */
    itemHeight: number;
    /**
     * Visible viewport height.
     * - `number` — fixed pixel height.
     * - `"grow"` / `"100%"` / other string — fills available space.
     *   The actual pixel height is read from the scroll handle's
     *   viewportHeight after the first layout pass.
     */
    height: number | string;
    /** Width. Default: "grow". */
    width?: number | string;
    /** Extra items to render above/below viewport. Default: 5. */
    overscan?: number;
    /** Render each visible item. */
    renderItem: (item: T, index: number, ctx: VirtualListItemContext) => JSX.Element;
    /** Currently selected index (-1 = none). */
    selectedIndex?: number;
    /** Called when selection changes. */
    onSelect?: (index: number) => void;
    /** Keyboard navigation. Default: true. */
    keyboard?: boolean;
    /** Focus ID override. */
    focusId?: string;
};

/** @public */
export declare type VisualCursor = {
    /** Absolute offset from buffer start */
    readonly offset: number;
    /** Row (0-indexed) */
    readonly row: number;
    /** Column (0-indexed) */
    readonly col: number;
};

/** @public */
export declare function VoidCheckbox(props: VoidCheckboxProps): JSX;

/**
 * VoidCheckbox — styled checkbox using Void design tokens.
 *
 * @public
 */
/** @public */
export declare type VoidCheckboxProps = {
    checked: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    focusId?: string;
};

/** @public */
export declare function VoidCombobox(props: VoidComboboxProps): JSX;

/** @public */
export declare type VoidComboboxProps = {
    value?: string;
    onChange?: (value: string) => void;
    options: ComboboxOption[];
    placeholder?: string;
    disabled?: boolean;
    focusId?: string;
    width?: number | string;
    filter?: (option: ComboboxOption, query: string) => boolean;
};

/** @public */
export declare const VoidDialog: typeof VoidDialogRoot & {
    Title: typeof VoidDialogTitle;
    Description: typeof VoidDialogDescription;
    Footer: typeof VoidDialogFooter;
};

/** @public */
export declare function VoidDialogDescription(props: VoidDialogDescriptionProps): JSX;

/** @public */
export declare type VoidDialogDescriptionProps = {
    children?: any;
};

/** @public */
export declare function VoidDialogFooter(props: VoidDialogFooterProps): JSX;

/** @public */
export declare type VoidDialogFooterProps = {
    children?: any;
};

/**
 * Dialog — styled modal dialog using Void design tokens.
 *
 * Built on top of the headless dialog primitive.
 *
 * @public
 */
/** @public */
export declare type VoidDialogProps = {
    /** Called when the dialog should close (Escape, overlay click). */
    onClose?: () => void;
    /** Width of the dialog panel. Default: 320. */
    width?: number;
    /** Max width constraint. Default: 480. */
    maxWidth?: number;
    children?: any;
};

declare function VoidDialogRoot(props: VoidDialogProps): JSX;

/** @public */
export declare function VoidDialogTitle(props: VoidDialogTitleProps): JSX;

/** @public */
export declare type VoidDialogTitleProps = {
    children?: any;
};

/** @public */
export declare const VoidDropdownMenu: typeof VoidDropdownMenuRoot & {
    Trigger: typeof VoidDropdownMenuTrigger;
    Content: typeof VoidDropdownMenuContent;
    Item: typeof VoidDropdownMenuItem;
    Separator: typeof VoidDropdownMenuSeparator;
    Label: typeof VoidDropdownMenuLabel;
};

/** @public */
export declare function VoidDropdownMenuContent(props: VoidDropdownMenuContentProps): JSX.Element;

/** @public */
export declare type VoidDropdownMenuContentProps = {
    children?: JSX.Element;
    width?: number | string;
    minWidth?: number;
    maxHeight?: number;
    sideOffset?: number;
};

/** @public */
export declare function VoidDropdownMenuItem(props: VoidDropdownMenuItemProps): JSX.Element;

/** @public */
export declare type VoidDropdownMenuItemProps = {
    onSelect?: () => void;
    variant?: "default" | "destructive";
    disabled?: boolean;
    inset?: boolean;
    children?: JSX.Element;
};

/** @public */
export declare function VoidDropdownMenuLabel(props: VoidDropdownMenuLabelProps): JSX.Element;

/** @public */
export declare type VoidDropdownMenuLabelProps = {
    children?: JSX.Element;
    inset?: boolean;
};

/** @public */
export declare type VoidDropdownMenuProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children?: JSX.Element;
};

declare function VoidDropdownMenuRoot(props: VoidDropdownMenuProps): JSX.Element;

/** @public */
export declare function VoidDropdownMenuSeparator(): JSX.Element;

/** @public */
export declare function VoidDropdownMenuTrigger(props: VoidDropdownMenuTriggerProps): JSX.Element;

/** @public */
export declare type VoidDropdownMenuTriggerProps = {
    children?: JSX.Element;
};

/** @public */
export declare function VoidInput(props: VoidInputProps): JSX;

/**
 * VoidInput — styled single-line text input using Void design tokens.
 *
 * Uses Input's self-rendering mode with a Void theme for built-in
 * cursor rendering (no manual renderInput needed).
 *
 * @public
 */
/** @public */
export declare type VoidInputProps = {
    value: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    focusId?: string;
    width?: number | string;
};

/** @public */
export declare function VoidPopover(props: VoidPopoverProps): JSX.Element;

/** @public */
export declare type VoidPopoverProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: JSX.Element;
    children: JSX.Element;
    placement?: "top" | "bottom" | "left" | "right";
    offset?: number;
    width?: number | string;
};

/** @public */
export declare function VoidProgress(props: VoidProgressProps): JSX;

/**
 * VoidProgress — styled progress bar using Void design tokens.
 *
 * @public
 */
/** @public */
export declare type VoidProgressProps = {
    value: number;
    max?: number;
    width?: number | string;
    height?: number;
};

/** @public */
export declare function VoidRadioGroup(props: VoidRadioGroupProps): JSX;

/** @public */
export declare type VoidRadioGroupProps = {
    value?: string;
    onChange?: (value: string) => void;
    options: RadioOption[];
    disabled?: boolean;
    focusId?: string;
    direction?: "column" | "row";
};

/** @public */
export declare function VoidSelect(props: VoidSelectProps): JSX;

/** @public */
export declare type VoidSelectProps = {
    value?: string;
    onChange?: (value: string) => void;
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    focusId?: string;
    width?: number | string;
    children?: any;
};

/** @public */
export declare function VoidSlider(props: VoidSliderProps): JSX;

/**
 * Slider — styled numeric range input using Void design tokens.
 *
 * @public
 */
/** @public */
export declare type VoidSliderProps = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    largeStep?: number;
    disabled?: boolean;
    focusId?: string;
    width?: number | string;
    showValue?: boolean;
};

/** @public */
export declare function VoidSwitch(props: VoidSwitchProps): JSX;

/**
 * Switch — styled toggle switch using Void design tokens.
 *
 * @public
 */
/** @public */
export declare type VoidSwitchProps = {
    checked: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    focusId?: string;
};

/** @public */
export declare function VoidTable(props: VoidTableProps): JSX.Element;

/** @public */
export declare type VoidTableProps = {
    columns: TableColumn[];
    data: Record<string, any>[];
    selectedRow?: number;
    onSelectedRowChange?: (index: number) => void;
    onRowSelect?: (index: number, row: Record<string, any>) => void;
    showHeader?: boolean;
    striped?: boolean;
    disabled?: boolean;
    focusId?: string;
};

/** @public */
export declare function VoidTabs(props: VoidTabsProps): JSX;

/** @public */
export declare type VoidTabsProps = {
    activeTab: number;
    onTabChange?: (index: number) => void;
    tabs: TabItem[];
    variant?: TabsVariant;
    focusId?: string;
};

/** @public */
export declare type VoidTheme = typeof theme;

/** @public */
export declare type VoidToasterOptions = {
    position?: ToastPosition;
    maxVisible?: number;
    defaultDuration?: number;
};

/** @public */
export declare function VoidTooltip(props: VoidTooltipProps): JSX.Element;

/** @public */
export declare type VoidTooltipProps = {
    content: string;
    children: JSX.Element;
    showDelay?: number;
    hideDelay?: number;
    disabled?: boolean;
    placement?: "top" | "bottom" | "left" | "right";
    offset?: number;
};

/** @public */
export declare const weight: {
    readonly normal: 400;
    readonly medium: 500;
    readonly semibold: 600;
    readonly bold: 700;
};

/** @public */
export declare function WrapRow(props: WrapRowProps): JSX.Element;

/** @public */
export declare type WrapRowProps = {
    /** Total available width. */
    width: number;
    /** Width of each item (assumed uniform). For variable widths, set to the max. */
    itemWidth: number;
    /** Gap between items. Default: 0. */
    gap?: number;
    /** Gap between rows. Default: same as gap. */
    rowGap?: number;
    /** Children elements to wrap. */
    children?: JSX.Element;
};

/** @public */
export declare function writeRouteManifestModule(options?: WriteRouteManifestOptions): Promise<FileSystemRouteManifest>;

/** @public */
export declare type WriteRouteManifestOptions = RouteManifestOptions & {
    outFile?: string;
};

export { }
