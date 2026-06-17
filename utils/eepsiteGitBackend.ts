/**
 * Real .git backend for Echelon eepsites using isomorphic-git + LightningFS.
 *
 * Each eepsite gets its own isolated directory:
 *   /eepsites/<eepsiteId>/
 *      .git/
 *      index.html
 *      style.css
 *      ...
 *
 * This gives us actual git objects, history, status, etc. persisted in IndexedDB.
 *
 * Designed to be lazy-loaded (dynamic import) so the main bundle stays light.
 */

import type { FileTree, FileContent } from '../types';

let Git: typeof import('isomorphic-git') | null = null;
let LightningFS: any = null;
let fsInstance: any = null; // LightningFS instance (shared, namespaced by dir)

async function loadGitModules() {
    if (!Git || !LightningFS) {
        [Git, LightningFS] = await Promise.all([
            import('isomorphic-git'),
            import('@isomorphic-git/lightning-fs'),
        ]);
    }
    if (!fsInstance) {
        // One global FS for the whole app. Each eepsite uses its own dir prefix.
        const FS = LightningFS.default || LightningFS;
        fsInstance = new FS('echelon-git', {
            wipe: false,           // persist across reloads
            fileDbName: 'echelon-git-files',
            lockDbName: 'echelon-git-locks',
        });
    }
    return { git: Git!, fs: fsInstance };
}

export function getGitDir(eepsiteId: string): string {
    // Sanitize just in case
    const safe = eepsiteId.replace(/[^a-z0-9_-]/gi, '_');
    return `/eepsites/${safe}`;
}

/**
 * Initialize a real git repo for an eepsite if it doesn't exist.
 * Seeds it with the provided FileTree as the initial commit.
 */
export async function initEepsiteRepo(
    eepsiteId: string,
    initialFiles: FileTree,
    initialMessage = 'Initial commit from Echelon'
): Promise<void> {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);

    // Check if already initialized
    try {
        await git.log({ fs, dir, depth: 1 });
        return; // already has commits
    } catch {
        // not initialized yet
    }

    await git.init({ fs, dir });

    // Write all files into the working tree
    await writeFileTreeToFs(fs, dir, initialFiles);

    // Stage everything
    await git.add({ fs, dir, filepath: '.' });

    await git.commit({
        fs,
        dir,
        message: initialMessage,
        author: {
            name: 'Echelon User',
            email: 'user@echelon.local',
        },
    });
}

/**
 * Write a FileTree into the real FS (overwrites).
 */
async function writeFileTreeToFs(fs: any, dir: string, tree: FileTree, basePath = ''): Promise<void> {
    for (const [name, node] of Object.entries(tree)) {
        const fullPath = basePath ? `${basePath}/${name}` : name;
        if (node && typeof node === 'object' && 'content' in node) {
            const content = (node as FileContent).content;
            const filePath = `${dir}/${fullPath}`;
            // Ensure parent dirs exist (isomorphic-git doesn't auto-create)
            await ensureDir(fs, dir, fullPath);
            await fs.promises.writeFile(filePath, content, 'utf8');
        } else if (node && typeof node === 'object') {
            await writeFileTreeToFs(fs, dir, node as FileTree, fullPath);
        }
    }
}

async function ensureDir(fs: any, rootDir: string, relativePath: string) {
    const parts = relativePath.split('/').slice(0, -1); // remove filename
    let current = rootDir;
    for (const part of parts) {
        current = `${current}/${part}`;
        try {
            await fs.promises.mkdir(current);
        } catch (e: any) {
            if (e.code !== 'EEXIST') throw e;
        }
    }
}

/**
 * Read the current working tree back into a FileTree.
 */
export async function readWorkingTree(eepsiteId: string): Promise<FileTree> {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    return readDirRecursive(fs, dir, dir);
}

async function readDirRecursive(fs: any, rootDir: string, currentDir: string): Promise<FileTree> {
    const tree: FileTree = {};
    let entries: string[] = [];
    try {
        entries = await fs.promises.readdir(currentDir);
    } catch {
        return tree;
    }

    for (const name of entries) {
        if (name === '.git') continue;
        const fullPath = `${currentDir}/${name}`;
        const relativePath = fullPath.slice(rootDir.length + 1);

        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.isDirectory()) {
                tree[name] = await readDirRecursive(fs, rootDir, fullPath);
            } else {
                const content = await fs.promises.readFile(fullPath, 'utf8');
                tree[name] = { content: content as string };
            }
        } catch {
            // ignore bad entries
        }
    }
    return tree;
}

/** Real git commit using the current working tree. */
export async function commitEepsite(
    eepsiteId: string,
    message: string,
    author = { name: 'Echelon User', email: 'user@echelon.local' }
): Promise<string> {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);

    await git.add({ fs, dir, filepath: '.' });

    const oid = await git.commit({ fs, dir, message, author });
    return oid;
}

/** Check if a real repo exists for this eepsite. */
export async function hasRealRepo(eepsiteId: string): Promise<boolean> {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    try {
        await git.log({ fs, dir, depth: 1 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Write the current in-memory FileTree into the real git working tree.
 * Call this before commit to make sure latest editor changes are captured.
 */
export async function writeTreeToWorkingDirectory(eepsiteId: string, files: FileTree): Promise<void> {
    const { fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    await writeFileTreeToFs(fs, dir, files);
}

/**
 * Write a single file into the real git working tree.
 * Used for live sync so that `git status` and AI context stay accurate while editing.
 */
export async function writeSingleFileToWorkingDir(
    eepsiteId: string, 
    relativePath: string, 
    content: string
): Promise<void> {
    const { fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    const filePath = `${dir}/${relativePath}`;

    // Ensure parent directories exist
    const pathParts = relativePath.split('/');
    if (pathParts.length > 1) {
        let currentDir = dir;
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentDir = `${currentDir}/${pathParts[i]}`;
            try {
                await fs.promises.mkdir(currentDir);
            } catch (e: any) {
                if (e.code !== 'EEXIST') throw e;
            }
        }
    }

    await fs.promises.writeFile(filePath, content, 'utf8');
}

/** Get a clean list of recent commits suitable for UI (adapts real git log shape). */
export async function getCleanGitLog(eepsiteId: string, depth = 20) {
    const rawLog = await getEepsiteLog(eepsiteId, depth);
    return rawLog.map((entry: any) => ({
        oid: entry.oid,
        message: entry.commit?.message || 'No message',
        author: entry.commit?.author?.name || 'unknown',
        timestamp: entry.commit?.author?.timestamp ? entry.commit.author.timestamp * 1000 : Date.now(),
        short: entry.oid.slice(0, 7),
    }));
}

/** Get real commit history. */
export async function getEepsiteLog(eepsiteId: string, depth = 20) {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    try {
        return await git.log({ fs, dir, depth });
    } catch {
        return [];
    }
}

/** Get status (which files are modified). */
export async function getEepsiteStatus(eepsiteId: string) {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    try {
        const matrix = await git.statusMatrix({ fs, dir });
        const modified = matrix
            .filter(([, head, workdir]) => head !== workdir)
            .map(([filepath]) => filepath);
        return modified;
    } catch {
        return [];
    }
}

/** Checkout a specific commit (for restore). */
export async function checkoutCommit(eepsiteId: string, oid: string): Promise<void> {
    const { git, fs } = await loadGitModules();
    const dir = getGitDir(eepsiteId);
    await git.checkout({ fs, dir, ref: oid, force: true });
}
