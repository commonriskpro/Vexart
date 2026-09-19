/**
 * Flexily Node Tree
 *
 * Tree operations, hierarchy management, and transaction snapshotting for flexbox/grid layout.
 */
import { type FlexInfo } from "./types.js";
import type { GridCalculateResult, GridIntrinsicContribution, GridLayoutError } from "./grid/grid-model.js";
import type { GridIntrinsicCycleCache } from "./grid/grid-intrinsic-cycle.js";
import type { Node } from "./node-zero.js";
export type GridStateSnapshot = {
    readonly node: Node;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly flex: FlexInfo;
    readonly dirty: boolean;
    readonly hasNewLayout: boolean;
    readonly lastCalcW: number;
    readonly lastCalcH: number;
    readonly lastCalcDir: number;
    readonly gridCache: GridIntrinsicCycleCache | undefined;
    readonly gridContributions: readonly GridIntrinsicContribution[];
    readonly gridResult: GridCalculateResult | null;
    readonly gridError: GridLayoutError | null;
    readonly gridValidationError: GridLayoutError | null;
};
export declare function cloneGridCache(cache: GridIntrinsicCycleCache | undefined): GridIntrinsicCycleCache | undefined;
/**
 * Update the ancestor bit used to guard Grid error transactions.
 */
export declare function refreshGridDescendant(node: Node): void;
/**
 * Insert a child node at the specified index with cycle guard and sibling invalidation.
 */
export declare function insertChildNode(parent: Node, child: Node, index: number): void;
/**
 * Remove a child node from parent and invalidate sibling layout validity.
 */
export declare function removeChildNode(parent: Node, child: Node): boolean;
/**
 * Detach node from parent and children.
 */
export declare function freeNode(node: Node): void;
/**
 * Free root and all descendants iteratively to avoid stack overflow.
 */
export declare function freeRecursiveNode(root: Node): void;
/**
 * Reset this node to a clean initial state for reuse.
 */
export declare function resetNode(node: Node): void;
/**
 * Reset layout cache entries for a node and all its descendants.
 */
export declare function resetLayoutCacheTree(root: Node): void;
/**
 * Capture transaction state across all descendants for nested Grid error recovery.
 */
export declare function captureGridState(root: Node): GridStateSnapshot[];
/**
 * Restore transaction state across captured snapshots after a nested Grid error.
 */
export declare function restoreGridState(snapshots: readonly GridStateSnapshot[]): void;
/**
 * Check for any Grid errors in visible descendant nodes.
 */
export declare function findGridDescendantError(root: Node): GridLayoutError | null;
