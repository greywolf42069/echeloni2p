

import React, { useState, useEffect } from 'react';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
import { WORKFLOW_TEMPLATES } from '../workflowTemplates.ts';
import type { Workflow, WorkflowTemplate, WorkflowConfig, WorkflowStatus } from '../types';
import Card from './ui/Card.tsx';

interface WorkflowEditorModalProps {
    workflowToEdit?: Workflow;
    onClose: () => void;
    onSave: (workflow: Workflow) => void;
}

const StepIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => {
    const steps = ['Select Template', 'Configure', 'Review & Save'];
    return (
        <div className="flex items-center justify-center mb-6">
            {steps.map((step, index) => (
                <React.Fragment key={index}>
                    <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep >= index + 1 ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400'}`}>
                            {index + 1}
                        </div>
                        <span className={`ml-2 text-sm hidden sm:inline ${currentStep >= index + 1 ? 'text-white' : 'text-gray-500'}`}>{step}</span>
                    </div>
                    {index < steps.length - 1 && <div className={`flex-auto border-t-2 mx-4 ${currentStep > index + 1 ? 'border-purple-600' : 'border-slate-700'}`}></div>}
                </React.Fragment>
            ))}
        </div>
    );
};

// New component to render icons from path data
const WorkflowTemplateIcon: React.FC<{ paths: string[] }> = ({ paths }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {paths.map((pathData, index) => (
            <path key={index} strokeLinecap="round" strokeLinejoin="round" d={pathData} />
        ))}
    </svg>
);


const WorkflowEditorModal: React.FC<WorkflowEditorModalProps> = ({ workflowToEdit, onClose, onSave }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
    const [formData, setFormData] = useState<Partial<Workflow>>({});

    useEffect(() => {
        if (workflowToEdit) {
            const template = WORKFLOW_TEMPLATES.find(t => t.id === workflowToEdit.templateId);
            setSelectedTemplate(template || null);
            setFormData(workflowToEdit);
            setCurrentStep(2); // Start at config step for editing
        }
    }, [workflowToEdit]);

    const handleTemplateSelect = (template: WorkflowTemplate) => {
        setSelectedTemplate(template);
        setFormData({
            id: `wf_${Date.now()}`,
            templateId: template.id,
            title: template.title,
            description: '',
            status: 'Paused',
            config: {},
            lastRun: 'Never',
            runCount: 0,
        });
        setCurrentStep(2);
    };

    const handleFormChange = (newConfig: Partial<WorkflowConfig>) => {
        setFormData(prev => ({
            ...prev,
            config: { ...prev.config, ...newConfig }
        }));
    };
    
    const handleDetailsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleStatusChange = (status: WorkflowStatus) => {
        setFormData(prev => ({ ...prev, status }));
    }

    const handleSave = () => {
        if (!formData.title || !formData.id || !formData.templateId) {
            alert('Workflow data is incomplete.');
            return;
        }
        onSave(formData as Workflow);
    };

    const renderConfigForm = () => {
        if (!selectedTemplate) return <p className="text-center text-red-400">Error: No template selected.</p>;

        switch(selectedTemplate.id) {
            case 'mirror-blog':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-400 block mb-1">Blog RSS/Atom Feed URL</label>
                            <input type="url" placeholder="https://example.com/feed.xml" value={formData.config?.rssUrl || ''} onChange={(e) => handleFormChange({ rssUrl: e.target.value })} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono" />
                        </div>
                        <div>
                            <label className="text-sm text-gray-400 block mb-1">Target I2P Eepsite Address</label>
                            <input type="text" placeholder="my-blog.i2p" value={formData.config?.eepsiteAddress || ''} onChange={(e) => handleFormChange({ eepsiteAddress: e.target.value })} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono" />
                        </div>
                    </div>
                );
            case 'peer-health':
                 return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-400 block mb-1">Peer Addresses to Monitor</label>
                            <textarea placeholder="peer1.i2p, peer2.i2p, ..." value={formData.config?.peerList || ''} onChange={(e) => handleFormChange({ peerList: e.target.value })} rows={4} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono"></textarea>
                            <p className="text-xs text-gray-500 mt-1">Enter a comma-separated list of .i2p addresses.</p>
                        </div>
                    </div>
                );
            case 'auto-compound':
                 return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-400 block mb-1">Minimum Balance to Trigger Compound</label>
                            <input type="number" placeholder="10" value={formData.config?.minClaimBalance || ''} onChange={(e) => handleFormChange({ minClaimBalance: Number(e.target.value) })} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500" />
                            <p className="text-xs text-gray-500 mt-1">When accrued rewards exceed this amount, they will be re-staked.</p>
                        </div>
                    </div>
                );
            default:
                return <p className="text-center text-gray-400">This template does not require any special configuration.</p>;
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 1: // Select Template
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-white text-center mb-1">Choose a Template</h2>
                        <p className="text-gray-400 text-center mb-6">Select a pre-built workflow to get started quickly.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {WORKFLOW_TEMPLATES.map(template => (
                                <button key={template.id} onClick={() => handleTemplateSelect(template)} className="text-left p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-purple-500 hover:bg-slate-800 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="text-purple-400">
                                            <WorkflowTemplateIcon paths={template.icon} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">{template.title}</h3>
                                            <p className="text-sm text-gray-400">{template.description}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 2: // Configure
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-white text-center mb-6">Configure Workflow</h2>
                        {renderConfigForm()}
                    </div>
                );
            case 3: // Review & Save
                return (
                     <div>
                        <h2 className="text-2xl font-bold text-white text-center mb-6">Review & Save</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-400 block mb-1">Workflow Title</label>
                                <input name="title" type="text" value={formData.title || ''} onChange={handleDetailsChange} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400 block mb-1">Description (Optional)</label>
                                <textarea name="description" value={formData.description || ''} onChange={handleDetailsChange} rows={3} className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500"></textarea>
                            </div>
                            <div className="p-4 bg-slate-700/50 rounded-lg flex items-center justify-between">
                                <span className="font-semibold text-white">Activate on Save</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={formData.status === 'Active'} onChange={(e) => handleStatusChange(e.target.checked ? 'Active' : 'Paused')} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                </label>
                            </div>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex-shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold text-white">{workflowToEdit ? 'Edit Workflow' : 'Create New Workflow'}</h1>
                        <button onClick={onClose} className="p-1 text-gray-500 hover:text-white rounded-full hover:bg-slate-700/50 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {!workflowToEdit && <StepIndicator currentStep={currentStep} />}
                </div>

                <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                    {renderStepContent()}
                </div>

                <div className="flex-shrink-0 pt-6 mt-6 border-t border-slate-700 flex items-center justify-end gap-3">
                     {currentStep > 1 && (
                        <button onClick={() => setCurrentStep(prev => prev - 1)} className="px-4 py-2 bg-slate-700/50 text-gray-300 font-semibold rounded-md hover:bg-slate-700 transition">
                            Back
                        </button>
                    )}
                    {currentStep < 3 ? (
                         <button onClick={() => setCurrentStep(prev => prev + 1)} disabled={!selectedTemplate} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:bg-slate-600">
                            Next
                        </button>
                    ) : (
                        <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">
                           {workflowToEdit ? 'Save Changes' : 'Save Workflow'}
                        </button>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default WorkflowEditorModal;