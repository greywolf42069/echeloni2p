import React, { useState, useEffect, useCallback } from 'react';
import type { Eepsite, Page, FileTree, FileContent } from '../../types';
import FileTreeComponent from '../editor/FileTree.tsx';
import EditorPanel from '../editor/EditorPanel.tsx';
import Card from '../ui/Card.tsx';
import Modal from '../ui/Modal.tsx';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import { publishEepsiteToDaemon, SyncDaemonError } from '../../hooks/syncDaemonClient.ts';
import { hasUncommittedChanges, createCommit, restoreFromCommit, ensureGitInitialized, getModifiedPaths } from '../../utils/git.ts';
import * as realGit from '../../utils/eepsiteGitBackend.ts';

// Icons for the UI
const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const BackIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
const PublishIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l-2 0m4 0l-2 0m13 0h-2M3 19h18M3 5h18M5 9l3 3-3 3M19 9l-3 3 3 3" /></svg>;


interface CodeEditorProps {
    activeEepsite: Eepsite | null;
    onUpdateFiles: (eepsiteId: string, newFiles: FileTree) => void;
    /** Full eepsite update (used for persisting git commits/history) */
    onUpdateEepsite?: (updated: Eepsite) => void;
    setPage: (page: Page) => void;
    showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const findFirstFile = (tree: FileTree): string | null => {
    for (const key in tree) {
        const node = tree[key];
        if ('content' in node) { // It's a file
            return key;
        } else { // It's a directory
            const nestedFile = findFirstFile(node);
            if (nestedFile) {
                // Fix: Added a '/' separator for constructing nested file paths correctly.
                return `${key}/${nestedFile}`;
            }
        }
    }
    return null;
};

// Fix: Rewrote function to be more type-safe and explicitly handle different node types (file vs. directory) during path traversal.
const getFileContent = (tree: FileTree, path: string): string | null => {
    const parts = path.split('/').filter(p => p);
    let currentNode: FileTree | FileContent | undefined = tree;
    for (const part of parts) {
        if (typeof currentNode !== 'object' || currentNode === null || 'content' in currentNode) {
            // Path tried to traverse through a file or invalid node
            return null;
        }
        currentNode = currentNode[part];
        if (currentNode === undefined) {
            return null; // Path segment not found
        }
    }

    if (currentNode && typeof currentNode === 'object' && 'content' in currentNode) {
        return (currentNode as FileContent).content;
    }

    return null; // Path pointed to a directory or was empty
};

const CodeEditor: React.FC<CodeEditorProps> = ({ activeEepsite, onUpdateFiles, onUpdateEepsite, setPage, showToast }) => {
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
    const [activeFileContent, setActiveFileContent] = useState<string>('');
    const [isDirty, setIsDirty] = useState(false);
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isGitModalOpen, setIsGitModalOpen] = useState(false);
    const [commitMessage, setCommitMessage] = useState('');

    // Real git data (from isomorphic-git)
    const [realGitLog, setRealGitLog] = useState<any[]>([]);
    const [realModified, setRealModified] = useState<string[]>([]);
    const [isRealGitActive, setIsRealGitActive] = useState(false);
    const { config } = useEchelonConfig();

    useEffect(() => {
        if (activeEepsite) {
            // Ensure even old eepsites get git initialized the first time they are opened
            const withGit = ensureGitInitialized(activeEepsite);
            if (withGit.git && !activeEepsite.git) {
                if (onUpdateEepsite) {
                    onUpdateEepsite(withGit);
                } else {
                    onUpdateFiles(withGit.id, withGit.files);
                }
            }

            // === FULL GIT: Initialize real .git repo on first open ===
            (async () => {
                try {
                    const hasRepo = await realGit.hasRealRepo(activeEepsite.id);
                    if (!hasRepo) {
                        await realGit.initEepsiteRepo(activeEepsite.id, activeEepsite.files);
                        console.log('[CodeEditor] Real git repo initialized for', activeEepsite.id);
                        showToast?.('Real .git repository initialized for this eepsite', 'success');
                    }
                } catch (e) {
                    console.warn('[CodeEditor] Real git init failed (falling back to lightweight)', e);
                }
            })();

            const firstFile = findFirstFile(withGit.files);
            if (firstFile) {
                setActiveFilePath(firstFile);
                const content = getFileContent(withGit.files, firstFile);
                setActiveFileContent(content || '');
            } else {
                setActiveFilePath(null);
                setActiveFileContent('');
            }
        }
    }, [activeEepsite]);

    const handleFileSelect = useCallback((path: string) => {
        if (isDirty) {
            if (!window.confirm("You have unsaved changes. Are you sure you want to switch files?")) {
                return;
            }
        }
        const content = getFileContent(activeEepsite!.files, path);
        if (content !== null) {
            setActiveFilePath(path);
            setActiveFileContent(content);
            setIsDirty(false);
            // On mobile, close explorer after selecting a file for better UX
            if (window.innerWidth < 768) {
                setIsExplorerOpen(false);
            }
        }
    }, [activeEepsite, isDirty]);
    
    const handleContentChange = (newContent: string) => {
        setActiveFileContent(newContent);
        setIsDirty(true);

        // === FULL GIT: Live sync current file edits into the real working tree ===
        // This makes `git status`, AI context, and future commits see the latest changes.
        if (currentEepsite && activeFilePath && isRealGitActive) {
            // Debounce the FS write to avoid hammering on every keystroke (important for mobile)
            const timeoutKey = `git-write-${currentEepsite.id}-${activeFilePath}`;
            // @ts-ignore - simple global debounce map for this session
            if ((window as any)[timeoutKey]) clearTimeout((window as any)[timeoutKey]);
            (window as any)[timeoutKey] = setTimeout(() => {
                realGit.writeSingleFileToWorkingDir(currentEepsite.id, activeFilePath, newContent)
                    .then(() => {
                        // Optionally refresh real status after write (lightweight)
                        realGit.getEepsiteStatus(currentEepsite.id).then(setRealModified).catch(() => {});
                    })
                    .catch((e) => console.warn('Live git FS write failed', e));
            }, 350);
        }
    };

    const handleSave = () => {
        if (!activeEepsite || !activeFilePath || !isDirty) return;

        const newFileTree: FileTree = JSON.parse(JSON.stringify(activeEepsite.files));
        const parts = activeFilePath.split('/').filter(p => p);
        let currentLevel: any = newFileTree;
        for (let i = 0; i < parts.length - 1; i++) {
            currentLevel = currentLevel[parts[i]];
        }
        (currentLevel[parts[parts.length - 1]] as FileContent).content = activeFileContent;
        
        onUpdateFiles(activeEepsite.id, newFileTree);
        setIsDirty(false);
    };

    // Git helpers (every eepsite is guaranteed to have git after our init)
    const currentEepsite = activeEepsite ? ensureGitInitialized(activeEepsite) : null;
    const git = currentEepsite?.git;
    const commits = git?.commits ?? [];
    const lightweightHasChanges = currentEepsite ? hasUncommittedChanges(currentEepsite.files, commits) : false;
    const hasChanges = (isRealGitActive && realModified.length > 0) || lightweightHasChanges;
    const latestCommit = commits.length > 0 ? commits[commits.length - 1] : undefined;
    const lightweightModified = currentEepsite ? getModifiedPaths(currentEepsite.files, latestCommit) : [];
    // Prefer real git status when available
    const modifiedPaths = (isRealGitActive && realModified.length > 0) ? realModified : lightweightModified;

    // Rich git context for the AI (especially useful when chat opens in the IDE)
    const gitSummaryForAI = git
        ? [
            isRealGitActive ? 'REAL .git REPOSITORY (isomorphic-git + LightningFS)' : 'Lightweight git history',
            `${commits.length} total commit${commits.length === 1 ? '' : 's'}.`,
            hasChanges 
              ? `${modifiedPaths.length} file(s) currently modified in working tree: ${modifiedPaths.slice(0, 6).join(', ')}${modifiedPaths.length > 6 ? '...' : ''}`
              : 'Working tree is clean.',
            isRealGitActive && realGitLog.length > 0 
              ? `Latest real commit: "${realGitLog[0]?.message}"`
              : ''
          ].filter(Boolean).join(' | ')
        : undefined;

    const recentCommitsForAI = isRealGitActive && realGitLog.length > 0 
        ? realGitLog.slice(0, 5).map((c: any) => ({
            message: c.message,
            timestamp: new Date(c.timestamp).toLocaleDateString(),
          }))
        : commits.slice(-5).reverse().map(c => ({
            message: c.message,
            timestamp: new Date(c.timestamp).toLocaleDateString(),
          }));

    const handlePublish = async () => {
        if (!activeEepsite || isPublishing) return;

        // === FULL GIT: Auto-commit before publish if real git has uncommitted changes ===
        if (isRealGitActive && realModified.length > 0 && currentEepsite) {
            try {
                await realGit.writeTreeToWorkingDirectory(currentEepsite.id, currentEepsite.files);
                await realGit.commitEepsite(currentEepsite.id, 'Auto-commit before publish via Echelon');
                
                // Refresh real git state after auto-commit
                const [newLog, newMod] = await Promise.all([
                    realGit.getCleanGitLog(currentEepsite.id, 10),
                    realGit.getEepsiteStatus(currentEepsite.id),
                ]);
                setRealGitLog(newLog);
                setRealModified(newMod);

                showToast?.('Auto-committed latest changes to real .git before publishing', 'info');
            } catch (e) {
                console.warn('[CodeEditor] Auto-commit before publish failed', e);
                showToast?.('Could not auto-commit before publish (continuing anyway)', 'error');
            }
        }

        // Auto-save any pending edit so we publish what's on screen.
        if (isDirty && activeFilePath) {
            const newFileTree: FileTree = JSON.parse(JSON.stringify(activeEepsite.files));
            const parts = activeFilePath.split('/').filter(p => p);
            let currentLevel: any = newFileTree;
            for (let i = 0; i < parts.length - 1; i++) currentLevel = currentLevel[parts[i]];
            (currentLevel[parts[parts.length - 1]] as FileContent).content = activeFileContent;
            onUpdateFiles(activeEepsite.id, newFileTree);
            setIsDirty(false);
            // Use the freshly built tree for the publish below.
            (activeEepsite as Eepsite).files = newFileTree;
        }

        setIsPublishing(true);
        try {
            const result = await publishEepsiteToDaemon(config, activeEepsite);
            showToast?.(
                `Published ${result.writtenCount} file(s) to ${result.diskPath}.`,
                'success',
            );
        } catch (e) {
            const msg = e instanceof SyncDaemonError ? e.message : 'Failed to publish to local sync daemon.';
            console.error('[CodeEditor] publish failed', e);
            showToast?.(msg, 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleCommit = async () => {
        if (!currentEepsite || !commitMessage.trim()) {
            showToast?.('Cannot commit right now', 'error');
            return;
        }

        try {
            // === FULL GIT: First write latest editor state into real working tree ===
            await realGit.writeTreeToWorkingDirectory(currentEepsite.id, currentEepsite.files);

            // Then do the real commit
            await realGit.commitEepsite(currentEepsite.id, commitMessage.trim());

            // Keep lightweight UI metadata in sync
            const newCommit = createCommit(currentEepsite.files, commitMessage);
            const updatedCommits = [...commits, newCommit];
            const updatedEepsite: Eepsite = {
                ...currentEepsite,
                git: { initialized: true, commits: updatedCommits },
            };

            if (onUpdateEepsite) {
                onUpdateEepsite(updatedEepsite);
            }
            onUpdateFiles(currentEepsite.id, currentEepsite.files);

            setCommitMessage('');
            showToast?.('Committed to real .git', 'success');

            // Refresh real data in modal
            if (currentEepsite.id) {
                await refreshRealGit(currentEepsite.id);
            }
        } catch (e) {
            console.error('Real git commit failed, falling back', e);
            // Fallback to lightweight
            const newCommit = createCommit(currentEepsite.files, commitMessage);
            const updatedCommits = [...commits, newCommit];
            const updatedEepsite: Eepsite = {
                ...currentEepsite,
                git: { initialized: true, commits: updatedCommits },
            };
            if (onUpdateEepsite) onUpdateEepsite(updatedEepsite);
            onUpdateFiles(currentEepsite.id, currentEepsite.files);
            setCommitMessage('');
            showToast?.('Committed (lightweight mode)', 'success');
        }
    };

    const handleRestoreCommit = async (commit: import('../../types').GitCommit) => {
        if (!currentEepsite) return;
        if (!window.confirm('Restore this version? Current uncommitted changes will be lost.')) return;

        try {
            // === FULL GIT: Real checkout ===
            await realGit.checkoutCommit(currentEepsite.id, commit.id);
            const restoredFiles = await realGit.readWorkingTree(currentEepsite.id);
            onUpdateFiles(currentEepsite.id, restoredFiles);
            showToast?.(`Restored from real git commit`, 'success');
        } catch (e) {
            console.warn('Real checkout failed, using snapshot', e);
            const restoredFiles = restoreFromCommit(commit);
            onUpdateFiles(currentEepsite.id, restoredFiles);
            showToast?.(`Restored version (snapshot)`, 'success');
        }
        setIsGitModalOpen(false);
    };

    // Refresh real git data when modal opens
    const refreshRealGit = async (eepsiteId: string) => {
        try {
            const hasRepo = await realGit.hasRealRepo(eepsiteId);
            setIsRealGitActive(hasRepo);

            if (hasRepo) {
                const [log, modified] = await Promise.all([
                    realGit.getCleanGitLog(eepsiteId, 15),
                    realGit.getEepsiteStatus(eepsiteId),
                ]);
                setRealGitLog(log);
                setRealModified(modified);
            } else {
                setRealGitLog([]);
                setRealModified([]);
            }
        } catch (e) {
            console.warn('[CodeEditor] Failed to refresh real git data', e);
            setIsRealGitActive(false);
        }
    };

    // When modal opens, pull fresh real git data
    useEffect(() => {
        if (isGitModalOpen && currentEepsite) {
            refreshRealGit(currentEepsite.id);
        }
    }, [isGitModalOpen, currentEepsite?.id]);

    // Also refresh real status after saving (so the Git button dot updates live)
    useEffect(() => {
        if (!isDirty && currentEepsite && isRealGitActive) {
            realGit.getEepsiteStatus(currentEepsite.id)
                .then(setRealModified)
                .catch(() => {});
        }
    }, [isDirty, currentEepsite?.id, isRealGitActive]);

    if (!activeEepsite) {
        return (
            <Card className="text-center">
                <h2 className="text-xl font-semibold">No Active Project</h2>
                <p className="text-gray-400 mt-2">Please select an eepsite to edit from the hosting page.</p>
                <button onClick={() => setPage('eepsite-hosting')} className="mt-4 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition">Go to Hosting Page</button>
            </Card>
        );
    }

    // Subtle first-time guidance for the killer MVP flow (AI + real git)
    const isNewEepsite = activeEepsite.git && activeEepsite.git.commits.length <= 1;
    
    return (
        <div className="flex flex-col h-[calc(100dvh-130px-env(safe-area-inset-bottom))] gap-4">
            <div className="flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsExplorerOpen(true)} className="p-2 md:hidden bg-slate-700/50 rounded-md hover:bg-slate-700" aria-label="Open file explorer">
                        <FolderIcon />
                    </button>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-white">Code Editor</h1>
                        <p className="font-mono text-purple-400 text-sm">{activeEepsite.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <button 
                        onClick={() => setPage('eepsite-hosting')} 
                        className="flex items-center gap-2 p-2 md:px-4 md:py-2 bg-slate-700/50 text-gray-300 font-semibold rounded-md hover:bg-slate-700 transition text-sm"
                        aria-label="Back to Hosting"
                    >
                        <BackIcon />
                        <span className="hidden md:inline">Back</span>
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={!isDirty} 
                        className="flex items-center gap-2 p-2 md:px-4 md:py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:bg-slate-600 disabled:cursor-not-allowed text-sm"
                        aria-label="Save Changes"
                    >
                        <SaveIcon />
                        <span className="hidden md:inline">{isDirty ? 'Save' : 'Saved'}</span>
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={isPublishing || !activeEepsite}
                        className="flex items-center gap-2 p-2 md:px-4 md:py-2 bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-600 transition disabled:bg-slate-600 disabled:cursor-not-allowed text-sm"
                        aria-label="Publish to Termux sync daemon"
                        title="Publish files to the local Termux sync daemon so i2pd can serve them"
                    >
                        <PublishIcon />
                        <span className="hidden md:inline">{isPublishing ? 'Publishing…' : 'Publish'}</span>
                    </button>

                    {/* .git integration - real .git per eepsite */}
                    <button
                        onClick={() => setIsGitModalOpen(true)}
                        className="flex items-center gap-2 p-2 md:px-3 md:py-2 bg-slate-700/60 hover:bg-slate-700 text-gray-200 font-semibold rounded-lg transition text-sm border border-slate-600"
                        title="Open git panel (real .git repository)"
                    >
                        <span className="hidden md:inline">Git</span>
                        <span className="md:hidden">⎇</span>
                        {isRealGitActive && (
                            <span className="text-[10px] text-emerald-400 font-mono">● real</span>
                        )}
                        {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        {isRealGitActive && realModified.length > 0 && (
                            <span className="text-[10px] text-amber-400">({realModified.length})</span>
                        )}
                    </button>
                </div>
            </div>

            {/* MVP-first-run guidance: highlight the unique combo (real git + AI) */}
            {isNewEepsite && (
                <div className="flex-shrink-0 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
                    <strong>New project with real .git.</strong> Try the <span className="font-semibold">AI Assistant</span> in the editor — it can see your commit history and current changes.
                </div>
            )}

            <div className="relative flex-grow flex gap-4 min-h-0">
                {/* Backdrop for mobile */}
                {isExplorerOpen && (
                    <div 
                        className="fixed inset-0 bg-black/50 z-40 md:hidden" 
                        onClick={() => setIsExplorerOpen(false)}
                        aria-hidden="true"
                    ></div>
                )}
                {/* File Explorer (Sidebar) */}
                <div className={`
                    fixed top-0 left-0 h-full w-64 max-w-[80vw] bg-slate-800 border-r border-slate-700 p-2 overflow-y-auto z-50
                    transition-transform duration-300 ease-in-out 
                    md:static md:h-auto md:w-1/4 md:max-w-xs md:bg-slate-800/50 md:border md:rounded-lg md:z-auto
                    ${isExplorerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}>
                    <div className="flex items-center justify-between mb-2 md:hidden">
                        <h3 className="text-sm font-semibold text-gray-400 px-2">EXPLORER</h3>
                        <button onClick={() => setIsExplorerOpen(false)} className="p-1 text-gray-400 hover:text-white" aria-label="Close file explorer">
                            <CloseIcon />
                        </button>
                    </div>
                    <FileTreeComponent 
                        files={activeEepsite.files} 
                        onFileSelect={handleFileSelect}
                        activeFilePath={activeFilePath}
                        modifiedPaths={modifiedPaths}
                    />
                </div>
                {/* Editor Panel */}
                <div className="flex-1 flex flex-col min-w-0">
                    <EditorPanel 
                        activeFilePath={activeFilePath}
                        fileContent={activeFileContent}
                        onContentChange={handleContentChange}
                        gitSummary={gitSummaryForAI}
                        recentCommits={recentCommitsForAI}
                        modifiedFiles={modifiedPaths}
                    />
                </div>
            </div>

            {/* .git Modal — tasteful, works great on phones */}
            {isGitModalOpen && currentEepsite && (
                <Modal title={`Git — ${currentEepsite.name}`} onClose={() => setIsGitModalOpen(false)}>
                    <div className="space-y-5 text-sm">
                        {/* Status */}
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-gray-300">Status</span>
                                {isRealGitActive && (
                                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 font-mono">REAL .git</span>
                                )}
                                {(realModified.length > 0 || hasChanges) ? (
                                    <span className="px-2 py-0.5 text-xs rounded bg-amber-500/20 text-amber-300">Uncommitted changes</span>
                                ) : (
                                    <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-300">Clean</span>
                                )}
                            </div>
                            <p className="text-gray-400 text-xs">
                                {(realGitLog.length || commits.length)} commit{(realGitLog.length || commits.length) === 1 ? '' : 's'} 
                                {isRealGitActive ? ' • Real .git active' : ' • Lightweight history'}
                                {realModified.length > 0 && ` • ${realModified.length} changed in working tree`}
                            </p>
                        </div>

                        {/* Commit form */}
                        <div className="space-y-2">
                            <div className="font-semibold text-gray-300">Create commit</div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={commitMessage}
                                    onChange={(e) => setCommitMessage(e.target.value)}
                                    placeholder="Describe your changes..."
                                    className="flex-1 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 text-sm focus:border-purple-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && commitMessage.trim() && hasChanges) {
                                            handleCommit();
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleCommit}
                                    disabled={!hasChanges || !commitMessage.trim()}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition"
                                >
                                    Commit
                                </button>
                            </div>
                            {!hasChanges && (
                                <p className="text-xs text-gray-500">No changes to commit. Edit files to create a new snapshot.</p>
                            )}
                        </div>

                        {/* History */}
                        <div>
                            <div className="font-semibold text-gray-300 mb-2">History</div>
                            {isRealGitActive && realGitLog.length > 0 ? (
                                <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                                    {realGitLog.map((commit: any) => (
                                        <div key={commit.oid} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-white break-words">{commit.message}</div>
                                                    <div className="text-gray-400 mt-0.5">
                                                        {new Date(commit.timestamp).toLocaleString()} • {commit.short}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRestoreCommit({ id: commit.oid, message: commit.message, timestamp: new Date(commit.timestamp), filesSnapshot: {} } as any)}
                                                    className="shrink-0 text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : commits.length === 0 ? (
                                <p className="text-gray-500 text-xs">No history yet.</p>
                            ) : (
                                <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                                    {[...commits].reverse().map((commit) => (
                                        <div key={commit.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-white break-words">{commit.message}</div>
                                                    <div className="text-gray-400 mt-0.5">
                                                        {new Date(commit.timestamp).toLocaleString()} • {commit.id.slice(0, 7)}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRestoreCommit(commit)}
                                                    className="shrink-0 text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <p className="text-[10px] text-gray-500 pt-2">
                            Every eepsite starts with its own .git history. Commits are private to this device until you publish.
                        </p>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default CodeEditor;