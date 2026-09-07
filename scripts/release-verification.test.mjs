import { strictEqual, throws } from "node:assert"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  assertRegistryResponse,
  assertReleaseArtifacts,
  nativePackages,
  publishedPackages,
  RegistryPropagationError,
  RegistryVerificationError,
  resolveReleaseVersion,
} from "./release-verification.mjs"

async function writeArtifactFixture(root, { version = "0.9.0-beta.22", optionalVersion = version } = {}) {
  const dist = join(root, "dist")
  await mkdir(dist, { recursive: true })
  await writeFile(join(dist, "package.json"), JSON.stringify({
    name: "vexart",
    version,
    license: "SEE LICENSE IN LICENSE",
    optionalDependencies: Object.fromEntries(nativePackages.map(({ name }) => [name, optionalVersion])),
  }))
  await writeFile(join(dist, "LICENSE"), "license")
  await Promise.all(nativePackages.map(async ({ name, platform, binary }) => {
    const dir = join(dist, "platform", platform)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "package.json"), JSON.stringify({ name, version, license: "SEE LICENSE IN LICENSE" }))
    await writeFile(join(dir, binary), "native")
    await writeFile(join(dir, "LICENSE"), "license")
  }))
}

test("tag releases must match the root package version", () => {
  strictEqual(resolveReleaseVersion({
    packageVersion: "0.9.0-beta.22",
    refType: "tag",
    refName: "v0.9.0-beta.22",
  }), "0.9.0-beta.22")

  strictEqual(resolveReleaseVersion({
    packageVersion: "0.9.0-beta.22",
    refType: "branch",
    refName: "main",
  }), "0.9.0-beta.22")

  throws(
    () => resolveReleaseVersion({
      packageVersion: "0.9.0-beta.22",
      refType: "tag",
      refName: "v0.9.0-beta.21",
    }),
    /does not match root package\.json version/,
  )
})

test("release artifact validation accepts a complete matching fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-release-"))
  try {
    await writeArtifactFixture(root)
    assertReleaseArtifacts({ root, expectedVersion: "0.9.0-beta.22" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("release artifact validation reports a missing artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-release-"))
  try {
    const dist = join(root, "dist")
    await mkdir(dist, { recursive: true })
    await writeFile(join(dist, "package.json"), JSON.stringify({
      name: "vexart",
      version: "0.9.0-beta.22",
      license: "SEE LICENSE IN LICENSE",
      optionalDependencies: Object.fromEntries(nativePackages.map(({ name }) => [name, "0.9.0-beta.22"])),
    }))
    throws(
      () => assertReleaseArtifacts({ root, expectedVersion: "0.9.0-beta.22" }),
      /missing release artifact/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("release artifact validation rejects a platform version mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-release-"))
  try {
    await writeArtifactFixture(root)
    const platformPackage = join(root, "dist", "platform", "darwin-arm64", "package.json")
    const packageJson = JSON.parse(await readFile(platformPackage, "utf8"))
    packageJson.version = "0.9.0-beta.21"
    await writeFile(platformPackage, JSON.stringify(packageJson))
    throws(
      () => assertReleaseArtifacts({ root, expectedVersion: "0.9.0-beta.22" }),
      /has version 0\.9\.0-beta\.21; expected 0\.9\.0-beta\.22/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("release artifact validation rejects an optional dependency version mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-release-"))
  try {
    await writeArtifactFixture(root, { optionalVersion: "0.9.0-beta.21" })
    throws(
      () => assertReleaseArtifacts({ root, expectedVersion: "0.9.0-beta.22" }),
      /optional dependency .* is not 0\.9\.0-beta\.22/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("registry validation rejects an exact-version or latest mismatch", () => {
  const response = Object.fromEntries(publishedPackages.map((name) => [name, {
    version: "0.9.0-beta.22",
    latest: "0.9.0-beta.22",
  }]))
  response.vexart.version = "0.9.0-beta.21"

  try {
    assertRegistryResponse({ expectedVersion: "0.9.0-beta.22", response })
  } catch (error) {
    strictEqual(error instanceof RegistryVerificationError, true)
    return
  }

  throw new Error("expected registry mismatch to fail")
})

test("registry validation requires latest to point to the release", () => {
  const response = Object.fromEntries(publishedPackages.map((name) => [name, {
    version: "0.9.0-beta.22",
    latest: "0.9.0-beta.21",
  }]))

  try {
    assertRegistryResponse({ expectedVersion: "0.9.0-beta.22", response })
  } catch (error) {
    strictEqual(error instanceof RegistryVerificationError, true)
    return
  }

  throw new Error("expected latest dist-tag mismatch to fail")
})

test("registry validation accepts all exact versions and latest dist-tags", () => {
  const response = Object.fromEntries(publishedPackages.map((name) => [name, {
    version: "0.9.0-beta.22",
    latest: "0.9.0-beta.22",
  }]))
  assertRegistryResponse({ expectedVersion: "0.9.0-beta.22", response })
})

test("registry validation marks a missing package as propagation", () => {
  const response = Object.fromEntries(publishedPackages.map((name) => [name, {
    version: "0.9.0-beta.22",
    latest: "0.9.0-beta.22",
  }]))
  delete response.vexart

  try {
    assertRegistryResponse({ expectedVersion: "0.9.0-beta.22", response })
  } catch (error) {
    strictEqual(error instanceof RegistryPropagationError, true)
    return
  }

  throw new Error("expected missing registry package to be retryable")
})
