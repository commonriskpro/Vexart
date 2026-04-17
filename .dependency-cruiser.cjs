/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No circular dependencies allowed (REQ-PB-004)",
      from: {},
      to: { circular: true },
    },
    {
      name: "engine-no-upward",
      severity: "error",
      comment: "@vexart/engine must not import from higher layers (REQ-PB-004)",
      from: { path: "^packages/engine/src/" },
      to: { path: "^packages/(primitives|headless|styled)/src/" },
    },
    {
      name: "primitives-no-upward",
      severity: "error",
      comment: "@vexart/primitives must not import from higher layers (REQ-PB-004)",
      from: { path: "^packages/primitives/src/" },
      to: { path: "^packages/(headless|styled)/src/" },
    },
    {
      name: "headless-no-upward",
      severity: "error",
      comment: "@vexart/headless must not import from higher layers (REQ-PB-004)",
      from: { path: "^packages/headless/src/" },
      to: { path: "^packages/styled/src/" },
    },
    // no-relative-cross-package: genuine relative (../../) imports that resolve into
    // a DIFFERENT package. Excludes tsconfig-path-resolved bare specifiers
    // (aliased-tsconfig-paths) which are the correct way to cross package boundaries.
    {
      name: "no-relative-cross-package-engine-from-primitives",
      severity: "error",
      comment: "No cross-package relative import: primitives → engine (REQ-PB-006)",
      from: { path: "^packages/primitives/src/" },
      to: {
        path: "^packages/engine/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-engine-from-headless",
      severity: "error",
      comment: "No cross-package relative import: headless → engine (REQ-PB-006)",
      from: { path: "^packages/headless/src/" },
      to: {
        path: "^packages/engine/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-engine-from-styled",
      severity: "error",
      comment: "No cross-package relative import: styled → engine (REQ-PB-006)",
      from: { path: "^packages/styled/src/" },
      to: {
        path: "^packages/engine/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-headless-from-styled",
      severity: "error",
      comment: "No cross-package relative import: styled → headless (REQ-PB-006)",
      from: { path: "^packages/styled/src/" },
      to: {
        path: "^packages/headless/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-primitives-from-headless",
      severity: "error",
      comment: "No cross-package relative import: headless → primitives (REQ-PB-006)",
      from: { path: "^packages/headless/src/" },
      to: {
        path: "^packages/primitives/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-primitives-from-styled",
      severity: "error",
      comment: "No cross-package relative import: styled → primitives (REQ-PB-006)",
      from: { path: "^packages/styled/src/" },
      to: {
        path: "^packages/primitives/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-relative-cross-package-any-from-devtools",
      severity: "error",
      comment: "No cross-package relative import: internal-devtools ↔ other packages (REQ-PB-006)",
      from: { path: "^packages/internal-devtools/src/" },
      to: {
        path: "^packages/(engine|primitives|headless|styled)/src/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased-tsconfig-paths"],
      },
    },
    {
      name: "no-same-layer-lateral",
      severity: "warn",
      comment:
        "Invariant during Phase 1; becomes operational when layer sibling packages are introduced (none planned)",
      from: {},
      to: { path: "^$" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules|dist|\\.d\\.ts$" },
    includeOnly: "^packages/",
  },
};
