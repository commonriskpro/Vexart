import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"

export const SHOWCASE_TAB2_W = 640
export const SHOWCASE_TAB2_H = 500

export function createShowcaseTab2Scene() {
  return box({
    width: SHOWCASE_TAB2_W,
    height: SHOWCASE_TAB2_H,
    backgroundColor: 0x0f1115ff,
    direction: "column",
    gap: 24,
    padding: 24,
  }, [
    box({ width: 540, height: 170, gradient: { type: "linear", from: 0x56d4c8ff, to: 0xdc2626ff, angle: 0 }, cornerRadius: 18 }, [
      box({ direction: "row", gap: 40, paddingTop: 14, paddingLeft: 24 }, [
        text("BLUR", { color: 0x000000ff, fontSize: 24, fontWeight: 700 }),
        text("TEST", { color: 0xffffffff, fontSize: 24, fontWeight: 700 }),
        text("SHARP", { color: 0x000000ff, fontSize: 24, fontWeight: 700 }),
      ]),
      box({
        width: 380,
        height: 72,
        backgroundColor: 0xffffff20,
        backdropBlur: 16,
        cornerRadius: 18,
        borderWidth: 1,
        borderColor: 0xffffff30,
        floating: "parent",
        floatOffset: { x: 80, y: 74 },
        alignX: "center",
        alignY: "center",
      }, [
        text("glass panel — content behind is blurred", { color: 0xfafafaff, fontSize: 14 }),
      ]),
    ]),
    box({ width: 300, height: 120, gradient: { type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }, cornerRadius: 14 }, [
      box({ direction: "row", gap: 30, paddingTop: 10, paddingLeft: 14 }, [
        text("VEXART", { color: 0x000000ff, fontSize: 20, fontWeight: 700 }),
        text("ENGINE", { color: 0xffffffff, fontSize: 20, fontWeight: 700 }),
      ]),
      box({
        width: 250,
        height: 50,
        backdropBlur: 12,
        backdropBrightness: 130,
        backdropSaturate: 160,
        backgroundColor: 0xffffff15,
        cornerRadius: 14,
        borderWidth: 1,
        borderColor: 0xffffff20,
        floating: "parent",
        floatOffset: { x: 24, y: 54 },
        alignX: "center",
        alignY: "center",
      }, [
        text("blur + bright + saturate combined", { color: 0xffffffff, fontSize: 12 }),
      ]),
    ]),
    box({
      gradient: { type: "linear", from: 0xff6b35ff, to: 0x00b4d8ff, angle: 0 },
      cornerRadius: 14,
      padding: 16,
      direction: "row",
      gap: 12,
      alignY: "center",
    }, [
      opacityBox(0.2, "0.2"),
      opacityBox(0.5, "0.5"),
      opacityBox(0.8, "0.8"),
      opacityBox(1.0, "1.0"),
    ]),
  ])
}

function box(props: TGEProps, kids: TGENode[] = []) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  kids.forEach((kid) => insertChild(node, kid))
  return node
}

function text(value: string, props: TGEProps = {}) {
  const node = createTextNode(value)
  node.props = props
  return node
}

function opacityBox(opacity: number, label: string) {
  return box({ width: 100, height: 50, backgroundColor: 0x1a1a2eff, cornerRadius: 10, opacity, alignX: "center", alignY: "center" }, [
    text(label, { color: 0xffffffff, fontSize: 12 }),
  ])
}
