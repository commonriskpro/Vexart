# Spec: Vexart App Framework

## ADDED Requirements

### Requirement: App framework MUST be Bun-native

The Vexart app framework MUST run generated applications and development tooling in a Bun process. It MUST use Vexart for rendering and MUST NOT require Next.js as the runtime.

#### Scenario: Generated app starts

- **Given** a generated Vexart app
- **When** the user runs `bun dev`
- **Then** the app MUST start in a Bun process
- **And** rendering MUST flow through Vexart primitives and `@vexart/engine`
- **And** the app MUST NOT require a browser, DOM, CSSOM, or Next.js server process

#### Scenario: Developer asks whether this is Next.js

- **Given** app-framework documentation
- **When** it describes routing and project conventions
- **Then** it MUST use language like "Next-inspired" or "App Router-style"
- **And** it MUST NOT claim arbitrary Next.js application compatibility

### Requirement: App framework MUST provide Tailwind-like utility styling

The framework MUST provide a `className` authoring layer that maps supported utility classes to Vexart props and interaction style props.

#### Scenario: Static utility classes are used

- **Given** a Vexart app component with `className="rounded-xl bg-card p-4 text-sm"`
- **When** the framework resolves styles
- **Then** it MUST map supported classes to Vexart props
- **And** it MUST not emit DOM CSS

#### Scenario: Unsupported utility class is used

- **Given** a developer uses an unsupported class
- **When** the app runs in development mode
- **Then** the framework MUST report a clear unsupported-class diagnostic
- **And** the diagnostic SHOULD explain whether the class is impossible, not implemented, or waiting for engine support

### Requirement: App framework MUST provide terminal-native app routing

The framework MUST provide route conventions inspired by Next.js App Router while adapting behavior to terminal UI requirements.

#### Scenario: Page route is discovered

- **Given** `app/projects/page.tsx`
- **When** route discovery runs
- **Then** the framework MUST register `/projects`

#### Scenario: Route group is discovered

- **Given** `app/(workspace)/projects/page.tsx`
- **When** route discovery runs
- **Then** the framework MUST register `/projects`
- **And** the `(workspace)` segment MUST NOT appear in the URL path

#### Scenario: Private route folder is ignored

- **Given** `app/_drafts/page.tsx`
- **When** route discovery runs
- **Then** the framework MUST NOT register `/_drafts`

#### Scenario: Dynamic route receives params

- **Given** `app/projects/[id]/page.tsx`
- **When** the user navigates to `/projects/abc`
- **Then** the page MUST receive `params.id` equal to `"abc"`

#### Scenario: Route navigation changes focus

- **Given** a focused element on the current route
- **When** navigation moves to a different route
- **Then** focus MUST move predictably to the new route's preferred focus target or root fallback

#### Scenario: Layout wraps page

- **Given** `app/layout.tsx` and `app/projects/page.tsx`
- **When** `/projects` renders
- **Then** the route outlet MUST wrap the page with the discovered layout

#### Scenario: Error route renders

- **Given** a route defines an `error.tsx` fallback
- **When** the page throws during render
- **Then** the route outlet MUST render the error fallback with the thrown value

#### Scenario: Not-found route renders

- **Given** `app/not-found.tsx`
- **When** a user navigates to a missing route
- **Then** the generated route manifest MUST include a catch-all not-found route

### Requirement: App framework MUST provide CLI and template workflow

The framework MUST provide a first-run workflow that creates a project, starts development, prints route information, and diagnoses terminal/runtime issues.

#### Scenario: New project is created

- **Given** a user runs `bun create vexart-app my-app`
- **When** project generation completes
- **Then** the project MUST include an `app/` directory, Vexart config, TypeScript config, package scripts, and a runnable starter UI

#### Scenario: Dev command runs without a manual entry

- **Given** an app with `app/page.tsx` and no `app/main.tsx`
- **When** the user runs `vexart dev`
- **Then** the CLI MUST generate `.vexart/routes.ts` and `.vexart/dev.tsx`
- **And** it MUST run Bun with route discovery and watch mode enabled by default

#### Scenario: Doctor command runs

- **Given** a generated app
- **When** the user runs `vexart doctor`
- **Then** the command MUST check Bun version, Vexart package versions, native binary availability, terminal graphics support, and mouse support
- **And** failures MUST include actionable remediation text

### Requirement: App framework MUST preserve direct Vexart escape hatches

The framework MUST NOT hide direct access to Vexart primitives or explicit props.

#### Scenario: User avoids className

- **Given** a framework route component
- **When** the developer writes explicit Vexart props on `<box>` or `<text>`
- **Then** the component MUST render without requiring utility classes

#### Scenario: User mixes className and explicit props

- **Given** a component uses both `className` and explicit Vexart props
- **When** style resolution runs
- **Then** conflict resolution MUST follow the documented precedence rules
