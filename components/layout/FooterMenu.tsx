import React from 'react';
import type { Page } from '../../types';

export interface NavItem {
    page: Page;
    label: string;
    icon: React.ReactNode;
}

interface FooterMenuProps {
    currentPage: Page;
    setPage: (page: Page) => void;
    /** Ordered list of footer nav entries. App.tsx decides which based on feature flags. */
    items: ReadonlyArray<NavItem>;
}

const NavButton: React.FC<{
    item: NavItem;
    currentPage: Page;
    setPage: (page: Page) => void;
}> = ({ item, currentPage, setPage }) => {
    const isActive = currentPage === item.page;
    return (
        <button
            onClick={() => setPage(item.page)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 ${
                isActive ? 'text-purple-400' : 'text-gray-400 hover:text-gray-200'
            }`}
        >
            {item.icon}
            <span className={`mt-1 text-xs font-medium ${isActive ? 'text-purple-400' : 'text-gray-500'}`}>
                {item.label}
            </span>
        </button>
    );
};

const FooterMenu: React.FC<FooterMenuProps> = ({ currentPage, setPage, items }) => {
    if (items.length === 0) return null;
    return (
        <footer className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/80 backdrop-blur-sm border-t border-slate-800">
            <nav className="flex items-center justify-around max-w-7xl mx-auto px-2">
                {items.map(item => (
                    <NavButton
                        key={item.page}
                        item={item}
                        currentPage={currentPage}
                        setPage={setPage}
                    />
                ))}
            </nav>
        </footer>
    );
};

export default FooterMenu;
