import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

export const nativePackages = [
  { name: "@vexart-native/darwin-arm64", platform: "darwin-arm64", binary: "libvexart.dylib" },
  { name: "@vexart-native/linux-x64", platform: "linux-x64", binary: "libvexart.so" },
  { name: "@vexart-native/linux-arm64", platform: "linux-arm64", binary: "libvexart.so" },
]

export const publishedPackages = [...nativePackages.map(({ name }) => name), "vexart"]

/** Resolve the version used by both native artifacts and the main package. */
export function resolveReleaseVersion({ packageVersion, refType = "", refName = "" }) {
  if (typeof packageVersion !== "string" || packageVersion.length === 0 || /\s/.test(packageVersion)) {
    throw new Error("package.json must contain a non-empty version")
  }

  if (refType !== "tag") return packageVersion

  if (!refName.startsWith("v") || refName.length === 1) {
    throw new Error(`release tag must use the v<version> form (received ${refName || "empty"})`)
  }

  const tagVersion = refName.slice(1)
  if (tagVersion !== packageVersion) {
    throw new Error(`release tag v${tagVersion} does not match root package.json version ${packageVersion}`)
  }

  return tagVersion
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`unable to read JSON artifact ${path}: ${error.message}`)
  }
}

function assertVersion(path, packageName, expectedVersion) {
  if (!existsSync(path)) throw new Error(`missing release artifact: ${path}`)
  const pkg = readJson(path)
  if (pkg.name !== packageName) {
    throw new Error(`artifact ${path} has package name ${pkg.name || "<missing>"}; expected ${packageName}`)
  }
  if (pkg.version !== expectedVersion) {
    throw new Error(`artifact ${path} has version ${pkg.version || "<missing>"}; expected ${expectedVersion}`)
  }
  if (pkg.license !== "SEE LICENSE IN LICENSE") {
    throw new Error(`artifact ${path} has inconsistent license metadata: ${pkg.license || "<missing>"}`)
  }
}

/** Check every package manifest and native payload before the first npm publish. */
export function assertReleaseArtifacts({ root = process.cwd(), expectedVersion }) {
  if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
    throw new Error("expected release version is required")
  }

  const dist = resolve(root, "dist")
  assertVersion(resolve(dist, "package.json"), "vexart", expectedVersion)

  const main = readJson(resolve(dist, "package.json"))
  for (const { name, platform, binary } of nativePackages) {
    const dir = resolve(dist, "platform", platform)
    assertVersion(resolve(dir, "package.json"), name, expectedVersion)
    if (!existsSync(resolve(dir, binary))) throw new Error(`missing release artifact: ${resolve(dir, binary)}`)
    if (!existsSync(resolve(dir, "LICENSE"))) throw new Error(`missing release artifact: ${resolve(dir, "LICENSE")}`)
    if (main.optionalDependencies?.[name] !== expectedVersion) {
      throw new Error(`dist/package.json optional dependency ${name} is not ${expectedVersion}`)
    }
  }

  if (!existsSync(resolve(dist, "LICENSE"))) throw new Error(`missing release artifact: ${resolve(dist, "LICENSE")}`)
}

export class RegistryPropagationError extends Error {
  retryable = true
}

export class RegistryVerificationError extends Error {
  retryable = false
}

function parseJsonOutput(output, description) {
  try {
    return JSON.parse(output.trim())
  } catch (error) {
    throw new RegistryVerificationError(`npm view returned invalid JSON for ${description}: ${error.message}`)
  }
}

function isNotFound(output) {
  return /(?:E404|404|not found|does not exist)/i.test(output)
}

function npmView(args, description) {
  const result = spawnSync("npm", ["view", ...args, "--json"], { encoding: "utf8" })
  if (result.error) throw new RegistryVerificationError(`npm view failed for ${description}: ${result.error.message}`)
  if (result.status !== 0) {
    const details = `${result.stdout || ""}\n${result.stderr || ""}`.trim()
    if (isNotFound(details)) throw new RegistryPropagationError(`registry has not propagated ${description}`)
    throw new RegistryVerificationError(`npm view failed for ${description}: ${details || `exit ${result.status}`}`)
  }
  return parseJsonOutput(result.stdout || "", description)
}

/**
 * Verify a captured registry response. The `latest` check preserves the
 * existing release policy: every published package is intentionally tagged
 * `latest`, and latest must point at this exact release.
 */
export function assertRegistryResponse({ expectedVersion, response }) {
  for (const packageName of publishedPackages) {
    const entry = response?.[packageName]
    if (!entry) throw new RegistryPropagationError(`registry response is missing ${packageName}`)
    if (entry.version !== expectedVersion) {
      throw new RegistryVerificationError(`${packageName} resolved to ${entry.version || "<missing>"}; expected ${expectedVersion}`)
    }
    if (entry.latest === undefined) throw new RegistryPropagationError(`registry has not propagated the latest dist-tag for ${packageName}`)
    if (entry.latest !== expectedVersion) {
      throw new RegistryVerificationError(`${packageName} latest dist-tag is ${entry.latest || "<missing>"}; expected ${expectedVersion}`)
    }
  }
}

export function verifyRegistry(expectedVersion) {
  const response = Object.fromEntries(publishedPackages.map((packageName) => {
    const version = npmView([`${packageName}@${expectedVersion}`, "version"], `${packageName}@${expectedVersion}`)
    const tags = npmView([packageName, "dist-tags"], `${packageName} dist-tags`)
    return [packageName, { version, latest: tags?.latest }]
  }))
  assertRegistryResponse({ expectedVersion, response })
}

function packageVersion(root) {
  return readJson(resolve(root, "package.json")).version
}

function main() {
  const [command, value] = process.argv.slice(2)
  const root = process.cwd()

  if (command === "version") {
    console.log(resolveReleaseVersion({
      packageVersion: packageVersion(root),
      refType: process.env.GITHUB_REF_TYPE,
      refName: process.env.GITHUB_REF_NAME,
    }))
    return
  }

  if (command === "artifacts") {
    assertReleaseArtifacts({ root, expectedVersion: value })
    console.log(`release artifacts verified for ${value}`)
    return
  }

  if (command === "registry") {
    verifyRegistry(value)
    console.log(`registry versions and latest dist-tags verified for ${value}`)
    return
  }

  throw new Error("usage: release-verification.mjs <version|artifacts|registry> [version]")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = error.retryable ? 2 : 1
  }
}
