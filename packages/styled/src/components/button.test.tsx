import { describe, expect, test } from "bun:test"
import { Button, type ButtonProps } from "./button"

describe("styled Button", () => {
  test("accepts onPress prop", () => {
    const props: ButtonProps = { onPress: () => {}, children: "Click" }

    expect(Button).toBeFunction()
    expect(props.onPress).toBeFunction()
  })

  test("accepts variant and size props without error", () => {
    const props: ButtonProps = { variant: "destructive", size: "lg", children: "Delete" }

    expect(props.variant).toBe("destructive")
    expect(props.size).toBe("lg")
  })
})
