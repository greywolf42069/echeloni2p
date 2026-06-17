import React from 'react';
import Modal from './ui/Modal.tsx';
import Card from './ui/Card.tsx';
import type { Proposal, VoteOption, UserVote } from '../types';

interface ProposalModalProps {
    proposal: Proposal;
    userVote?: VoteOption;
    votingPower: number;
    onClose: () => void;
    onVote: (vote: VoteOption) => void;
}

const VoteProgressBar: React.FC<{
    label: string;
    value: number;
    total: number;
    color: string;
}> = ({ label, value, total, color }) => {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1 text-sm">
                <span className="font-semibold text-white capitalize">{label}</span>
                <span className="text-gray-400">{percentage.toFixed(2)}% ({value.toLocaleString()})</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
                <div className={`${color} h-2.5 rounded-full`} style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};

// Fix: Switched to a named export to resolve module import ambiguity.
export const ProposalModal: React.FC<ProposalModalProps> = ({ proposal, userVote, votingPower, onClose, onVote }) => {
    const totalVotes = proposal.votes.for + proposal.votes.against + proposal.votes.abstain;
    const isVoteDisabled = proposal.status !== 'Active' || !!userVote || votingPower <= 0;

    const getVoteButtonClass = (vote: VoteOption) => {
        const base = "flex-1 font-semibold py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed";
        if (userVote === vote) {
            return `${base} bg-purple-600 text-white`;
        }
        return `${base} bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-gray-500`;
    };

    return (
        <Modal title={`${proposal.id}: ${proposal.title}`} onClose={onClose}>
            <div className="space-y-6">
                <div className="max-h-48 overflow-y-auto pr-2 -mr-2">
                    <h3 className="font-semibold text-white mb-2">Description</h3>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{proposal.description}</p>
                </div>
                
                <Card>
                    <h3 className="font-semibold text-white mb-4 text-center">Current Results</h3>
                    <div className="space-y-3">
                        <VoteProgressBar label="For" value={proposal.votes.for} total={totalVotes} color="bg-green-500" />
                        <VoteProgressBar label="Against" value={proposal.votes.against} total={totalVotes} color="bg-red-500" />
                        <VoteProgressBar label="Abstain" value={proposal.votes.abstain} total={totalVotes} color="bg-slate-500" />
                    </div>
                </Card>

                {proposal.status === 'Active' && (
                    <Card>
                        <h3 className="font-semibold text-white mb-2 text-center">Cast Your Vote</h3>
                        {userVote && <p className="text-sm text-center text-purple-400 mb-4">You voted '{userVote}'.</p>}
                        <div className="flex gap-2">
                            <button onClick={() => onVote('for')} disabled={isVoteDisabled} className={getVoteButtonClass('for')}>For</button>
                            <button onClick={() => onVote('against')} disabled={isVoteDisabled} className={getVoteButtonClass('against')}>Against</button>
                            <button onClick={() => onVote('abstain')} disabled={isVoteDisabled} className={getVoteButtonClass('abstain')}>Abstain</button>
                        </div>
                        {votingPower <= 0 && <p className="text-xs text-center text-yellow-400 mt-2">You must have staked RTD to vote.</p>}
                    </Card>
                )}
            </div>
        </Modal>
    );
};
