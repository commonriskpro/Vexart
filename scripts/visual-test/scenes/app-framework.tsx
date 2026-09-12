import { Page } from "../../../packages/app/src/public"

export const width = 420
export const height = 320

export function Scene() {
  return (
    <Page className="bg-background p-4">
      <box className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <text className="text-xl font-semibold text-foreground">@vexart/app</text>
        <text className="mt-2 text-sm text-muted-foreground">Filesystem routes, className styles, Bun runtime.</text>
        <box className="mt-4 flex-row gap-3">
          <box className="rounded-md bg-primary px-4 py-2">
            <text className="text-sm font-medium text-primary-foreground">Home</text>
          </box>
          <box className="rounded-md border border-border bg-secondary px-4 py-2">
            <text className="text-sm font-medium text-secondary-foreground">Projects</text>
          </box>
        </box>
      </box>
      <box className="mt-4 flex-row gap-3">
        <box className="rounded-lg border border-border bg-muted p-3 w-44">
          <text className="text-sm font-semibold text-foreground">Route manifest</text>
          <text className="mt-2 text-xs text-muted-foreground">app/page.tsx -> /</text>
          <text className="mt-1 text-xs text-muted-foreground">app/projects/[id]/page.tsx</text>
        </box>
        <box className="rounded-lg border border-ring bg-accent p-3 w-44">
          <text className="text-sm font-semibold text-accent-foreground">Focus restore</text>
          <text className="mt-2 text-xs text-muted-foreground">router.push() queues route focus.</text>
        </box>
      </box>
    </Page>
  )
}
