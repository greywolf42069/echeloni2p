import React, { useState, useEffect } from 'react';
import AIAssistantSidebar from './AIAssistantSidebar.tsx';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface EditorPanelProps {
    activeFilePath: string | null;
    fileContent: string;
    onContentChange: (newContent: string) => void;

    // Rich git context for the AI (updated when chat opens in the IDE)
    gitSummary?: string;
    recentCommits?: Array<{ message: string; timestamp: string }>;
    modifiedFiles?: string[];
}

const MagicWandIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
);

const EditorPanel: React.FC<EditorPanelProps> = ({ activeFilePath, fileContent, onContentChange, gitSummary, recentCommits, modifiedFiles }) => {
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Tasteful mobile detection — keeps the experience excellent on phones without breaking layout
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!activeFilePath) {
        return (
            <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center">
                <p className="text-gray-400">Select a file to begin editing.</p>
            </div>
        );
    }

    const fileExtension = activeFilePath.split('.').pop() || 'plaintext';

    return (
        <div className="flex-1 flex flex-row min-h-0 gap-2">
            {/* ── Main editor column (always present) ── */}
            <div className="flex-1 flex flex-col bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden min-h-0 min-w-0">
                {/* Tab Bar */}
                <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-700 bg-slate-800">
                    <div className="px-4 py-2 text-sm font-semibold bg-slate-900/50 text-white border-r border-slate-700 truncate max-w-xs" title={activeFilePath}>
                        {activeFilePath}
                    </div>
                    <button
                        onClick={() => setIsAssistantOpen(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 mr-2 text-sm font-semibold rounded-lg transition ${
                            isAssistantOpen
                                ? 'bg-purple-700 text-white ring-1 ring-purple-400/50'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                    >
                        <MagicWandIcon />
                        <span>{isAssistantOpen ? (isMobile ? 'Back to Code' : 'Hide AI') : 'AI Assistant'}</span>
                    </button>
                </div>

                {/* Editor Area — transparent textarea overlays the syntax highlighter */}
                <div className="relative flex-1 min-h-0">
                    <textarea
                        value={fileContent}
                        onChange={(e) => onContentChange(e.target.value)}
                        className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none font-mono text-sm leading-relaxed z-10"
                        spellCheck={false}
                    />
                    <SyntaxHighlighter
                        language={fileExtension}
                        style={vscDarkPlus}
                        customStyle={{
                            margin: 0,
                            padding: '1rem',
                            width: '100%',
                            height: '100%',
                            overflow: 'auto',
                            backgroundColor: 'transparent',
                        }}
                        codeTagProps={{
                            style: { fontFamily: 'monospace', fontSize: '0.875rem', lineHeight: '1.6' }
                        }}
                        wrapLongLines={true}
                    >
                        {fileContent}
                    </SyntaxHighlighter>
                </div>
            </div>

            {/* 
              AI Experience — very tasteful responsive handling:
              • Desktop (≥768px): Clean slide-in 360px sidebar (great split view)
              • Phone: Full-screen dedicated AI view (no cramped layout, feels intentional and premium)
            */}
            {isAssistantOpen && (
                isMobile ? (
                    /* Mobile: Full-screen, high-quality AI experience. Editor is still "underneath" but we give the AI the whole phone. */
                    <div className="fixed inset-0 z-[70] bg-slate-900 flex flex-col">
                        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800">
                            <div className="flex items-center gap-2 min-w-0">
                                <MagicWandIcon />
                                <div className="min-w-0">
                                    <div className="font-semibold text-white text-sm">AI Assistant</div>
                                    <div className="font-mono text-[10px] text-gray-400 truncate max-w-[220px]">{activeFilePath}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAssistantOpen(false)}
                                className="px-4 py-1.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg transition"
                            >
                                Back to Editor
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <AIAssistantSidebar
                                activeFilePath={activeFilePath}
                                currentCode={fileContent}
                                onApplyCode={onContentChange}
                                onClose={() => setIsAssistantOpen(false)}
                                gitSummary={gitSummary}
                                recentCommits={recentCommits}
                                modifiedFiles={modifiedFiles}
                            />
                        </div>
                    </div>
                ) : (
                    /* Desktop: Original nice slide-in sidebar */
                    <div
                        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out rounded-lg border border-slate-700"
                        style={{ width: '360px' }}
                    >
                        <AIAssistantSidebar
                            activeFilePath={activeFilePath}
                            currentCode={fileContent}
                            onApplyCode={onContentChange}
                            onClose={() => setIsAssistantOpen(false)}
                            gitSummary={gitSummary}
                            recentCommits={recentCommits}
                            modifiedFiles={modifiedFiles}
                        />
                    </div>
                )
            )}
        </div>
    );
};

export default EditorPanel;