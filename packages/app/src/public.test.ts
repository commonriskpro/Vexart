import { expect, test } from "bun:test"
import * as api from "./public"
import * as barrelApi from "./barrel"

test("does not expose retired capitalized primitives", () => {
  expect("Box" in api).toBe(false)
  expect("Text" in api).toBe(false)
  expect("Box" in barrelApi).toBe(false)
  expect("Text" in barrelApi).toBe(false)
})
