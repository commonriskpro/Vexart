export { colors, radius, space } from "./tokens"
export { Rule, Chip, ToolIcon, Button, SurfaceCard, Metric, PanelHeader, Panel, PanelSection, InlineActions, Toolbar, AppBar, StatusRow, InspectorRow, KeyValueList, PanelFooter, GraphLegend, CodeBlock, CodeFrame, ShellFrame, drawOverlayCard } from "./primitives"
export { useDraggableGraph } from "./graph"
export type { PanelProps, PanelDragPosition, CodeLine, InspectorRowTone, GraphLegendTone, GraphLegendItemData } from "./primitives"
export type { GraphPoint, GraphNodeSeed, DraggableGraphState } from "./graph"

// ── New reusable system ──
export { createGraphState } from "./graph-state"
export type { GraphNodeDef, GraphEdgeDef, GraphViewport, GraphSnapshot, GraphState } from "./graph-state"

export { createWindowRegistry } from "./window-registry"
export type { WindowKindDef, PersistedWindow, WindowRegistryHandle } from "./window-registry"

export { createLayoutPersistence } from "./persistence"
export type { PersistedLayout, PersistenceHandle } from "./persistence"

// Window kinds
export { codeEditorKind } from "./windows/code-editor"
export type { CodeEditorState } from "./windows/code-editor"
export { diffViewerKind } from "./windows/diff-viewer"
export type { DiffViewerState } from "./windows/diff-viewer"
export { memoryPanelKind } from "./windows/memory-panel"
export type { MemoryPanelState, MemoryEntry, MemoryReference } from "./windows/memory-panel"
export { agentPanelKind } from "./windows/agent-panel"
export type { AgentPanelState, AgentLogEntry } from "./windows/agent-panel"
