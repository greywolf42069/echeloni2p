/**
 * Eepsite Export Utility
 * 
 * Zips a full eepsite project (FileTree) and triggers
 * a browser download. One tap, full source code out.
 * 
 * Uses JSZip for compression + file-saver for the download.
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Eepsite, FileTree, FileContent } from '../types';

/**
 * Recursively add a FileTree to a JSZip folder.
 */
function addTreeToZip(zip: JSZip, tree: FileTree, path: string = ''): void {
  for (const [name, value] of Object.entries(tree)) {
    const fullPath = path ? `${path}/${name}` : name;

    if (isFileContent(value)) {
      // It's a file — add content
      zip.file(fullPath, value.content);
    } else {
      // It's a folder — recurse
      addTreeToZip(zip, value, fullPath);
    }
  }
}

/**
 * Type guard: check if a FileTree node is a file (has .content).
 */
function isFileContent(node: FileTree | FileContent): node is FileContent {
  return typeof node === 'object' && node !== null && 'content' in node && typeof (node as FileContent).content === 'string';
}

/**
 * Generate a safe filename from eepsite name.
 * Strips .i2p suffix and sanitizes special chars.
 */
function safeFilename(name: string): string {
  return name
    .replace(/\.i2p$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'eepsite';
}

/**
 * Export an eepsite as a ZIP file and trigger browser download.
 * 
 * @param eepsite - The eepsite to export
 * @param includeGitHistory - If true, also includes a git-log.json with commit history
 */
export async function exportEepsiteAsZip(
  eepsite: Eepsite,
  includeGitHistory: boolean = false
): Promise<void> {
  const zip = new JSZip();

  // Root folder named after the eepsite
  const rootFolder = zip.folder(safeFilename(eepsite.name))!;

  // Add all source files
  if (eepsite.files && Object.keys(eepsite.files).length > 0) {
    addTreeToZip(rootFolder, eepsite.files);
  } else {
    // Empty project — add a placeholder
    rootFolder.file('index.html', '<!DOCTYPE html>\n<html><body><h1>My Eepsite</h1></body></html>');
  }

  // Add metadata
  const metadata = {
    name: eepsite.name,
    id: eepsite.id,
    exportedAt: new Date().toISOString(),
    status: eepsite.status,
    createdAt: eepsite.createdAt instanceof Date
      ? eepsite.createdAt.toISOString()
      : String(eepsite.createdAt),
    fileCount: countFiles(eepsite.files),
  };
  rootFolder.file('.echelon-meta.json', JSON.stringify(metadata, null, 2));

  // Optionally include git history
  if (includeGitHistory && eepsite.git?.commits?.length) {
    const gitLog = eepsite.git.commits.map(commit => ({
      id: commit.id,
      message: commit.message,
      timestamp: commit.timestamp instanceof Date
        ? commit.timestamp.toISOString()
        : String(commit.timestamp),
      author: commit.author || 'echelon-user',
    }));
    rootFolder.file('.git-log.json', JSON.stringify(gitLog, null, 2));
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger download
  const filename = `${safeFilename(eepsite.name)}.zip`;
  saveAs(blob, filename);
}

/**
 * Export ALL eepsites as a single ZIP.
 * Each eepsite gets its own subfolder.
 */
export async function exportAllEepsitesAsZip(
  eepsites: Eepsite[]
): Promise<void> {
  if (eepsites.length === 0) return;

  const zip = new JSZip();

  for (const eepsite of eepsites) {
    const folder = zip.folder(safeFilename(eepsite.name))!;

    if (eepsite.files && Object.keys(eepsite.files).length > 0) {
      addTreeToZip(folder, eepsite.files);
    }

    // Metadata per eepsite
    folder.file('.echelon-meta.json', JSON.stringify({
      name: eepsite.name,
      id: eepsite.id,
      status: eepsite.status,
      exportedAt: new Date().toISOString(),
    }, null, 2));
  }

  // Add manifest
  zip.file('manifest.json', JSON.stringify({
    exportedAt: new Date().toISOString(),
    eepsites: eepsites.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      fileCount: countFiles(e.files),
    })),
  }, null, 2));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  saveAs(blob, `echelon-eepsites-${Date.now()}.zip`);
}

/**
 * Count total files in a FileTree.
 */
function countFiles(tree: FileTree | undefined): number {
  if (!tree) return 0;
  let count = 0;
  for (const value of Object.values(tree)) {
    if (isFileContent(value)) {
      count++;
    } else {
      count += countFiles(value);
    }
  }
  return count;
}

/**
 * Export a single file from an eepsite.
 * Useful for the code editor "download file" action.
 */
export async function exportSingleFile(
  eepsiteName: string,
  filePath: string,
  content: string
): Promise<void> {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const filename = filePath.split('/').pop() || 'file.txt';
  saveAs(blob, filename);
}
