# Lightcode window system delta spec

## Requirement: Tokenized window visuals

Lightcode windows MUST derive colors, spacing, radii, shadows, glow, and titlebar sizing from Lightcode tokens instead of hardcoded component internals.

### Scenario: Window frame uses semantic tokens

Given a Lightcode window frame is rendered
When the frame chooses its surface, border, shadow, radius, titlebar, and control colors
Then those values come from `lightcodeWindowTokens` or `lightcodeWindowRecipes`.

### Scenario: Shader-like glass recipes use tokenized gradients

Given a focused or inactive Lightcode window is rendered
When its surface, titlebar, content, or dock chrome is painted
Then gradient, bevel, highlight, and glow values come from Lightcode tokens instead of component-local literals.

## Requirement: Headless state manager

The window manager MUST own window state independently of visual rendering.

### Scenario: Focus raises a window

Given two windows are registered
When the lower window is focused
Then it becomes active and receives the highest z-index.

### Scenario: Close hides a window from the desktop

Given a window is registered and visible
When the window is closed
Then the window status becomes closed and the desktop no longer renders it.

### Scenario: Minimize hides content without losing state

Given a window is registered and visible
When the window is minimized
Then the window status becomes minimized and its previous rectangle remains available for restore.

### Scenario: Minimized windows appear in the dock

Given a window is minimized
When the desktop renders the dock
Then the dock shows a restorable item for that window.

### Scenario: Dock activation restores a minimized window

Given a window is minimized
When the dock item is activated
Then the manager focuses the window and returns it to normal status.

### Scenario: Maximize and restore preserve previous bounds

Given a window has a normal rectangle
When the window is maximized and then restored
Then it returns to its previous normal rectangle.

## Requirement: Lightcode frame interactions

Window controls MUST expose minimize, maximize/restore, and close actions through the frame titlebar.

### Scenario: Controls dispatch manager actions

Given a Lightcode window frame receives a manager
When its close, minimize, or maximize control is pressed
Then the corresponding manager action is called for that window id.

### Scenario: Resize handles update normal window bounds

Given a non-maximized Lightcode window frame is visible
When its right, bottom, or corner resize handle is dragged
Then the manager updates the window dimensions while preserving the window origin.

### Scenario: Maximized windows do not resize by drag handles

Given a Lightcode window is maximized
When a resize handle receives a drag gesture
Then the manager leaves the maximized rectangle unchanged.

## Requirement: Application-level composition first

The first implementation MUST NOT add a public `@vexart/windowing` package or alter existing public package exports.

### Scenario: Public API remains unchanged

Given the Lightcode window system is implemented
When package public exports are inspected
Then no new public Vexart package is required for this slice.
