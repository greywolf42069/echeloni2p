import React, { useState, useMemo } from 'react';
import Card from '../ui/Card.tsx';
// Fix: Use a named import for ProposalModal to resolve module loading issue.
import { ProposalModal } from '../ProposalModal.tsx';
import type { Proposal, UserVote, VoteOption } from '../../types';

// Icons for status and voting power
const StatusIcon: React.FC<{ status: Proposal['status'] }> = ({ status }) => {
    const config = {
        Active: { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-blue-400' },
        Passed: { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-green-400' },
        Failed: { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-red-400' },
        Executing: { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, color: 'text-purple-400' },
    };
    return <span className={config[status].color}>{config[status].icon}</span>;
};

const VoteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


interface GovernanceProps {
    proposals: Proposal[];
    votingPower: number;
    userVotes: UserVote;
    onVote: (proposalId: string, vote: VoteOption) => void;
}

const Governance: React.FC<GovernanceProps> = ({ proposals, votingPower, userVotes, onVote }) => {
    const [filter, setFilter] = useState<Proposal['status'] | 'All'>('All');
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

    const filteredProposals = useMemo(() => {
        if (filter === 'All') return proposals;
        return proposals.filter(p => p.status === filter);
    }, [proposals, filter]);
    
    const countdown = (endDate: Date) => {
        const diff = endDate.getTime() - new Date().getTime();
        if (diff <= 0) return 'Closed';
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        if (days > 0) return `${days}d ${hours}h left`;
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        return `${hours}h ${minutes}m left`;
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Governance</h1>

            <Card className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <VoteIcon />
                    <div>
                        <h2 className="text-sm text-gray-400">Your Voting Power</h2>
                        <p className="text-2xl font-bold text-white">{votingPower.toLocaleString()} RTD</p>
                    </div>
                </div>
                <p className="text-sm text-gray-400 text-center sm:text-right max-w-xs">
                    Your voting power is equal to your staked RTD balance. Participate in proposals to shape the future of Echelon.
                </p>
            </Card>

            <Card>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                    <h2 className="text-xl font-semibold text-white">Proposals</h2>
                    <div className="flex-shrink-0 flex items-center bg-slate-700/50 border border-slate-700 rounded-lg p-1 space-x-1">
                        {(['All', 'Active', 'Passed', 'Failed'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-sm font-semibold rounded-md transition ${filter === f ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-slate-600'}`}>{f}</button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    {filteredProposals.map(proposal => (
                         <button 
                            key={proposal.id} 
                            onClick={() => setSelectedProposal(proposal)}
                            className="w-full text-left p-4 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                        >
                            <div className="flex items-center gap-4">
                                <StatusIcon status={proposal.status} />
                                <div>
                                    <p className="font-bold text-white">{proposal.id}: {proposal.title}</p>
                                    <p className="text-xs text-gray-500 font-mono">Proposer: {proposal.proposer}</p>
                                </div>
                            </div>
                            <div className="text-sm text-right flex-shrink-0">
                                <p className="font-semibold text-gray-300">
                                    {proposal.status === 'Active' ? countdown(proposal.endDate) : proposal.status}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Ends {proposal.endDate.toLocaleDateString()}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </Card>
             {selectedProposal && (
                <ProposalModal
                    proposal={selectedProposal}
                    userVote={userVotes[selectedProposal.id]}
                    votingPower={votingPower}
                    onClose={() => setSelectedProposal(null)}
                    onVote={(vote) => {
                        onVote(selectedProposal.id, vote);
                        // Optimistically update the proposal in the modal
                        setSelectedProposal(prev => {
                            if (!prev) return null;
                            return {
                                ...prev,
                                votes: {
                                    ...prev.votes,
                                    [vote]: prev.votes[vote] + votingPower,
                                }
                            };
                        });
                    }}
                />
            )}
        </div>
    );
};

export default Governance;