import { expect, test } from "bun:test"
import * as api from "./public"

test("does not expose retired capitalized primitives", () => {
  expect("Box" in api).toBe(false)
  expect("Text" in api).toBe(false)
})
