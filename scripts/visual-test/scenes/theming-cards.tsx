import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@vexart/styled"
import { SceneFrame, SCENE_HEIGHT, SCENE_WIDTH } from "../helpers"

export const width = SCENE_WIDTH
export const height = SCENE_HEIGHT

export function Scene() {
  return (
    <SceneFrame title="Theming · Cards" subtitle="Composed styled surfaces">
      <box direction="row" gap={16}>
        <Card>
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>Production environment is healthy.</CardDescription>
          </CardHeader>
          <CardContent>
            <text color={0xe4e4e7ff} fontSize={13}>Latency 31ms · Error rate 0.02%</text>
          </CardContent>
          <CardFooter>
            <Button size="sm">Open</Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Canary release channel with staged rollout.</CardDescription>
          </CardHeader>
          <CardContent>
            <text color={0xe4e4e7ff} fontSize={13}>Traffic 18% · Build 1486616</text>
          </CardContent>
          <CardFooter>
            <Button size="sm" variant="secondary">Inspect</Button>
          </CardFooter>
        </Card>
      </box>
    </SceneFrame>
  )
}
