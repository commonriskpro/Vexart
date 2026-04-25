import { Box, Page, Text } from "../../../packages/app/src/public"

export const width = 420
export const height = 320

export function Scene() {
  return (
    <Page className="bg-background p-4">
      <Box className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <Text className="text-xl font-semibold text-foreground">@vexart/app</Text>
        <Text className="mt-2 text-sm text-muted-foreground">Filesystem routes, className styles, Bun runtime.</Text>
        <Box className="mt-4 flex-row gap-3">
          <Box className="rounded-md bg-primary px-4 py-2">
            <Text className="text-sm font-medium text-primary-foreground">Home</Text>
          </Box>
          <Box className="rounded-md border border-border bg-secondary px-4 py-2">
            <Text className="text-sm font-medium text-secondary-foreground">Projects</Text>
          </Box>
        </Box>
      </Box>
      <Box className="mt-4 flex-row gap-3">
        <Box className="rounded-lg border border-border bg-muted p-3 w-44">
          <Text className="text-sm font-semibold text-foreground">Route manifest</Text>
          <Text className="mt-2 text-xs text-muted-foreground">app/page.tsx -> /</Text>
          <Text className="mt-1 text-xs text-muted-foreground">app/projects/[id]/page.tsx</Text>
        </Box>
        <Box className="rounded-lg border border-ring bg-accent p-3 w-44">
          <Text className="text-sm font-semibold text-accent-foreground">Focus restore</Text>
          <Text className="mt-2 text-xs text-muted-foreground">router.push() queues route focus.</Text>
        </Box>
      </Box>
    </Page>
  )
}
