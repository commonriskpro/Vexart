---
title: Data Fetching
description: useQuery and useMutation for async data in terminal apps.
---

## useQuery

Declarative data fetching with retry, refetch, and interval support:

```tsx
import { useQuery } from "@vexart/engine"

function UserList() {
  const users = useQuery({
    key: "users",
    fn: () => fetch("/api/users").then(r => r.json()),
    refetchInterval: 30000,  // Poll every 30s
    retry: 3,
  })

  return (
    <Show when={!users.loading} fallback={<text>Loading...</text>}>
      <For each={users.data}>
        {(user) => <text>{user.name}</text>}
      </For>
    </Show>
  )
}
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `key` | `string` | Cache key |
| `fn` | `() => Promise<T>` | Fetch function |
| `retry` | `number` | Retry count on failure |
| `refetchInterval` | `number` | Auto-refetch interval (ms) |
| `enabled` | `boolean` | Enable/disable the query |

## useMutation

For write operations with optimistic updates:

```tsx
import { useMutation } from "@vexart/engine"

const saveMutation = useMutation({
  fn: (data) => fetch("/api/save", { method: "POST", body: JSON.stringify(data) }),
  onSuccess: () => refetch(),
  onError: (err) => showToast(err.message),
  optimistic: (data) => updateCache(data),  // Immediate UI update
  rollback: (data) => revertCache(data),    // Revert on failure
})

saveMutation.mutate({ name: "Updated" })
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `fn` | `(data) => Promise` | Mutation function |
| `onSuccess` | `() => void` | Success callback |
| `onError` | `(err) => void` | Error callback |
| `optimistic` | `(data) => void` | Optimistic update |
| `rollback` | `(data) => void` | Rollback on failure |
