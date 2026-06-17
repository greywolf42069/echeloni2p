import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGeminiKey } from '../../hooks/useEchelonConfig.ts';

interface Message {
    role: 'user' | 'model';
    text: string;
    proposedCode?: string;
}

interface AIAssistantSidebarProps {
    activeFilePath: string | null;
    currentCode: string;
    onApplyCode: (newCode: string) => void;
    onClose: () => void;

    // Git awareness (injected when chat starts)
    gitSummary?: string;           // e.g. "12 commits. Last: 'Add dark mode'. 3 files modified."
    recentCommits?: Array<{ message: string; timestamp: string }>;
    modifiedFiles?: string[];
}

// --- Icons ---
const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
);
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
);
const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
);
const KeyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
);

// Extracts the first code block from a markdown string
function extractCodeBlock(text: string): string | null {
    const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
}

const QUICK_ACTIONS = [
    { label: '✨ Explain Code', prompt: 'Explain what the current code does in clear, simple terms.' },
    { label: '🔧 Refactor', prompt: 'Refactor and clean up this code for better readability and best practices. Return the complete updated file.' },
    { label: '🐛 Fix Bugs', prompt: 'Identify any bugs or issues in this code and fix them. Return the complete corrected file.' },
    { label: '🛡️ Security & Anonymity Audit', prompt: 'Perform a security and anonymity audit for an I2P eepsite. Flag any privacy leaks, fingerprinting risks, external dependencies, or dangerous patterns. Be direct and specific. Then provide a hardened version of the file if improvements are needed.' },
    { label: '🔒 Make Fully Offline & Private', prompt: 'Rewrite this file to be completely self-contained and privacy-respecting. Remove any external resources, trackers, or risky patterns. Optimize for I2P. Return the complete updated file.' },
    { label: '⚡ Optimize for I2P', prompt: 'Optimize this file for slow/high-latency I2P connections. Reduce payload size, improve perceived performance, use efficient patterns. Return the complete updated file.' },
];

const AIAssistantSidebar: React.FC<AIAssistantSidebarProps> = ({
    activeFilePath,
    currentCode,
    onApplyCode,
    onClose,
    gitSummary,
    recentCommits,
    modifiedFiles,
}) => {
    const { apiKey, setApiKey, clearApiKey } = useGeminiKey();
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [showKeyInput, setShowKeyInput] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Show key input if no key is stored yet
        if (!apiKey) setShowKeyInput(true);
    }, [apiKey]);

    // When the AI sidebar first opens in the IDE with real git context, 
    // inject a strong initial observation so the model "checks git first" proactively.
    useEffect(() => {
        if (
            gitSummary && 
            messages.length === 0 && 
            !isLoading &&
            apiKey
        ) {
            // We don't auto-send a message (that would feel invasive), 
            // but the next time the user sends anything, the rich context is already in the system prompt.
            // This is sufficient because the model is smart.
        }
    }, [gitSummary, messages.length, apiKey, isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSaveKey = () => {
        const trimmed = apiKeyInput.trim();
        if (!trimmed) return;
        setApiKey(trimmed);
        setApiKeyInput('');
        setShowKeyInput(false);
    };

    const handleClearKey = () => {
        clearApiKey();
        setApiKeyInput('');
        setShowKeyInput(true);
    };

    const sendMessage = useCallback(async (promptText: string) => {
        if (!apiKey || isLoading) return;

        const userMessage: Message = { role: 'user', text: promptText };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey });

            const systemPrompt = `You are a world-class specialist AI for building private, anonymous, and secure eepsites on I2P using the Echelon IDE.

Core principles you MUST follow:
- Everything must work 100% offline after the initial load. NEVER suggest external CDNs, Google Fonts, analytics, trackers, or third-party scripts.
- Prioritize extreme privacy and resistance to traffic analysis / fingerprinting.
- Keep payloads tiny and efficient (I2P has real bandwidth and latency constraints).
- Use semantic, accessible HTML. Prefer vanilla JS or tiny progressive enhancement.
- Dark, highly readable color schemes that work great in the I2P browser.
- Be brutally honest about security/anonymity trade-offs.

The user is currently editing the file: "${activeFilePath ?? 'unknown file'}".

${gitSummary ? `CURRENT GIT STATE (THIS IS THE MOST IMPORTANT CONTEXT RIGHT NOW):\n${gitSummary}\n` : ''}
${recentCommits && recentCommits.length > 0 ? `Most recent commits (newest first):\n${recentCommits.map(c => `- ${c.message} (${c.timestamp})`).join('\n')}\n` : ''}
${modifiedFiles && modifiedFiles.length > 0 ? `Currently uncommitted / modified files: ${modifiedFiles.join(', ')}\n` : ''}

**GIT AWARENESS RULE (follow on every response):** 
When this chat session started, you were given the live git state above. You must reason about the project's git history and current working tree changes before giving any code advice. If the user has uncommitted work, acknowledge it. Reference specific recent commits when it makes sense. Do not suggest changes that would lose or regress previous intentional work.

Rules for responses:
- For code changes: ALWAYS return the COMPLETE updated file inside ONE fenced code block with the correct language tag (e.g. \`\`\`html). Never use partial diffs unless the user explicitly asks for an explanation only.
- When suggesting a new file, clearly say "NEW FILE: path/to/file.ext" and provide the full content.
- Keep explanations concise, direct, and friendly. Use markdown for structure.
- If the user asks for security or anonymity advice, reference I2P best practices and be specific.
- When making suggestions, respect the existing git history and avoid undoing previous intentional work unless asked.

You are helping someone build something that should feel invisible and trustworthy. Quality and discretion matter more than features.`;

            const fullPrompt = `${systemPrompt}\n\nCurrent file content:\n\`\`\`\n${currentCode}\n\`\`\`\n\nUser request: ${promptText}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });

            const responseText = response.text?.trim() ?? "Sorry, I couldn't generate a response.";
            const proposedCode = extractCodeBlock(responseText);

            setMessages(prev => [...prev, {
                role: 'model',
                text: responseText,
                proposedCode: proposedCode ?? undefined,
            }]);
        } catch (e) {
            console.error('[AIAssistantSidebar] Gemini API error:', e);
            setMessages(prev => [...prev, {
                role: 'model',
                text: '❌ Failed to connect to Gemini. Please check your API key and try again.',
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [apiKey, isLoading, currentCode, activeFilePath]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) sendMessage(input.trim());
    };

    const handleApplyCode = (code: string, index: number) => {
        onApplyCode(code);
        setAppliedIndex(index);
        setTimeout(() => setAppliedIndex(null), 2000);
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 border-l border-slate-700/80">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/60">
                <div className="flex items-center gap-2 text-purple-300">
                    <SparklesIcon />
                    <span className="font-bold text-sm text-white">AI Assistant</span>
                    {apiKey && (
                        <span className="text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full">
                            Key Active
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowKeyInput(v => !v)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded-md transition"
                        title="Manage API Key"
                    >
                        <KeyIcon />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded-md transition"
                        title="Close Assistant"
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>

            {/* API Key Panel */}
            {showKeyInput && (
                <div className="flex-shrink-0 p-3 bg-slate-800/80 border-b border-slate-700 space-y-2">
                    <p className="text-xs text-gray-400">
                        Enter your{' '}
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                            Google AI Studio
                        </a>{' '}
                        API key. It will be saved locally in your browser.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                            placeholder="AIza..."
                            className="flex-1 min-w-0 bg-slate-700 text-white text-xs p-2 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono"
                        />
                        <button
                            onClick={handleSaveKey}
                            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition flex-shrink-0"
                        >
                            Save
                        </button>
                    </div>
                    {apiKey && (
                        <button
                            onClick={handleClearKey}
                            className="text-xs text-red-400 hover:text-red-300 hover:underline"
                        >
                            Clear saved key
                        </button>
                    )}
                </div>
            )}

            {/* Quick Actions */}
            {apiKey && messages.length === 0 && (
                <div className="flex-shrink-0 p-3 border-b border-slate-700/50">
                    <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {QUICK_ACTIONS.map(action => (
                            <button
                                key={action.label}
                                onClick={() => sendMessage(action.prompt)}
                                disabled={isLoading}
                                className="text-left px-2.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500/50 text-gray-300 hover:text-white rounded-lg transition disabled:opacity-50"
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
                {messages.length === 0 && apiKey && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        <SparklesIcon />
                        <p className="mt-2">Ask me anything about your code, or use a quick action above.</p>
                    </div>
                )}
                {!apiKey && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        <KeyIcon />
                        <p className="mt-2">Add a Gemini API key above to get started.</p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`rounded-xl px-3 py-2 text-sm max-w-full ${
                            msg.role === 'user'
                                ? 'bg-purple-600 text-white rounded-br-none'
                                : 'bg-slate-800 text-gray-200 rounded-bl-none border border-slate-700/50'
                        }`}>
                            {msg.role === 'user' ? (
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            ) : (
                                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-code:text-purple-300 prose-headings:my-2">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.text}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                        {/* Apply Code Button */}
                        {msg.role === 'model' && msg.proposedCode && (
                            <button
                                onClick={() => handleApplyCode(msg.proposedCode!, i)}
                                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                                    appliedIndex === i
                                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                        : 'bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/40'
                                }`}
                            >
                                <CheckIcon />
                                {appliedIndex === i ? 'Applied!' : 'Apply Changes'}
                            </button>
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-2">
                        <div className="bg-slate-800 border border-slate-700/50 rounded-xl rounded-bl-none px-3 py-2 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 p-3 border-t border-slate-700 bg-slate-800/40">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={apiKey ? 'Ask about your code...' : 'Add an API key to start'}
                        disabled={!apiKey || isLoading}
                        className="flex-1 min-w-0 bg-slate-700 text-white text-sm p-2.5 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!apiKey || isLoading || !input.trim()}
                        className="p-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:bg-slate-600 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        <SendIcon />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AIAssistantSidebar;
