/**
 * useEepsiteGit - Abstraction for real .git support per eepsite.
 *
 * Goal: Each eepsite project gets its own real git repository (using
 * isomorphic-git + LightningFS) so users have actual `git log`, branches,
 * etc. inside the IDE, persisted in the browser.
 *
 * This is the foundation for "full git". The current lightweight snapshot
 * system in utils/git.ts will be gradually replaced / bridged by this.
 *
 * Status: Scaffolding phase. Real implementation will happen next.
 */

import { useState, useCallback } from 'react';
// import git from 'isomorphic-git';
// import LightningFS from '@isomorphic-git/lightning-fs';

export interface EepsiteGitState {
    initialized: boolean;
    commits: Array<{
        oid: string;
        message: string;
        author: string;
        timestamp: number;
    }>;
    status: 'clean' | 'modified';
    modifiedFiles: string[];
}

export function useEepsiteGit(eepsiteId: string | null) {
    const [state, setState] = useState<EepsiteGitState>({
        initialized: false,
        commits: [],
        status: 'clean',
        modifiedFiles: [],
    });

    const initRepo = useCallback(async () => {
        if (!eepsiteId) return;

        // TODO: Real implementation
        // 1. Create a LightningFS instance scoped to this eepsite
        // 2. git.init({ fs, dir: `/${eepsiteId}` })
        // 3. Seed initial files from current FileTree
        // 4. Create initial commit

        console.log(`[useEepsiteGit] Would initialize real git repo for eepsite ${eepsiteId}`);

        setState({
            initialized: true,
            commits: [{ oid: 'initial', message: 'Initial commit', author: 'you', timestamp: Date.now() }],
            status: 'clean',
            modifiedFiles: [],
        });
    }, [eepsiteId]);

    const commit = useCallback(async (message: string) => {
        if (!eepsiteId) return;
        console.log(`[useEepsiteGit] Would commit with message: ${message}`);
        // Real git.commit call here in the future
    }, [eepsiteId]);

    const getLog = useCallback(async () => {
        // Return real git.log result
        return state.commits;
    }, [state.commits]);

    return {
        ...state,
        initRepo,
        commit,
        getLog,
        // Future: checkout, branch, etc.
    };
}
