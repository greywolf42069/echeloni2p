import React from 'react';
import Card from './ui/Card.tsx';
import type { Workflow } from '../types';

interface WorkflowCardProps {
    workflow: Workflow;
    onToggleStatus: () => void;
    onEdit: () => void;
}

const statusConfig = {
    Active: { text: 'Active', color: 'text-green-400', bg: 'bg-green-500/10' },
    Paused: { text: 'Paused', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    Error: { text: 'Error', color: 'text-red-400', bg: 'bg-red-500/10' },
};

const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;


const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, onToggleStatus, onEdit }) => {
    const { title, description, status, lastRun, runCount } = workflow;
    const currentStatus = statusConfig[status];

    return (
        <Card className="flex flex-col h-full !p-0 overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-purple-500/10">
            <div className="p-6 flex-grow">
                <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold text-white pr-4">{title}</h3>
                    <div className={`px-2 py-1 text-xs font-semibold rounded-full ${currentStatus.bg} ${currentStatus.color}`}>
                        {currentStatus.text}
                    </div>
                </div>
                <p className="text-sm text-gray-400 mb-6">{description}</p>
            </div>
            
            <div className="bg-slate-900/40 p-4 border-t border-slate-700/50">
                <div className="flex justify-between items-center text-xs text-gray-400 mb-4">
                    <span>Last run: {lastRun}</span>
                    <span>Syncs: {runCount}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={status === 'Active'} 
                            onChange={onToggleStatus} 
                            className="sr-only peer"
                            disabled={status === 'Error'}
                        />
                        <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 peer-disabled:opacity-50"></div>
                    </label>

                    <div className="flex items-center gap-1">
                        <button className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-gray-300" title="Run Now"><PlayIcon /></button>
                        <button onClick={onEdit} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-gray-300" title="Edit"><EditIcon /></button>
                        <button className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-red-400" title="Delete"><TrashIcon /></button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default WorkflowCard;