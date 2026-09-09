import { describe, expect, it } from "bun:test"
import type {
  GridAreaPlacement,
  GridAutoFlow,
  GridBreadth,
  GridContentAlignment,
  GridFitContent,
  GridFr,
  GridItemAlignment,
  GridLineRef,
  GridMinMax,
  GridPercent,
  GridPlacement,
  GridTrack,
} from "./grid-types"
import type { TGEProps } from "./node-types"

const fixed: GridBreadth = 120
const percentage: GridPercent = { percent: 50 }
const fraction: GridFr = { fr: 1 }
const automatic: GridBreadth = "auto"
const minContent: GridBreadth = "min-content"
const maxContent: GridBreadth = "max-content"
const minmax: GridMinMax = { minmax: ["min-content", fraction] }
const fit: GridFitContent = { fitContent: percentage }
const repeated: GridTrack = {
  repeat: {
    count: "auto-fit",
    tracks: [{ size: minmax, before: ["content-start"], after: ["content-end"] }],
  },
}
const placement: GridPlacement = {
  start: { name: "content", occurrence: 2 },
  end: { span: 2, name: "content" },
}
const area: GridAreaPlacement = {
  rowStart: 1,
  columnStart: { name: "main" },
  rowEnd: { span: 2 },
  columnEnd: "auto",
}
const gridProps = {
  layout: "grid",
  gridTemplateColumns: [fixed, percentage, fraction, minmax, fit, repeated],
  gridTemplateRows: [{ size: 80, before: ["row-start"] }],
  gridAutoColumns: automatic,
  gridAutoRows: { fr: 1 },
  gridAutoFlow: "row-dense",
  gridTemplateAreas: [["header", null], ["main", "main"]],
  gridColumn: placement,
  gridRow: { start: 1, end: -1 },
  gridArea: area,
  alignContent: "space-evenly",
  justifyItems: "center",
  justifySelf: "end",
  alignSelf: "stretch",
  justifyContent: "flex-end",
  alignItems: "top",
} satisfies TGEProps

const breadths: readonly GridBreadth[] = [automatic, minContent, maxContent]

const readonlyTracks: readonly GridTrack[] = [fixed, minmax]
// @ts-expect-error Grid arrays are replaced, never mutated in place.
if (false) readonlyTracks.push(20)
// @ts-expect-error Grid arrays are readonly at the element level too.
if (false) readonlyTracks[0] = 20
// @ts-expect-error The minmax tuple is readonly.
if (false) minmax.minmax[0] = 20
// @ts-expect-error A CSS string is not a GridBreadth in the terminal profile.
const unknownBreadth: GridBreadth = "fit-content(20px)"
// @ts-expect-error Repeat is a GridTrack, not a GridTrackSize/implicit size.
const invalidAutoColumn: TGEProps["gridAutoColumns"] = { repeat: { count: 2, tracks: [20] } }
// @ts-expect-error Unknown track object shapes are rejected by the static contract.
const unknownTrack: GridTrack = { mystery: true }
// @ts-expect-error Placement has only start/end; runtime ambiguity belongs to G-007.
const unknownPlacement: GridPlacement = { row: 1 }

const contentAlignments: readonly GridContentAlignment[] = [
  "start", "end", "center", "space-between", "space-around", "space-evenly", "stretch",
]
const itemAlignments: readonly GridItemAlignment[] = ["start", "end", "center", "stretch"]
const autoFlows: readonly GridAutoFlow[] = ["row", "column", "row-dense", "column-dense"]
const lineRefs: readonly GridLineRef[] = [1, -1, { name: "main" }, { span: 2 }]

describe("Grid beta type contract", () => {
  it("accepts every closed public union form", () => {
    expect(gridProps.layout).toBe("grid")
    expect(readonlyTracks).toHaveLength(2)
    expect(breadths).toHaveLength(3)
    expect(contentAlignments).toHaveLength(7)
    expect(itemAlignments).toHaveLength(4)
    expect(autoFlows).toHaveLength(4)
    expect(lineRefs).toHaveLength(4)
  })

  it("keeps runtime-only numeric validation out of the type layer", () => {
    const zeroFr: GridFr = { fr: 0 }
    const negativePercent: GridPercent = { percent: -1 }
    expect(zeroFr.fr).toBe(0)
    expect(negativePercent.percent).toBe(-1)
  })
})
