# Delta for frame-budget-scheduler

## ADDED Requirements

### Requirement: Three-priority task queue

The system MUST implement a three-priority scheduler in `scheduler/index.ts` with queues: `user-blocking`, `user-visible`, `background`. Each frame, the scheduler drains queues in priority order with a per-frame budget (default 12ms, leaving 4ms slack on a 16.6ms frame).

#### Scenario: user-blocking tasks never deferred

- GIVEN a `user-blocking` task is enqueued (e.g. input parsing, focus change)
- WHEN the scheduler processes the next frame
- THEN the task runs regardless of budget elapsed
- AND no `user-blocking` task is ever skipped or deferred

#### Scenario: user-visible tasks respect budget

- GIVEN `user-visible` tasks are enqueued (e.g. dirty layer repaint)
- WHEN the per-frame budget (12ms) is exceeded
- THEN remaining `user-visible` tasks stay in queue for next frame
- AND tasks are processed in FIFO order

#### Scenario: background tasks run in idle windows only

- GIVEN `background` tasks are enqueued (e.g. cache warming, telemetry)
- WHEN there are dirty layers or pending input
- THEN `background` tasks are NOT executed
- AND they only drain when the frame detects an idle window (no input, no dirty layers)

#### Scenario: Mixed priority draining order

- GIVEN all three queues have pending tasks
- WHEN the scheduler processes a frame
- THEN `user-blocking` drains completely first
- THEN `user-visible` drains until budget exceeded
- THEN `background` drains only if time remains AND no dirty layers exist

### Requirement: scheduleTask API

The system MUST expose `scheduleTask(priority: TaskPriority, fn: () => void): TaskHandle` as an internal runtime utility. The returned handle MUST support `cancelTask(handle)` for cleanup.

#### Scenario: Schedule and execute a task

- GIVEN `scheduleTask("user-visible", myTask)` is called
- WHEN the next frame's scheduler processes the `user-visible` queue
- THEN `myTask()` is invoked

#### Scenario: Cancel a scheduled task

- GIVEN a task handle is obtained from `scheduleTask`
- WHEN `cancelTask(handle)` is called before the task runs
- THEN the task is removed from its queue
- AND it is never executed

### Requirement: drainLane API

The system MUST expose `drainLane(priority: TaskPriority, budgetMs: number): number` for the frame loop to use. Returns the number of tasks actually executed.

#### Scenario: Drain with budget returns execution count

- GIVEN 10 `user-visible` tasks are queued
- WHEN `drainLane("user-visible", 12)` is called
- THEN it returns the count of tasks that fit within 12ms
- AND remaining tasks stay in the queue

### Requirement: Scheduler benchmarks protect behavior

Benchmarks MUST verify that under heavy background workload, `user-blocking` input handling never misses a frame.

#### Scenario: Saturated background workload does not block input

- GIVEN 10× background tasks are continuously enqueued
- WHEN a `user-blocking` input task is scheduled
- THEN the input task executes within the same frame
- AND input latency remains < 16ms

### Requirement: Existing frame-scheduler.ts is migrated

The existing `loop/frame-scheduler.ts` (18 lines, `InteractionKind`, `boostWindowFor`, `hasRecentInteraction`) MUST be migrated into the new `scheduler/` package. The interaction boost window logic MUST be preserved without behavioral change.

#### Scenario: Boost window is preserved

- GIVEN `boostWindowFor("pointer", boosts)` is called
- WHEN the new scheduler module is used
- THEN it returns the same value as the legacy `frame-scheduler.ts`

## Test Fixtures

- **fixture:scheduler-blocking-never-defers.ts** — 10 background tasks → blocking task always runs first
- **fixture:scheduler-visible-budget-split.ts** — 20 user-visible tasks → budget splits across frames
- **fixture:scheduler-cancel.ts** — Schedule + cancel → task never runs
- **bench:scheduler-saturation.ts** — 10× background + blocking input → blocking latency < 16ms
- **bench:scheduler-fairness.ts** — Long user-visible task → no task starves across 10 frames
