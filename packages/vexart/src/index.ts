/**
 * Vexart unified public API barrel.
 *
 * This is the entry point for `import { ... } from "vexart"`.
 * It re-exports everything an app developer needs from a single import:
 *   - App lifecycle (createApp, mountApp, Page)
 *   - Styling/resolution support for intrinsic primitives (box, text)
 *   - Styled components and tokens (@vexart/styled)
 *   - Headless components (@vexart/headless)
 *   - User-facing engine hooks (useTerminalDimensions, createTransition, etc.)
 *   - SolidJS control flow (For, Show, Switch, etc.)
 *   - SolidJS reactivity re-exports (createSignal, createEffect, onCleanup)
 *
 * For low-level engine access (FFI, render loop, terminal, GPU bridge),
 * use `import { ... } from "vexart/engine"` instead.
 *
 * Collision resolution:
 *   - Button/ButtonProps: @vexart/styled wins (themed)
 *   - Switch (headless): renamed to ToggleSwitch to avoid SolidJS Switch
 */

// ── App lifecycle & framework ────────────────────────────────────────────────

export {
  createApp,
  mountApp,
  Page,
  useAppTerminal,
  runCli,
  defineConfig,
  mergeConfig,
} from "@vexart/app"

export type {
  CreateAppOptions,
  AppContext,
  MountAppOptions,
  PageProps,
  VexartAppConfig,
  VexartAppConfigApp,
  VexartAppConfigStyles,
  VexartAppConfigTerminal,
  VexartAppConfigTheme,
  CliResult,
} from "@vexart/app"

export {
  resolveClassName,
  mergeClassNameProps,
  clearClassNameCache,
  createStyles,
  CLASS_NAME_UNKNOWN_BEHAVIOR,
} from "@vexart/app"
export type {
  ClassNameUnknownBehavior,
  ClassNameDiagnostic,
  ClassNameResolveOptions,
  ClassNameResolveResult,
  VexartStyleProps,
} from "@vexart/app"

// ── Primitives & Styling ───────────────────────────────────────────────────

export type { TGEProps, TGEProps as BoxProps, ShadowConfig, GlowConfig } from "@vexart/engine"

/** @beta Grid value types accepted by the app box props. */
export type {
  GridAreaPlacement,
  GridAutoFlow,
  GridBreadth,
  GridContentAlignment,
  GridErrorCode,
  GridFitContent,
  GridFr,
  GridItemAlignment,
  GridLineRef,
  GridLayoutError,
  GridMaxBreadth,
  GridMinMax,
  GridPercent,
  GridPlacement,
  GridRepeatCount,
  GridTrack,
  GridTrackSize,
} from "@vexart/engine"

// ── App router ───────────────────────────────────────────────────────────────

export {
  createAppRouter,
  matchRoute,
  normalizePath,
  ROUTE_FOCUS_ID,
  RouteOutlet,
  RouterProvider,
  useRouter,
} from "@vexart/app"
export type {
  AppRouteDefinition,
  AppRouteMatch,
  AppRouter,
  AppRouterContextValue,
  AppRouterFocusRestorer,
  AppRouterProviderProps,
  AppRouterState,
  CreateAppRouterOptions,
  NavigationOptions,
  RouteErrorComponent,
  RouteLayoutComponent,
  RouteOutletProps,
  RouteComponent,
  RouteParams,
} from "@vexart/app"

export {
  discoverAppRoutes,
  routeFilePathToRoutePath,
  ROUTE_FILE_KIND,
  writeRouteManifestModule,
} from "@vexart/app"
export type {
  FileSystemRoute,
  FileSystemRouteFile,
  FileSystemRouteManifest,
  RouteFileKind,
  RouteManifestOptions,
  WriteRouteManifestOptions,
} from "@vexart/app"

// ── Styled components (themed — Button wins over headless) ───────────────────

export {
  // Tokens
  colors,
  radius,
  space,
  font,
  weight,
  shadows,
  glows,
  theme,
  // Theme runtime
  createTheme,
  darkTheme,
  lightTheme,
  themeColors,
  setTheme,
  getTheme,
  getThemeVersion,
  // Typography
  H1, H2, H3, H4, P, Lead, Large, Small, Muted,
  // Void design system components (styled)
  VoidAvatar,
  VoidBadge,
  VoidButton,
  VoidCard, VoidCardHeader, VoidCardTitle, VoidCardDescription, VoidCardContent, VoidCardFooter, VoidCardAction,
  VoidSeparator,
  VoidSkeleton,
  VoidCheckbox,
  VoidCombobox,
  VoidDialog, VoidDialogTitle, VoidDialogDescription, VoidDialogFooter,
  VoidDropdownMenu, VoidDropdownMenuTrigger, VoidDropdownMenuContent,
  VoidDropdownMenuItem, VoidDropdownMenuSeparator, VoidDropdownMenuLabel,
  VoidInput,
  VoidPopover,
  VoidProgress,
  VoidRadioGroup,
  VoidSelect,
  VoidSlider,
  VoidSwitch,
  VoidTable,
  VoidTabs,
  VoidTextarea,
  VoidCode,
  VoidMarkdown,
  VoidList,
  VoidVirtualList,
  VoidScrollView,
  VoidDiff,
  createVoidToaster,
  VoidTooltip,
} from "@vexart/styled"

export type {
  VoidTheme,
  Shadow,
  Glow,
  ColorTokens,
  ThemeDefinition,
  TypographyProps,
  VoidAvatarProps,
  AvatarSize,
  VoidBadgeProps,
  BadgeVariant,
  VoidButtonVariant,
  VoidButtonSize,
  VoidButtonProps,
  VoidCardProps,
  VoidCardHeaderProps,
  VoidCardTitleProps,
  VoidCardDescriptionProps,
  VoidCardContentProps,
  VoidCardFooterProps,
  VoidCardActionProps,
  VoidCheckboxProps,
  VoidComboboxProps,
  VoidDialogProps,
  VoidDialogTitleProps,
  VoidDialogDescriptionProps,
  VoidDialogFooterProps,
  VoidDropdownMenuProps,
  VoidDropdownMenuTriggerProps,
  VoidDropdownMenuContentProps,
  VoidDropdownMenuItemProps,
  VoidDropdownMenuLabelProps,
  VoidInputProps,
  VoidPopoverProps,
  VoidProgressProps,
  VoidRadioGroupProps,
  VoidSelectProps,
  VoidSeparatorProps,
  VoidSkeletonProps,
  VoidSliderProps,
  VoidSwitchProps,
  VoidTableProps,
  VoidTabsProps,
  TabsVariant,
  VoidToasterOptions,
  VoidTooltipProps,
  VoidTextareaProps,
  VoidCodeProps,
  VoidMarkdownProps,
  VoidListProps,
  VoidVirtualListProps,
  VoidScrollViewProps,
  VoidDiffProps,
} from "@vexart/styled"

// ── Headless components (unstyled primitives) ────────────────────────────────

export {
  Button,
  Checkbox,
  Combobox,
  Input,
  RadioGroup,
  Select, SelectTrigger, SelectContent, SelectItem,
  Slider,
  Switch as ToggleSwitch,
  Textarea,
  Code,
  Markdown,
  ProgressBar,
  OverlayRoot,
  Portal,
  ScrollView,
  Tabs,
  List,
  Table,
  VirtualList,
  Dialog, DialogOverlay, DialogContent, DialogClose,
  createToaster,
  Tooltip, Popover,
  Diff,
  createForm,
} from "@vexart/headless"

export type {
  ButtonProps,
  ButtonRenderContext,
  CheckboxRenderContext,
  CheckboxProps,
  ComboboxOption,
  ComboboxInputContext,
  ComboboxOptionContext,
  ComboboxProps,
  InputRenderContext,
  InputProps,
  RadioOption,
  RadioOptionContext,
  RadioGroupProps,
  SelectOption,
  SelectTriggerContext,
  SelectOptionContext,
  SelectProps,
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
  SliderTrackProps,
  SliderRenderContext,
  SliderProps,
  SwitchRenderContext,
  SwitchProps,
  TextareaTheme,
  KeyBinding,
  KeyBindingAction,
  VisualCursor,
  TextareaHandle,
  TextareaProps,
  CodeTheme,
  CodeProps,
  HighlightToken,
  Token,
  Highlighter,
  MarkdownTheme,
  MarkdownProps,
  ProgressBarRenderContext,
  ProgressBarProps,
  OverlayRootProps,
  PortalProps,
  ScrollViewProps,
  TabItem,
  TabRenderContext,
  TabsProps,
  ListItemContext,
  ListProps,
  TableColumn,
  TableCellContext,
  TableProps,
  VirtualListItemContext,
  VirtualListProps,
  DialogProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogCloseProps,
  ToastVariant,
  ToastPosition,
  ToastData,
  ToastInput,
  ToasterOptions,
  ToasterHandle,
  TooltipProps,
  PopoverTriggerContext,
  PopoverProps,
  DiffTheme,
  DiffProps,
  FieldValidator,
  AsyncFieldValidator,
  FormOptions,
  FieldState,
  FormHandle,
} from "@vexart/headless"

// ── User-facing engine hooks ─────────────────────────────────────────────────
// Only the hooks and utilities an app developer uses directly.
// For low-level engine access, use "vexart/engine".

export {
  // Terminal dimensions (reactive)
  useTerminalDimensions,
  // Colors
  RGBA,
  // Animation
  createTransition,
  createSpring,
  easing,
  // Data fetching
  useQuery,
  useMutation,
  // Keyboard/mouse hooks
  useKeyboard,
  useMouse,
  useInput,
  onInput,
  // Paste
  decodePasteBytes,
  // Focus
  useFocus,
  setFocus,
  clearFocus,
  focusedId,
  pushFocusScope,
  // Selection
  getSelection,
  setSelection,
  clearSelection,
  CanvasContext,
  createParticleSystem,
  registerFont,
  unregisterFont,
  measureText,
  measureTextWidth,
  // Interaction
  useDrag,
  useHover,
  setPointerCapture,
  releasePointerCapture,
  onPostScroll,
  MouseButton,
  // Scroll
  createScrollHandle,
  releaseScrollHandle,
  // Debug
  debugStatsLine,
  getImageCacheStats,
  // Node handle

} from "@vexart/engine"

export type {
  // Data
  QueryResult,
  QueryOptions,
  MutationResult,
  MutationOptions,
  // Animation
  EasingFn,
  TransitionConfig,
  SpringConfig,
  // Input
  FocusEvent,
  InputEvent,
  InputSubscriber,
  KeyEvent,
  KeyboardState,
  Modifiers,
  MouseAction,
  MouseCoordMode,
  MouseEvent,
  MouseState,
  NodeMouseEvent,
  PasteEvent,
  PressEvent,
  ResizeEvent,
  // Focus
  FocusHandle,
  // Selection
  TextSelection,
  // Scroll
  ScrollHandle,
  // Interaction
  DragOptions,
  DragProps,
  DragState,
  HoverOptions,
  HoverProps,
  HoverState,
  // Node handle
  NodeHandle,
  MeasureTextOptions,
  // Terminal
  Terminal,
  TerminalOptions,
  TerminalSize,
  // Mount
  MountHandle,
  MountOptions,

} from "@vexart/engine"

// ── SolidJS re-exports ───────────────────────────────────────────────────────
// So app developers don't need a separate solid-js import for basics.

export {
  For,
  Show,
  Switch,
  Match,
  Index,
  ErrorBoundary,
  createComponent,
} from "solid-js"

export type { JSX } from "solid-js"

export {
  createSignal,
  createEffect,
  createMemo,
  createContext,
  useContext,
  onCleanup,
  onMount,
  batch,
  untrack,
  children,
  splitProps,
} from "solid-js"
