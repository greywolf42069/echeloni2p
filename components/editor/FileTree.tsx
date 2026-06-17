import React from 'react';
import type { FileTree, FileContent } from '../../types';

interface FileTreeComponentProps {
    files: FileTree;
    onFileSelect: (path: string) => void;
    activeFilePath: string | null;
    /** Optional list of paths that are modified compared to last git commit */
    modifiedPaths?: string[];
}

const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
const FileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;

const FileTreeRecursive: React.FC<{
    tree: FileTree;
    onFileSelect: (path: string) => void;
    activeFilePath: string | null;
    currentPath: string;
    modifiedPaths: string[];
}> = ({ tree, onFileSelect, activeFilePath, currentPath, modifiedPaths }) => {
    return (
        <ul className="pl-4">
            {Object.entries(tree).map(([name, node]) => {
                const newPath = currentPath ? `${currentPath}/${name}` : name;
                const isModified = modifiedPaths.includes(newPath);

                if (typeof node === 'object' && node && 'content' in node) { // It's a file
                    const isActive = newPath === activeFilePath;
                    return (
                        <li key={name}>
                            <button
                                onClick={() => onFileSelect(newPath)}
                                className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-md text-sm group ${isActive ? 'bg-purple-600/50 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
                            >
                                <FileIcon />
                                <span className="truncate">{name}</span>
                                {isModified && (
                                    <span className="ml-auto text-amber-400 text-[10px] font-mono" title="Modified since last commit">M</span>
                                )}
                            </button>
                        </li>
                    );
                } else { // It's a directory
                    return (
                        <li key={name}>
                            <div className="flex items-center gap-2 px-2 py-1 text-sm text-gray-400">
                                <FolderIcon />
                                <span>{name}</span>
                            </div>
                            <FileTreeRecursive
                                tree={node as FileTree}
                                onFileSelect={onFileSelect}
                                activeFilePath={activeFilePath}
                                currentPath={newPath}
                                modifiedPaths={modifiedPaths}
                            />
                        </li>
                    );
                }
            })}
        </ul>
    );
};

const FileTreeComponent: React.FC<FileTreeComponentProps> = ({ files, onFileSelect, activeFilePath, modifiedPaths = [] }) => {
    return (
        <div className="text-white">
            <h3 className="text-sm font-semibold text-gray-400 px-2 mb-2">EXPLORER</h3>
            <FileTreeRecursive
                tree={files}
                onFileSelect={onFileSelect}
                activeFilePath={activeFilePath}
                currentPath=""
                modifiedPaths={modifiedPaths}
            />
        </div>
    );
};

export default FileTreeComponent;
