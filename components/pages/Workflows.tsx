

import React, { useState } from 'react';
import WorkflowCard from '../WorkflowCard.tsx';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
import { WORKFLOW_DATA } from '../../data.ts';
import type { Workflow } from '../../types';
import WorkflowEditorModal from '../WorkflowEditorModal.tsx';

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);


const Workflows: React.FC = () => {
    const [workflows, setWorkflows] = useState<Workflow[]>(WORKFLOW_DATA);
    const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>(undefined);

    const handleOpenEditor = (workflow?: Workflow) => {
        setEditingWorkflow(workflow);
        setIsEditorOpen(true);
    };

    const handleCloseEditor = () => {
        setIsEditorOpen(false);
        setEditingWorkflow(undefined);
    };

    const handleSaveWorkflow = (workflowToSave: Workflow) => {
        if (workflows.some(wf => wf.id === workflowToSave.id)) {
            // Update existing
            setWorkflows(prev => prev.map(wf => wf.id === workflowToSave.id ? workflowToSave : wf));
        } else {
            // Add new
            setWorkflows(prev => [...prev, workflowToSave]);
        }
        handleCloseEditor();
    };

    const handleToggleStatus = (id: string) => {
        setWorkflows(prev =>
            prev.map(wf => {
                if (wf.id === id && wf.status !== 'Error') {
                    return { ...wf, status: wf.status === 'Active' ? 'Paused' : 'Active' };
                }
                return wf;
            })
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Automated Workflows</h1>
                    <p className="text-gray-400 mt-1">Manage, monitor, and create automated tasks for the Echelon meshnet.</p>
                </div>
                <button 
                    onClick={() => handleOpenEditor()}
                    className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center">
                    <PlusIcon />
                    Create New Workflow
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {workflows.map(workflow => (
                    <WorkflowCard 
                        key={workflow.id} 
                        workflow={workflow} 
                        onToggleStatus={() => handleToggleStatus(workflow.id)}
                        onEdit={() => handleOpenEditor(workflow)}
                    />
                ))}
            </div>

            {isEditorOpen && (
                <WorkflowEditorModal
                    workflowToEdit={editingWorkflow}
                    onClose={handleCloseEditor}
                    onSave={handleSaveWorkflow}
                />
            )}
        </div>
    );
};

export default Workflows;