import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import FooterMenu, { type NavItem } from '../../components/layout/FooterMenu';
import type { Page } from '../../types';

const Icon: React.FC<{ label: string }> = ({ label }) => (
    <svg data-testid={`icon-${label}`} aria-hidden="true" />
);

const makeItems = (...pages: Page[]): NavItem[] =>
    pages.map(page => ({
        page,
        label: page.charAt(0).toUpperCase() + page.slice(1),
        icon: <Icon label={page} />,
    }));

describe('FooterMenu', () => {
    it('renders one button per nav item', () => {
        const items = makeItems('dashboard', 'browser', 'protect');
        render(<FooterMenu currentPage="dashboard" setPage={vi.fn()} items={items} />);
        expect(screen.getByRole('button', { name: /Dashboard/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Browser/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Protect/ })).toBeInTheDocument();
    });

    it('marks the current page with aria-current="page"', () => {
        const items = makeItems('dashboard', 'browser');
        render(<FooterMenu currentPage="browser" setPage={vi.fn()} items={items} />);
        expect(screen.getByRole('button', { name: /Browser/ })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: /Dashboard/ })).not.toHaveAttribute('aria-current');
    });

    it('calls setPage with the corresponding page when a button is clicked', () => {
        const setPage = vi.fn();
        const items = makeItems('dashboard', 'browser', 'wallet');
        render(<FooterMenu currentPage="dashboard" setPage={setPage} items={items} />);
        fireEvent.click(screen.getByRole('button', { name: /Wallet/ }));
        expect(setPage).toHaveBeenCalledWith('wallet');
    });

    it('renders nothing when items is empty', () => {
        const { container } = render(
            <FooterMenu currentPage="dashboard" setPage={vi.fn()} items={[]} />,
        );
        expect(container.querySelector('footer')).toBeNull();
    });

    it('reflects token-gated nav items disappearing when items prop changes', () => {
        const v0_1 = makeItems('dashboard', 'browser', 'protect', 'wallet');
        const v0_2 = makeItems('dashboard', 'staking', 'governance');

        const { rerender } = render(
            <FooterMenu currentPage="dashboard" setPage={vi.fn()} items={v0_1} />,
        );
        expect(screen.getByRole('button', { name: /Browser/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Staking/ })).toBeNull();

        rerender(
            <FooterMenu currentPage="dashboard" setPage={vi.fn()} items={v0_2} />,
        );
        expect(screen.getByRole('button', { name: /Staking/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Browser/ })).toBeNull();
    });

    it('renders the icon node passed through', () => {
        const items = makeItems('dashboard');
        render(<FooterMenu currentPage="dashboard" setPage={vi.fn()} items={items} />);
        expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument();
    });
});
