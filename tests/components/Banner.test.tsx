import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import Banner from '../../components/ui/Banner';

describe('Banner', () => {
    it('renders with the default title for kind="devnet"', () => {
        render(<Banner kind="devnet">Subscriptions are processed on the test network.</Banner>);
        expect(screen.getByText('Devnet')).toBeInTheDocument();
        expect(screen.getByText(/Subscriptions are processed/)).toBeInTheDocument();
    });

    it('renders with the default title for kind="comingV02"', () => {
        render(<Banner kind="comingV02">Staking activates at v0.2 launch.</Banner>);
        expect(screen.getByText(/Coming with v0\.2/)).toBeInTheDocument();
    });

    it('renders with the default title for kind="beta"', () => {
        render(<Banner kind="beta">RTD is not yet live.</Banner>);
        expect(screen.getByText(/v0\.1 beta/)).toBeInTheDocument();
    });

    it('uses custom title when provided', () => {
        render(<Banner kind="devnet" title="Testnet only">…</Banner>);
        expect(screen.getByText('Testnet only')).toBeInTheDocument();
        expect(screen.queryByText('Devnet')).toBeNull();
    });

    it('exposes data-banner-kind for scripted detection (test hooks)', () => {
        const { container } = render(
            <Banner kind="comingV02">Whatever</Banner>,
        );
        const banner = container.querySelector('[data-banner-kind]');
        expect(banner).not.toBeNull();
        expect(banner!.getAttribute('data-banner-kind')).toBe('comingV02');
    });

    it('has role=status for accessibility', () => {
        render(<Banner kind="info">test</Banner>);
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders children content', () => {
        render(<Banner kind="info">Hello there <strong>friend</strong></Banner>);
        expect(screen.getByText(/Hello there/)).toBeInTheDocument();
        expect(screen.getByText('friend')).toBeInTheDocument();
    });

    it('accepts a custom className that gets merged in', () => {
        const { container } = render(
            <Banner kind="info" className="my-custom">test</Banner>,
        );
        const el = container.querySelector('[data-banner-kind]');
        expect(el!.className).toContain('my-custom');
    });
});
