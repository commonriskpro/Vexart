---
title: Examples
description: Runnable demos for every Vexart feature.
---

## Void Component Showcase

The showcase demonstrates every styled component in a tabbed interface:

```bash
bun run showcase
```

Tabs:

1. **Inputs** — VoidInput, VoidTextarea, VoidSelect, VoidCombobox, VoidCheckbox, VoidSwitch, VoidRadioGroup, VoidSlider
2. **Display** — Button (5 variants × 4 sizes), Badge, Avatar, Card, VoidProgress, Skeleton, Separator
3. **Collections** — VoidList, VoidTable, VoidScrollView
4. **Code & Docs** — VoidCode, VoidMarkdown, VoidDiff
5. **Overlays** — VoidDialog, Toast, VoidTooltip
6. **Typography** — H1–H4, P, Lead, Large, Small, Muted

## Writing Your Own App

```tsx
import { createApp, Box, Text } from "@vexart/app"
import { Button, Card, CardContent, colors, space } from "@vexart/styled"

function App() {
  return (
    <Box width="100%" height="100%" backgroundColor={colors.background}
      alignX="center" alignY="center">
      <Card>
        <CardContent>
          <Button onPress={() => console.log("clicked!")}>
            Hello Vexart
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}

await createApp(() => <App />)
```

Run with:

```bash
bun --conditions=browser run app.tsx
```
