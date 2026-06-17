/**
 * Lightweight .git-style version control for Echelon eepsites.
 *
 * Every eepsite project initializes with a real commit history.
 * This gives users proper version control inside the private IDE
 * without requiring a backend or heavy git engine (for now).
 *
 * Can be upgraded later to real isomorphic-git + LightningFS if needed.
 */

import type { Eepsite, FileContent, FileTree, GitCommit } from '../types.ts';

const shortId = () => Math.random().toString(36).slice(2, 10);

export function createInitialCommit(files: FileTree, message = 'Initial commit'): GitCommit {
    return {
        id: shortId(),
        message,
        timestamp: new Date(),
        filesSnapshot: JSON.parse(JSON.stringify(files)), // deep clone
        author: 'you',
    };
}

export function createCommit(
    currentFiles: FileTree,
    message: string,
    previousCommits: GitCommit[] = []
): GitCommit {
    return {
        id: shortId(),
        message: message.trim() || 'Update',
        timestamp: new Date(),
        filesSnapshot: JSON.parse(JSON.stringify(currentFiles)),
        author: 'you',
    };
}

/**
 * Returns the latest commit or undefined.
 */
export function getLatestCommit(commits: GitCommit[] = []): GitCommit | undefined {
    if (!commits.length) return undefined;
    return commits[commits.length - 1];
}

/**
 * Restores the FileTree from a specific commit.
 */
export function restoreFromCommit(commit: GitCommit): FileTree {
    return JSON.parse(JSON.stringify(commit.filesSnapshot));
}

/**
 * Checks whether there are uncommitted changes compared to the last commit.
 */
export function hasUncommittedChanges(
    currentFiles: FileTree,
    commits: GitCommit[] = []
): boolean {
    const latest = getLatestCommit(commits);
    if (!latest) return true;

    const currentStr = JSON.stringify(currentFiles);
    const lastStr = JSON.stringify(latest.filesSnapshot);
    return currentStr !== lastStr;
}

/**
 * Initializes a fresh git history for a new eepsite.
 */
export function initializeGitForNewEepsite(files: FileTree): { initialized: true; commits: GitCommit[] } {
    const initial = createInitialCommit(files, 'Initial commit from Echelon');
    return {
        initialized: true,
        commits: [initial],
    };
}

/**
 * Ensures an eepsite has git initialized. Used for backward compatibility
 * with eepsites created before the .git feature was added.
 */
export function ensureGitInitialized(eepsite: Eepsite): Eepsite {
    if (eepsite.git?.initialized) {
        return eepsite;
    }
    return {
        ...eepsite,
        git: initializeGitForNewEepsite(eepsite.files),
    };
}

/**
 * Returns a flat list of file paths that differ between current tree and the last commit.
 * Used for showing "modified" indicators in the file explorer.
 */
export function getModifiedPaths(currentFiles: FileTree, lastCommit?: GitCommit): string[] {
    if (!lastCommit) return [];

    const modified: string[] = [];

    const currentFlat = flattenFileTree(currentFiles);
    const lastFlat = flattenFileTree(lastCommit.filesSnapshot);

    const allPaths = new Set([...Object.keys(currentFlat), ...Object.keys(lastFlat)]);

    for (const path of allPaths) {
        if (currentFlat[path] !== lastFlat[path]) {
            modified.push(path);
        }
    }

    return modified;
}

function flattenFileTree(tree: FileTree, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, node] of Object.entries(tree)) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (node && typeof node === 'object' && 'content' in node) {
            out[path] = (node as FileContent).content;
        } else if (node && typeof node === 'object') {
            Object.assign(out, flattenFileTree(node as FileTree, path));
        }
    }
    return out;
}
