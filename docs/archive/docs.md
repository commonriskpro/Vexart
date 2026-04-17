> **⚠️ ARCHIVED — Pre-implementation planning document. All gaps identified below have been resolved.**
> For current state, see AGENTS.md, docs/ folder, and manual/developer-guide.md.

K, sentémonos a hacer este ejercicio de verdad. Voy a ponerme en la cabeza de un web dev que sabe HTML + CSS + React + Tailwind y se sienta a usar TGE por primera vez. ¿Qué sabe, qué espera, y dónde se choca?
El modelo mental de un web dev
Un web dev piensa en 5 capas:
1. ESTRUCTURA  →  HTML tags (div, span, section, button, input, img...)
2. ESTILOS     →  CSS properties (aplicados via className, style, o Tailwind)
3. INTERACCIÓN →  Event handlers (onClick, onHover, onChange, onFocus...)
4. ESTADO      →  React hooks (useState, useContext, useReducer...)
5. COMPOSICIÓN →  Component patterns (children, slots, render props, portals...)
Ahora mapeemos cada una a TGE y veamos dónde está la fricción:
Capa 1 — Estructura
Web dev sabe	TGE tiene	Fricción
<div> — container genérico	<box>	Baja — nombre distinto pero concepto idéntico
<span> / <p> — texto	<text>	Baja — similar
<button> — botón nativo	No hay intrinsic, solo <Button> component	Media — no hay <button> primitivo, tenés que importar el componente
<input> — campo de texto	<input> intrinsic	Baja — existe
<textarea> — multi-line	<textarea> intrinsic	Baja — existe
<img> — imagen	No existe	ALTA — no puede mostrar imágenes
<select> — dropdown	No existe	ALTA — no hay dropdown
<a> — link	No existe	Media — no hay concepto de navegación
<form> — formulario	No existe	Media — no hay form wrapper
<ul>/<li> — listas	<List> component	Baja
<table> — tablas	No existe	ALTA — muy común en dashboards
<svg> — vector graphics	No existe	Media — no hay vector drawing
Veredicto: La estructura es RAZONABLE. <box> + <text> cubre el 80%. Los holes son <img>, <select>, <table>.
Capa 2 — Estilos (acá está el MAYOR gap)
Un web dev aplica estilos de 3 formas:
A) Tailwind classes (lo más popular hoy):
<div className="flex flex-row gap-4 p-6 bg-zinc-900 rounded-xl shadow-lg">
B) CSS-in-JS / style prop:
<div style={{ display: 'flex', gap: 16, padding: 24, backgroundColor: '#18181b', borderRadius: 12 }}>
C) CSS file con selectores:
.card { display: flex; gap: 1rem; padding: 1.5rem; background: #18181b; border-radius: 0.75rem; }
TGE hoy:
<box direction="row" gap={16} padding={24} backgroundColor={0x18181bff} cornerRadius={12}>
Las fricciones ESPECÍFICAS:
Web dev escribe	TGE necesita	Fricción
backgroundColor: "#18181b"	backgroundColor={0x18181bff}	ALTA — nadie piensa en hex como u32. Pero strings YA funcionan, es que los tokens usan u32
borderRadius: 12	cornerRadius={12}	MEDIA — nombre distinto, mismo concepto
boxShadow: "0 4px 12px rgba(0,0,0,0.3)"	shadow={{ x: 0, y: 4, blur: 12, color: 0x0000004d }}	MEDIA — objeto en vez de string, pero más type-safe
display: "flex"	implícito (todo es flex)	BAJA — uno menos que recordar
flexDirection: "row"	direction="row"	BAJA — alias flexDirection ya existe
justifyContent: "center"	alignX="center"	BAJA — alias justifyContent ya existe
padding: "16px 24px"	paddingY={16} paddingX={24}	MEDIA — no hay shorthand padding={[16, 24]}
opacity: 0.5	No existe	ALTA
transition: "all 0.2s ease"	No existe	ALTA
cursor: "pointer"	No existe	MEDIA
background: "linear-gradient(to right, #f00, #ff0, #0f0)"	gradient={{ type: "linear", from: 0xff0000ff, to: 0x00ff00ff }}	MEDIA — solo 2 stops, no 3+
overflow: "hidden"	implícito (todo está clipped)	BAJA
position: "absolute"	floating="parent"	MEDIA — nombre distinto
transform: "scale(1.1)"	No existe	ALTA
backdropFilter: "blur(12px)"	backdropBlur={12}	BAJA — más simple que CSS incluso
boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)"	No existe	ALTA
Capa 3 — Interacción
Web dev escribe	TGE tiene	Fricción
onClick	onMouseDown / useFocus + onKeyDown	MEDIA — no hay onClick unificado
onMouseEnter/Leave	hoverStyle (declarativo)	BAJA — incluso mejor que web
:hover / :active CSS	hoverStyle / activeStyle	BAJA — genial
:focus CSS	No existe	ALTA — focus system existe pero sin focusStyle
onChange (input)	onChange	BAJA — igual
onScroll	Clay scroll tracking	BAJA
tabIndex	focusId	MEDIA — nombre distinto
Drag and drop	No existe	ALTA
Capa 4 — Estado
Web dev sabe	TGE tiene	Fricción
useState	createSignal	MEDIA — SolidJS, no React. API diferente
useEffect	createEffect	MEDIA — misma cosa
useContext	No re-exportado	ALTA — existe en SolidJS pero TGE no lo expone
useRef	createHandle / ref prop	BAJA
useMemo	createMemo	BAJA
Redux / Zustand	No existe	MEDIA — SolidJS signals son suficientes para muchos casos
React Query	No existe	ALTA para apps con data fetching
Capa 5 — Composición
Web dev sabe	TGE tiene	Fricción
children	props.children	BAJA — igual
{condition && <Component>}	<Show when={}>	MEDIA — SolidJS control flow
.map() → elements	<For each={}>	MEDIA — SolidJS control flow
createPortal	<Portal>	BAJA — existe
Slots / render props	createSlotRegistry	MEDIA
Error boundaries	<ErrorBoundary>	BAJA — existe
---
Las 7 fricciones que hay que resolver
Ordenadas por cuántos devs afectan y cuán rápido se pueden arruinar la primera impresión:
1. Los colores se ven alienígenas
Impacto: MASIVO — es lo PRIMERO que un dev escribe.
// Un web dev escribe esto instintivamente:
backgroundColor="#18181b"         // ← esto YA funciona en TGE!
// Pero los tokens de void devuelven esto:
colors.card  // → 0x171717ff     // ← el dev ve un u32 y dice "qué es esto?"
El problema no es la API, es que los tokens exportan u32. Si colors.card devolviera "#171717" o un objeto con .toString() que da el hex, el dev se siente en casa.
2. Naming inconsistente con CSS
Impacto: ALTO — el dev tiene que googlear cada prop.
Los aliases ya existen (justifyContent, alignItems, flexDirection) pero el NOMBRE PRIMARIO de las props no es CSS. Un dev que lee código TGE de otro ve alignX, cornerRadius, direction y no sabe inmediatamente qué son.
Fix: Hacer que los nombres CSS sean los primarios y los actuales sean aliases. O al menos que la documentación y los ejemplos usen los nombres CSS.
3. No hay onClick unificado
Impacto: ALTO — todo dev quiere hacer click en algo.
Un web dev escribe onClick={() => doSomething()}. En TGE tiene que entender focus, useFocus, onKeyDown, onMouseDown por separado. Es demasiada ceremonia para "cuando hacen click, ejecutá esto".
Fix: Prop onPress unificado que funcione con mouse click + Enter/Space.
4. No hay style prop
Impacto: MEDIO — los devs quieren crear objetos de estilo reutilizables.
// Web dev instinto:
const glass = { backdropFilter: "blur(12px)", background: "rgba(255,255,255,0.1)" }
<div style={glass} />
// TGE hoy — no hay forma de hacer esto sin spread manual:
<box {...glass} />  // funciona pero no es idiomático
Fix: Prop style que mergea con props directas.
5. SolidJS en vez de React
Impacto: MEDIO — createSignal en vez de useState, <Show> en vez de ternario, <For> en vez de .map().
No hay fix — SolidJS es fundamental para el performance de TGE (no VDOM). Pero podemos minimizar la fricción con buena documentación y ejemplos que muestren el equivalente React → SolidJS para cada patrón.
6. No hay useContext / Provider
Impacto: ALTO — bloquea theming, dependency injection, todo.
Fix: Re-exportar de SolidJS. Literal 1 línea.
7. No hay transition/animation
Impacto: ALTO — sin esto la UI se siente "rota" para un web dev acostumbrado a Framer Motion / CSS transitions.
Fix: Animation system (ya en roadmap).
---
Plan de acción — "Web Dev Friendly TGE"
Esto es lo que haría en orden de impacto:
SEMANA 1 — "Primera impresión impecable"
├── Re-exportar createContext/useContext de SolidJS         [1 hora]
├── Tokens exporten strings: colors.card → "#171717"        [medio día]
│   (internamente se parsean a u32 como siempre)
├── borderRadius como nombre primario (cornerRadius alias)  [1 hora]
├── boxShadow como nombre primario (shadow alias)           [1 hora]
├── onPress prop unificado (mouse + keyboard)               [medio día]
├── focusStyle prop (como hoverStyle/activeStyle)            [medio día]
├── style prop que mergea con props directas                 [medio día]
├── opacity prop                                             [medio día]
└── Padding shorthand: padding={[16, 24]} → Y, X            [2 horas]
SEMANA 2 — "Se siente como web"
├── Zig Batch 1: multi-stop gradient, conic, inset shadow   [3 días]
├── Animation primitives (createTransition, createSpring)    [2 días]
SEMANA 3 — "Puedo construir apps reales"
├── Select/Dropdown component                                [1 día]
├── Table component                                          [1 día]
├── Switch/Toggle component                                  [2 horas]
├── Dialog/Modal (sobre Portal)                              [medio día]
├── Toast system                                             [1 día]
└── Image component                                          [1 día]
Después de esas 3 semanas, un web dev se sienta y puede hacer:
import { createSignal } from "tge"
import { Button, Card, Select, Dialog, Input } from "tge/void"
import { colors } from "tge/void"
function App() {
  const [name, setName] = createSignal("")
  
  return (
    <box style={{ padding: 24, gap: 16, backgroundColor: colors.background }}>
      <Card>
        <Input value={name()} onChange={setName} placeholder="Your name" />
        <Select options={["Option A", "Option B"]} />
        <Button onPress={() => console.log(name())}>Submit</Button>
      </Card>
    </box>
  )
}
Y eso le va a resultar COMPLETAMENTE natural. ¿Se entiende la visión?
¿Qué te parece? ¿Querés que arranquemos por Semana 1? Son los cambios más chicos pero los que más impacto tienen en la primera impresión.