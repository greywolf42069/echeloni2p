import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, GenerateContentResponse, Content } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Page, UserData, ProofOfRelayVoucher, Proposal, UserVote, VoteOption, Bounty, Achievement } from '../../types';
import type { BlockEvent } from '../../hooks/filterEventsClient.ts';
import { useGeminiKey } from '../../hooks/useEchelonConfig.ts';
import { getProjectKnowledge } from '../knowledge.ts';

// Icons for chat bubbles and send button
const AssistantIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
);

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);

interface DisplayMessage {
    role: 'user' | 'model';
    text: string;
}

interface AssistantProps {
    onClose: () => void;
    setPage: (page: Page) => void;
    userData: UserData;
    threatLog: BlockEvent[];
    onStake: (amount: number) => void;
    onUnstake: (amount: number) => void;
    onClaimRewards: () => void;
    porVouchers: ProofOfRelayVoucher[];
    onClaimPorVouchers: () => void;
    proposals: Proposal[];
    userVotes: UserVote;
    onVote: (proposalId: string, vote: VoteOption) => void;
    bounties: Bounty[];
    achievements: Achievement[];
    onClaimAllBounties: () => string;
}

const Assistant: React.FC<AssistantProps> = ({ onClose, setPage, userData, threatLog, onStake, onUnstake, onClaimRewards, porVouchers, onClaimPorVouchers, proposals, userVotes, onVote, bounties, achievements, onClaimAllBounties }) => {
    const { apiKey, setApiKey, hasKey } = useGeminiKey();
    const [keyInput, setKeyInput] = useState('');
    const [ai, setAi] = useState<GoogleGenAI | null>(null);
    const [history, setHistory] = useState<Content[]>([]);
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const tools: FunctionDeclaration[] = [
        {
            name: 'navigateToPage',
            parameters: {
                type: Type.OBJECT,
                description: 'Navigates to a specified page within the application.',
                properties: {
                    page: {
                        type: Type.STRING,
                        description: 'The page to navigate to. Must be one of: dashboard, emissions, settings, browser, wasm, native, workflows, protect, wallet, staking, governance, bounties.',
                        enum: ['dashboard', 'emissions', 'settings', 'browser', 'wasm', 'native', 'workflows', 'protect', 'wallet', 'staking', 'governance', 'bounties'],
                    },
                },
                required: ['page'],
            },
        },
        {
            name: 'getWalletInfo',
            parameters: { type: Type.OBJECT, description: "Retrieves information about the user's wallet and account status, such as staked balance, total balance, subscription tier, and number of referrals.", properties: {} },
        },
        {
            name: 'stakeTokens',
            parameters: { type: Type.OBJECT, description: "Stakes a specified amount of RTD tokens from the user's available balance.", properties: { amount: { type: Type.NUMBER, description: 'The amount of RTD to stake.' } }, required: ['amount'] },
        },
        {
            name: 'unstakeTokens',
            parameters: { type: Type.OBJECT, description: 'Unstakes a specified amount of RTD tokens from the user\'s staked balance.', properties: { amount: { type: Type.NUMBER, description: 'The amount of RTD to unstake.' } }, required: ['amount'] },
        },
        {
            name: 'claimRewards',
            parameters: { type: Type.OBJECT, description: 'Claims all available staking rewards and adds them to the user\'s RTD balance.', properties: {} },
        },
        {
            name: 'getThreatIntelligence',
            parameters: { type: Type.OBJECT, description: "Retrieves a report of the most recently blocked security threats, such as trackers or malicious websites.", properties: {} },
        },
        {
            name: 'getProofOfRelayStatus',
            parameters: { type: Type.OBJECT, description: "Gets the user's current Proof-of-Relay status, including the number of unclaimed vouchers and the total pending RTD reward.", properties: {} },
        },
        {
            name: 'claimProofOfRelayVouchers',
            parameters: { type: Type.OBJECT, description: "Claims all available Proof-of-Relay vouchers, adding the RTD rewards to the user's balance.", properties: {} },
        },
        {
            name: 'getGovernanceProposals',
            parameters: {
                type: Type.OBJECT,
                description: 'Retrieves a list of governance proposals. Can be filtered by status.',
                properties: { status: { type: Type.STRING, description: 'The status to filter by. Must be one of: Active, Passed, Failed, Executing.', enum: ['Active', 'Passed', 'Failed', 'Executing'] } },
            },
        },
        {
            name: 'voteOnProposal',
            parameters: {
                type: Type.OBJECT,
                description: 'Casts a vote on an active governance proposal.',
                properties: { proposalId: { type: Type.STRING, description: 'The ID of the proposal to vote on (e.g., "eip-001").' }, voteOption: { type: Type.STRING, description: 'The vote to cast. Must be one of: for, against, abstain.', enum: ['for', 'against', 'abstain'] } },
                required: ['proposalId', 'voteOption'],
            },
        },
        {
            name: 'getActiveBounties',
            parameters: { type: Type.OBJECT, description: 'Retrieves a list of active bounties and their current progress.', properties: {} },
        },
        {
            name: 'getUnlockedAchievements',
            parameters: { type: Type.OBJECT, description: 'Retrieves a list of all achievements the user has unlocked.', properties: {} },
        },
        {
            name: 'claimAllCompletedBounties',
            parameters: { type: Type.OBJECT, description: 'Claims the rewards for all completed but unclaimed bounties.', properties: {} },
        },
    ];

    useEffect(() => {
        if (!apiKey) {
            setAi(null);
            setMessages([{
                role: 'model',
                text: 'To use the AI assistant, please add your **Google Gemini API key** below. You can get one for free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). Your key is stored only in this browser and never sent anywhere except directly to Google.',
            }]);
            return;
        }
        console.log('[Assistant] Initializing Gemini AI with user-supplied key...');
        try {
            const genAI = new GoogleGenAI({ apiKey });
            setAi(genAI);
            setMessages([{
                role: 'model',
                text: 'Hello! I\'m your Echelon Network Assistant. I can help you with:\n\n- **Project questions** — "How does the threat filter work?" or "What\'s the difference between Plus and Privacy?"\n- **I2P & networking** — "Why can\'t I connect?" or "How do I set up Yggdrasil?"\n- **Privacy & security** — "Is my browsing private?" or "How does the HTML sanitizer work?"\n- **Actions** — "Go to the dashboard", "What\'s my balance?", or "Show me active proposals"\n\nAsk me anything about Echelon!',
            }]);
            console.log('[Assistant] Gemini AI initialized successfully.');
        } catch (error) {
            console.error('[Assistant] Failed to initialize Gemini AI:', error);
            setMessages([{
                role: 'model',
                text: 'There was an issue initializing the AI Assistant. Your saved key may be invalid — try clearing it and pasting a fresh one.',
            }]);
        }
    }, [apiKey]);

    const handleSaveKey = () => {
        const trimmed = keyInput.trim();
        if (!trimmed) return;
        setApiKey(trimmed);
        setKeyInput('');
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages, isLoading]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !ai || isLoading) return;

        const userText = input;
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setInput('');
        setIsLoading(true);

        const newHistory: Content[] = [...history, { role: 'user', parts: [{ text: userText }] }];

        try {
            const systemInstruction = `You are the Echelon Network Assistant — a knowledgeable, friendly AI built into the Echelon I2P platform.

You have deep knowledge about the Echelon project, its architecture, security model, subscription tiers, I2P integration, and how everything works. You can answer questions about:
- How Echelon works (architecture, sync daemon, i2pd, PWA)
- I2P networking (how browsing works, NAT traversal, Yggdrasil, Termux setup)
- Privacy and security (HTML sanitizer, SSRF defense, traffic regularization, honest limitations)
- Subscription tiers (Free, Plus, Privacy, Operator — features, pricing, differences)
- Templates and EepGen AI (hosted vs BYOK, token quotas)
- Token economy (RTD token plans, airdrop weight, v0.2 roadmap)
- How to use specific features (browsing, publishing, editor, wallet, settings)
- Troubleshooting (connection issues, NAT problems, daemon not running)

You can also perform actions using the available tools (navigate pages, check wallet, stake tokens, etc.).

When answering knowledge questions, be specific and accurate. Reference real technical details. If you don't know something, say so honestly rather than guessing.

${getProjectKnowledge()}

When a function is called successfully, confirm the action in a friendly tone. When providing wallet info or threat intelligence, format it clearly as a list. Keep your answers concise and easy to understand for a general audience. Format your responses using simple markdown.`;
            
            let response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: newHistory,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations: tools }],
                },
            });

            let finalHistory = [...newHistory, response.candidates![0].content];

            while(response.functionCalls && response.functionCalls.length > 0) {
                 console.log('[Assistant] Received function calls:', response.functionCalls);
                 const functionResponseParts = [];
                 for (const fc of response.functionCalls) {
                     let functionResult;
                     switch (fc.name) {
                         case 'navigateToPage': const page = fc.args.page as Page; setPage(page); functionResult = { status: 'success', message: `Navigated to ${page}.` }; break;
                         case 'getWalletInfo': functionResult = userData; break;
                         case 'stakeTokens': const stakeAmount = fc.args.amount as number; onStake(stakeAmount); functionResult = { status: 'success', message: `Staked ${stakeAmount} RTD.` }; break;
                         case 'unstakeTokens': const unstakeAmount = fc.args.amount as number; onUnstake(unstakeAmount); functionResult = { status: 'success', message: `Unstaked ${unstakeAmount} RTD.` }; break;
                         case 'claimRewards': onClaimRewards(); functionResult = { status: 'success', message: 'Claimed staking rewards.' }; break;
                        case 'getThreatIntelligence': functionResult = threatLog.length > 0 ? threatLog.slice(0, 5) : { status: 'none', message: 'No recent threats detected.' }; break;
                        case 'getProofOfRelayStatus': const unclaimedVouchers = porVouchers.filter(v => !v.claimed); const totalReward = unclaimedVouchers.reduce((sum, v) => sum + v.reward, 0); functionResult = { unclaimedVoucherCount: unclaimedVouchers.length, pendingRewardRTD: totalReward }; break;
                        case 'claimProofOfRelayVouchers': onClaimPorVouchers(); functionResult = { status: 'success', message: 'Claimed all available Proof-of-Relay vouchers.' }; break;
                        case 'getGovernanceProposals': const statusFilter = fc.args.status as Proposal['status']; const filteredProposals = statusFilter ? proposals.filter(p => p.status === statusFilter) : proposals; functionResult = filteredProposals.map(p => ({ id: p.id, title: p.title, status: p.status, endDate: p.endDate.toLocaleDateString() })); break;
                        case 'voteOnProposal': const proposalId = fc.args.proposalId as string; const voteOption = fc.args.voteOption as VoteOption; onVote(proposalId, voteOption); functionResult = { status: 'success', message: `Attempted to vote '${voteOption}' on proposal ${proposalId}.` }; break;
                        case 'getActiveBounties': functionResult = bounties.filter(b => !b.isClaimed).map(b => ({ title: b.title, progress: `${b.currentProgress.toFixed(0)} / ${b.goal}`, complete: b.isComplete })); break;
                        case 'getUnlockedAchievements': functionResult = achievements.filter(a => a.isUnlocked).map(a => a.title); break;
                        case 'claimAllCompletedBounties': functionResult = { status: 'success', message: onClaimAllBounties() }; break;
                         default: functionResult = { status: 'error', message: `Unknown function: ${fc.name}` };
                     }
                     functionResponseParts.push({ functionResponse: { name: fc.name, response: functionResult } });
                 }

                 const functionResponseHistory: Content[] = [...finalHistory, { role: 'function', parts: functionResponseParts }];
                 const resultAfterFunctionCall = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: functionResponseHistory, config: { systemInstruction, tools: [{ functionDeclarations: tools }] } });
                 response = resultAfterFunctionCall;
                 finalHistory = [...functionResponseHistory, response.candidates![0].content];
            }
            
            const modelText = response.text;
            if (modelText) {
                setMessages(prev => [...prev, { role: 'model', text: modelText }]);
                setHistory(finalHistory);
            } else {
                 setMessages(prev => [...prev, { role: 'model', text: "I'm sorry, I couldn't generate a response." }]);
            }

        } catch (error) {
            console.error("[Assistant] Error calling Gemini API:", error);
            setMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting. Please try again later." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl h-[90vh] max-h-[700px] bg-slate-800 border border-slate-700 rounded-2xl shadow-xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AssistantIcon />
                        <h1 className="text-xl font-bold text-white">Network Assistant</h1>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-white rounded-full hover:bg-slate-700/50 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && <AssistantIcon />}
                            <div className={`max-w-md rounded-xl prose prose-sm prose-invert prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:p-0 prose-pre:bg-transparent ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-br-none p-3' : 'bg-slate-700/50 text-gray-200 rounded-bl-none p-1 sm:p-3'}`}>
                                {msg.role === 'user' ? (
                                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                ) : (
                                    <ReactMarkdown
                                        children={msg.text}
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                const isBlock = (props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
                                                    ? (props as any).node.position.start.line !== (props as any).node.position.end.line
                                                    : false;
                                                return isBlock && match ? (
                                                    <SyntaxHighlighter
                                                        children={String(children).replace(/\n$/, '')}
                                                        style={vscDarkPlus as any}
                                                        language={match[1]}
                                                        PreTag="div"
                                                    />
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            },
                                        }}
                                    />
                                )}
                            </div>
                            {msg.role === 'user' && <UserIcon />}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start gap-3">
                            <AssistantIcon />
                            <div className="flex items-center space-x-1 p-3">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                    {!hasKey ? (
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 block">
                                Paste your Google Gemini API key (stored locally, never sent anywhere except Google):
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="password"
                                    value={keyInput}
                                    onChange={(e) => setKeyInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                                    placeholder="AIza..."
                                    className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 transition font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveKey}
                                    disabled={!keyInput.trim()}
                                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:bg-slate-600 disabled:cursor-not-allowed flex-shrink-0 font-semibold text-sm"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSend} className="flex items-center gap-3">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask me to do something..."
                                className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 transition"
                                disabled={isLoading || !ai}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim() || !ai}
                                className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:bg-slate-600 disabled:cursor-not-allowed flex-shrink-0"
                                aria-label="Send message"
                            >
                                <SendIcon />
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Assistant;