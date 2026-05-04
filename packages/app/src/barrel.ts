/**
 * Vexart unified public API barrel.
 *
 * This is the entry point for `import { ... } from "vexart"`.
 * It re-exports everything an app developer needs from a single import:
 *   - App lifecycle (createApp, mountApp, Page)
 *   - Primitives with className (Box, Text from @vexart/app)
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
 *   - Box/Text: @vexart/app wins (className support)
 *   - Button/ButtonProps: @vexart/styled wins (themed)
 *   - Switch (headless): renamed to ToggleSwitch to avoid SolidJS Switch
 *   - useRouter: @vexart/app wins (app-level file-based router).
 *     The headless useRouter lives in @vexart/engine for power users.
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
} from "./public"

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
} from "./public"

// ── Primitives with className ────────────────────────────────────────────────

export { Box, Text } from "./components/primitives"
export type { AppBoxProps, AppTextProps, ClassNameProps } from "./components/primitives"

export {
  resolveClassName,
  mergeClassNameProps,
  CLASS_NAME_UNKNOWN_BEHAVIOR,
} from "./styles/class-name"
export type {
  ClassNameUnknownBehavior,
  ClassNameDiagnostic,
  ClassNameResolveOptions,
  ClassNameResolveResult,
  VexartStyleProps,
} from "./styles/class-name"

// ── Primitives (non-colliding) ───────────────────────────────────────────────

export { Span, RichText, WrapRow } from "@vexart/primitives"
export type { SpanProps, RichTextProps, WrapRowProps, ShadowConfig, GlowConfig, BoxProps } from "@vexart/primitives"

// ── App router ───────────────────────────────────────────────────────────────

export {
  createAppRouter,
  matchRoute,
  normalizePath,
  ROUTE_FOCUS_ID,
  RouteOutlet,
  RouterProvider,
  useRouter,
} from "./router/router"
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
} from "./router/router"

export {
  discoverAppRoutes,
  routeFilePathToRoutePath,
  ROUTE_FILE_KIND,
  writeRouteManifestModule,
} from "./router/manifest"
export type {
  FileSystemRoute,
  FileSystemRouteFile,
  FileSystemRouteManifest,
  RouteFileKind,
  RouteManifestOptions,
  WriteRouteManifestOptions,
} from "./router/manifest"

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
  ThemeProvider,
  useTheme,
  // Typography
  H1, H2, H3, H4, P, Lead, Large, Small, Muted,
  // Components — styled versions win
  Avatar,
  Badge,
  Button,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction,
  Separator,
  Skeleton,
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
  AvatarProps,
  AvatarSize,
  BadgeProps,
  BadgeVariant,
  ButtonVariant,
  ButtonSize,
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
  CardActionProps,
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
  SeparatorProps,
  SkeletonProps,
  VoidSliderProps,
  VoidSwitchProps,
  VoidTableProps,
  VoidTabsProps,
  TabsVariant,
  VoidToasterOptions,
  VoidTooltipProps,
} from "@vexart/styled"

// Use ButtonProps from styled (themed) — headless ButtonProps available via "vexart/engine"
export type { ButtonProps } from "@vexart/styled"

// ── Headless components (unstyled — excluding Button which collides) ─────────

export {
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
  focusedId,
  // Interaction
  useDrag,
  useHover,
  setPointerCapture,
  releasePointerCapture,
  MouseButton,
  // Scroll
  createScrollHandle,
  // Node handle
  createHandle,
  // Syntax highlighting themes (needed by Code, Markdown, Textarea)
  SyntaxStyle,
  ONE_DARK,
  KANAGAWA,
  // Dirty flagging
  markDirty,
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
  KeyEvent,
  Modifiers,
  KeyboardState,
  MouseState,
  NodeMouseEvent,
  PressEvent,
  // Focus
  FocusHandle,
  // Interaction
  DragOptions,
  DragProps,
  DragState,
  HoverOptions,
  HoverProps,
  HoverState,
  // Node handle
  NodeHandle,
  // Syntax highlighting
  StyleDefinition,
  SimpleThemeRules,
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
  effect,
  memo,
} from "@vexart/engine"

export { createSignal, createEffect, createMemo, createContext, useContext, onCleanup, onMount, batch, untrack } from "solid-js"
