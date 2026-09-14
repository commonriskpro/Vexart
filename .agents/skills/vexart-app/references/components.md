# Vexart Component Catalog

All components are imported directly from `"vexart"`.

## 1. Void Styled Components (Theme-Aware)

Pre-styled with the Void dark-mode design system.

### Cards
```tsx
<box width={360}>
  <VoidCard>
    <VoidCardHeader>
      <VoidCardTitle>Server Metrics</VoidCardTitle>
      <VoidCardDescription>Live telemetry from cluster</VoidCardDescription>
    </VoidCardHeader>
    <VoidCardContent>
      <box direction="column" gap={8}>
        <text color={colors.foreground}>CPU: 24%</text>
        <text color={colors.foreground}>RAM: 4.1 / 16 GB</text>
      </box>
    </VoidCardContent>
    <VoidCardFooter>
      <VoidButton size="sm" variant="outline">Restart</VoidButton>
      <VoidButton size="sm" variant="default">Details</VoidButton>
    </VoidCardFooter>
  </VoidCard>
</box>
```

### Buttons
```tsx
// Variants: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
// Sizes: "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg"
<VoidButton variant="default" size="default" onPress={() => console.log("Clicked")}>
  Save Changes
</VoidButton>
```

### Inputs & Forms
```tsx
// Single line text input
<VoidInput
  value={query()}
  onChange={setQuery}
  placeholder="Search services..."
  width={280}
/>

// Multi-line editor
<VoidTextarea
  value={code()}
  onChange={setCode}
  height={120}
  width="100%"
  placeholder="Write note here..."
/>

// Dropdown Select
<VoidSelect
  value={selected()}
  onChange={setSelected}
  options={[
    { label: "Production", value: "prod" },
    { label: "Staging", value: "stage" },
  ]}
  width={200}
/>

// Checkbox & Switch
<VoidCheckbox checked={agreed()} onChange={setAgreed} label="Accept terms" />
<VoidSwitch checked={enabled()} onChange={setEnabled} label="Dark Mode" />

// Slider
<VoidSlider value={volume()} onChange={setVolume} min={0} max={100} step={1} width={200} />
```

### Navigation & Overlays
```tsx
// Tabs
<VoidTabs
  activeTab={activeTab()}
  onTabChange={setActiveTab}
  tabs={[
    { label: "Overview", content: () => <text>Overview</text> },
    { label: "Logs", content: () => <text>Logs</text> },
  ]}
/>

// Dialog Modal (mounted conditionally with SolidJS <Show>)
<Show when={isOpen()}>
  <VoidDialog onClose={() => setIsOpen(false)}>
    <VoidDialog.Title>Confirm Deletion</VoidDialog.Title>
    <VoidDialog.Description>This action cannot be reversed.</VoidDialog.Description>
    <VoidDialog.Footer>
      <VoidButton variant="ghost" onPress={() => setIsOpen(false)}>Cancel</VoidButton>
      <VoidButton variant="destructive" onPress={handleDelete}>Delete</VoidButton>
    </VoidDialog.Footer>
  </VoidDialog>
</Show>

// Toast notifications
const toaster = createVoidToaster()
toaster.show("Deployment succeeded", { variant: "default" })
```

### Typography Presets
```tsx
<H1>Heading 1</H1>
<H2>Heading 2</H2>
<H3>Heading 3</H3>
<H4>Heading 4</H4>
<P>Standard paragraph body text.</P>
<Lead>Prominent introduction text.</Lead>
<Small>Fine print text.</Small>
<Muted>Secondary muted text.</Muted>
```

---

## 2. Headless Primitives

When complete visual customization is required, use unstyled headless components:

- `<Button renderButton={(ctx) => <box {...ctx.buttonProps}>...</box>} />`
- `<Select renderTrigger={...} renderOption={...} />`
- `<Tabs renderTab={...} renderTabBar={...} renderPanel={...} />`
- `<List renderItem={...} />`
- `<Table columns={cols} data={rows} renderCell={...} renderRow={...} />`
