# Delta Spec: OpenCode Cosmic Shell Showcase

## ADDED Requirements

### Requirement: App framework SHOULD support a complex terminal-native showcase

The app framework SHOULD be able to express a React/Tailwind-inspired shell mockup as terminal-native Vexart components without relying on DOM elements, CSS cascade, or React runtime APIs.

#### Scenario: Showcase runs through public app APIs

- **Given** the OpenCode Cosmic Shell showcase
- **When** it is implemented in the repository
- **Then** it MUST import rendering primitives from `@vexart/app`
- **And** it MUST render through Vexart primitives such as `Page`, `Box`, and `Text`
- **And** it MUST NOT use DOM tags such as `div`, `button`, `input`, `svg`, or `style`

#### Scenario: Source interactions are preserved

- **Given** the source mockup has app switching, file tabs, a drawer toggle, assistant quick actions, and overlay dismissal
- **When** the showcase is ported
- **Then** equivalent interactions MUST be represented with Vexart `onPress` handlers and Solid signals

#### Scenario: Data model stays internally consistent

- **Given** launcher and dock items point to app cards
- **When** the showcase self-tests run
- **Then** every launcher item and dock app MUST resolve to an app card
- **And** the context file count MUST match the assistant panel summary
