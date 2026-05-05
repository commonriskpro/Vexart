# Data Fetching

> Expanded guide for Vexart's data fetching and mutation system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#usequeryfetcher-options).

Vexart provides `useQuery` and `useMutation` — reactive data primitives that integrate with SolidJS signals. These are not a full caching library like TanStack Query, but they cover the core patterns: fetching, refetching, retry, loading states, optimistic updates, and rollback.

---

## useQuery — Reactive Data Fetching

`useQuery` runs an async fetcher function and returns a reactive result with `data`, `loading`, `error`, and control methods.

### Signature

```typescript
import { useQuery } from "vexart/engine"

type QueryResult<T> = {
  data: () => T | undefined          // reactive — the fetched data
  loading: () => boolean              // reactive — true while fetching
  error: () => Error | undefined      // reactive — the last error
  refetch: () => void                 // manually re-run the fetcher
  mutate: (data: T | ((prev: T | undefined) => T)) => void  // update local data
}

type QueryOptions = {
  enabled?: boolean          // run immediately? default: true
  refetchInterval?: number   // auto-refetch every N ms. 0 = disabled
  retry?: number             // retry count on error. default: 0
  retryDelay?: number        // delay between retries (ms). default: 1000
}

const result = useQuery<T>(
  fetcher: () => Promise<T>,
  options?: QueryOptions
)
```

### Basic example

```tsx
import { useQuery, Show, For } from "vexart/engine"

function UserList() {
  const users = useQuery(
    () => fetch("https://api.example.com/users").then(r => r.json())
  )

  return (
    <box direction="column" gap={4} padding={16}>
      <Show when={users.loading()}>
        <text color="#888">Loading users...</text>
      </Show>

      <Show when={users.error()}>
        <text color="#dc2626">Error: {users.error()!.message}</text>
      </Show>

      <Show when={users.data()}>
        <For each={users.data()!}>
          {(user) => (
            <box padding={4}>
              <text color="#e0e0e0">{user.name}</text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
```

### Loading, Error, and Data states

The three states are mutually progressive:

1. Initially: `loading()` = true, `data()` = undefined, `error()` = undefined
2. On success: `loading()` = false, `data()` = fetched value, `error()` = undefined
3. On failure: `loading()` = false, `data()` = undefined, `error()` = Error object

On `refetch()`, loading becomes true again but data keeps its previous value (stale-while-revalidate pattern).

```tsx
function DataPanel() {
  const stats = useQuery(
    () => fetch("/api/stats").then(r => r.json())
  )

  return (
    <box direction="column" gap={8} padding={16}>
      {/* Show data even during refetch (stale-while-revalidate) */}
      <Show when={stats.data()}>
        <text color="#e0e0e0">Users: {String(stats.data()!.userCount)}</text>
        <text color="#e0e0e0">Active: {String(stats.data()!.activeCount)}</text>
      </Show>

      {/* Loading indicator — shows on initial load AND refetch */}
      <Show when={stats.loading()}>
        <text color="#888" fontSize={12}>
          {stats.data() ? "Refreshing..." : "Loading..."}
        </text>
      </Show>

      {/* Error with retry */}
      <Show when={stats.error()}>
        <box direction="row" gap={8} alignY="center">
          <text color="#dc2626">{stats.error()!.message}</text>
          <box focusable onPress={() => stats.refetch()} backgroundColor="#333"
            padding={4} cornerRadius={4}>
            <text color="#fff" fontSize={12}>Retry</text>
          </box>
        </box>
      </Show>
    </box>
  )
}
```

### Retry

Automatic retry on failure:

```tsx
const data = useQuery(
  () => fetch("/api/flaky-endpoint").then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }),
  {
    retry: 3,           // retry up to 3 times
    retryDelay: 1000,   // wait 1 second between retries
  }
)
```

The query retries only on error, not on success. After exhausting retries, the error is set.

### Auto-Refetch (Polling)

```tsx
// Refresh dashboard stats every 30 seconds
const stats = useQuery(
  () => fetch("/api/stats").then(r => r.json()),
  { refetchInterval: 30_000 }
)
```

Set `refetchInterval: 0` to disable.

### Conditional Fetching

```tsx
const [userId, setUserId] = createSignal<string | null>(null)

// Only fetch when userId is set
const user = useQuery(
  () => fetch(`/api/users/${userId()}`).then(r => r.json()),
  { enabled: !!userId() }
)
```

**Note:** `enabled` is evaluated once when useQuery is called. If you need dynamic enabling/disabling, structure your component so useQuery is inside a `<Show>` block:

```tsx
<Show when={userId()}>
  <UserDetail id={userId()!} />
</Show>

// UserDetail calls useQuery unconditionally — it only mounts when needed
```

### Local Data Mutation (Optimistic)

`mutate()` lets you update the local data without refetching. Useful for optimistic updates:

```tsx
const users = useQuery(() => fetchUsers())

// Optimistically add a user to the local list
users.mutate(prev => [...(prev ?? []), newUser])

// Or replace entirely
users.mutate(freshData)
```

---

## useMutation — Reactive Data Mutation

`useMutation` wraps an async mutation function with loading state, error tracking, and lifecycle hooks for optimistic updates.

### Signature

```typescript
import { useMutation } from "vexart/engine"

type MutationResult<T, V> = {
  data: () => T | undefined           // reactive — last successful result
  loading: () => boolean               // reactive — true while mutating
  error: () => Error | undefined       // reactive — last error
  mutate: (variables: V) => Promise<T | undefined>  // trigger the mutation
  reset: () => void                    // clear data/error state
}

type MutationOptions<T, V> = {
  onMutate?: (variables: V) => T | undefined    // optimistic update, return previous data for rollback
  onSuccess?: (data: T, variables: V) => void
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}

const mutation = useMutation<T, V>(
  mutator: (variables: V) => Promise<T>,
  options?: MutationOptions<T, V>
)
```

### Basic example

```tsx
import { useMutation } from "vexart/engine"

function DeleteButton(props: { userId: string }) {
  const del = useMutation(
    (id: string) => fetch(`/api/users/${id}`, { method: "DELETE" }).then(r => r.json())
  )

  return (
    <box
      focusable
      onPress={() => del.mutate(props.userId)}
      backgroundColor={del.loading() ? "#555" : "#dc2626"}
      cornerRadius={6}
      padding={8}
    >
      <text color="#fff">
        {del.loading() ? "Deleting..." : "Delete"}
      </text>
    </box>
  )
}
```

### Optimistic Updates with Rollback

The `onMutate` hook runs BEFORE the async mutation. You can optimistically update UI and return the previous data for rollback on error.

```tsx
const users = useQuery(() => fetchUsers())

const deleteUser = useMutation(
  (id: string) => fetch(`/api/users/${id}`, { method: "DELETE" }).then(r => r.json()),
  {
    onMutate: (id) => {
      // Save previous state for rollback
      const prev = users.data()

      // Optimistically remove user from local list
      users.mutate(current => current?.filter(u => u.id !== id))

      return prev  // returned value is passed as `previousData` to onError
    },

    onError: (error, id, previousData) => {
      // Rollback — restore previous data
      if (previousData) {
        users.mutate(previousData)
      }
    },

    onSuccess: (data, id) => {
      console.log(`Deleted user ${id}`)
    },

    onSettled: (data, error, id) => {
      // Always runs — refetch to ensure consistency
      users.refetch()
    },
  }
)

// Trigger: deleteUser.mutate("user-123")
```

### Lifecycle hooks

| Hook | When | Params | Purpose |
|------|------|--------|---------|
| `onMutate` | Before mutation starts | `(variables)` | Optimistic update, return rollback data |
| `onSuccess` | Mutation succeeded | `(data, variables)` | Success side effects |
| `onError` | Mutation failed | `(error, variables, previousData)` | Rollback, error toasts |
| `onSettled` | Always (success or error) | `(data, error, variables)` | Cleanup, refetch |

### Reset

`reset()` clears the mutation's data and error state. Useful for forms:

```tsx
const submit = useMutation(
  (values: FormData) => postForm(values)
)

// After closing a form dialog:
submit.reset()
```

---

## Combining useQuery + useMutation

The typical CRUD pattern:

```tsx
import { useQuery, useMutation, Show, For } from "vexart/engine"
import { Button, Input } from "vexart"
import { createSignal } from "solid-js"

function TodoApp() {
  const [newTodo, setNewTodo] = createSignal("")

  // READ
  const todos = useQuery(
    () => fetch("/api/todos").then(r => r.json()),
    { retry: 2 }
  )

  // CREATE
  const addTodo = useMutation(
    (text: string) => fetch("/api/todos", {
      method: "POST",
      body: JSON.stringify({ text }),
    }).then(r => r.json()),
    {
      onMutate: (text) => {
        // Optimistic: add immediately
        const optimistic = { id: "temp-" + Date.now(), text, done: false }
        todos.mutate(prev => [...(prev ?? []), optimistic])
      },
      onSettled: () => {
        // Refetch to get real IDs
        todos.refetch()
        setNewTodo("")
      },
    }
  )

  // DELETE
  const removeTodo = useMutation(
    (id: string) => fetch(`/api/todos/${id}`, { method: "DELETE" }).then(r => r.json()),
    {
      onMutate: (id) => {
        todos.mutate(prev => prev?.filter(t => t.id !== id))
      },
      onError: () => todos.refetch(),
    }
  )

  return (
    <box direction="column" gap={8} padding={16} width={400}>
      <text color="#fafafa" fontSize={18}>Todos</text>

      {/* Add form */}
      <box direction="row" gap={8}>
        <Input
          value={newTodo()}
          onChange={setNewTodo}
          onSubmit={(v) => addTodo.mutate(v)}
          placeholder="New todo..."
          renderInput={(ctx) => (
            <box width={250} height={24} backgroundColor="#1e1e2e" cornerRadius={4}
              borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} padding={4}>
              <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
            </box>
          )}
        />
      </box>

      {/* List */}
      <Show when={todos.loading() && !todos.data()}>
        <text color="#888">Loading...</text>
      </Show>

      <For each={todos.data() ?? []}>
        {(todo) => (
          <box direction="row" gap={8} alignY="center" padding={4}>
            <text color="#e0e0e0" width="grow">{todo.text}</text>
            <box focusable onPress={() => removeTodo.mutate(todo.id)}>
              <text color="#dc2626" fontSize={12}>x</text>
            </box>
          </box>
        )}
      </For>
    </box>
  )
}
```

---

## Patterns

### Loading skeleton

```tsx
import { Skeleton } from "vexart"

function UserCard() {
  const user = useQuery(() => fetchUser())

  return (
    <box padding={16} backgroundColor="#1e1e2e" cornerRadius={12} gap={8}>
      <Show when={user.data()} fallback={
        <box gap={8}>
          <Skeleton width={120} height={20} />
          <Skeleton width={200} height={14} />
        </box>
      }>
        <text color="#fafafa" fontSize={16}>{user.data()!.name}</text>
        <text color="#888">{user.data()!.email}</text>
      </Show>
    </box>
  )
}
```

### Error boundary with retry

```tsx
function DataSection(props: { query: QueryResult<any>; children: any }) {
  return (
    <box direction="column" gap={4}>
      <Show when={props.query.error()}>
        <box direction="row" gap={8} alignY="center" padding={8}
          backgroundColor="#3b111140" cornerRadius={6}>
          <text color="#dc2626">{props.query.error()!.message}</text>
          <box focusable onPress={() => props.query.refetch()}
            backgroundColor="#333" padding={4} cornerRadius={4}>
            <text color="#fff" fontSize={12}>Retry</text>
          </box>
        </box>
      </Show>

      <Show when={!props.query.error()}>
        {props.children}
      </Show>
    </box>
  )
}
```

### Mutation with toast feedback

```tsx
import { createToaster } from "vexart"

const { toast, Toaster } = createToaster({ /* ... */ })

const save = useMutation(
  (data: FormData) => submitForm(data),
  {
    onSuccess: () => toast({ message: "Saved!", variant: "success" }),
    onError: (err) => toast({ message: err.message, variant: "error" }),
  }
)
```

---

## Tips

1. **useQuery runs immediately by default.** Set `enabled: false` to defer, then call `refetch()` manually.

2. **mutate() is for local-only updates.** It doesn't call the fetcher. Use it for optimistic UI, then `refetch()` for server truth.

3. **No global cache.** Each `useQuery` call is independent. If two components fetch the same URL, they make separate requests. For shared data, lift the query to a parent and pass data via props or context.

4. **SolidJS reactivity applies.** `data()`, `loading()`, and `error()` are reactive getters. Read them inside JSX for automatic updates. Don't capture them in variables outside JSX.

5. **The fetcher receives no arguments.** If you need parameters, close over a signal:
   ```tsx
   const [id, setId] = createSignal("123")
   const user = useQuery(() => fetchUser(id()))
   ```

---

## See Also

- [Components (Headless)](./components-headless.md) — components that display fetched data
- [Animations](./animations.md) — animate loading transitions
- [developer-guide.md](./developer-guide.md#usequeryfetcher-options) — quick reference
