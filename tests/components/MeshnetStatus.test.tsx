/**
 * MeshnetStatus.tsx tests — pure render with a stats fixture.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MeshnetStatus from '../../components/MeshnetStatus';
import { EMPTY_STATS, type I2pStats } from '../../hooks/useI2pStats';

const sample: I2pStats = {
    ...EMPTY_STATS,
    running: true,
    version: '2.55.0',
    networkStatus: 'OK',
    receivedBps: 12 * 1024,        // 12 KiB/s
    sentBps: 6 * 1024,             // 6 KiB/s
    transitBps: 30 * 1024,         // 30 KiB/s
    totalReceivedBytes: 12 * 1024 * 1024,   // 12 MiB
    totalSentBytes: 6 * 1024 * 1024,
    totalTransitBytes: 100 * 1024 * 1024,   // 100 MiB
    routers: 3214,
    floodfills: 174,
    leaseSets: 56,
    tunnelsClient: 12,
    tunnelsTransit: 47,
};

describe('<MeshnetStatus />', () => {
    it('renders the i2pd version in the header', () => {
        render(<MeshnetStatus stats={sample} />);
        expect(screen.getByText(/i2pd 2\.55\.0/)).toBeInTheDocument();
    });

    it('renders router count, network status, floodfills', () => {
        render(<MeshnetStatus stats={sample} />);
        expect(screen.getByText('3,214')).toBeInTheDocument();
        expect(screen.getByText('OK')).toBeInTheDocument();
        expect(screen.getByText('174')).toBeInTheDocument();
    });

    it('renders bandwidth in human units', () => {
        render(<MeshnetStatus stats={sample} />);
        // 12 KiB/s + 6 KiB/s present.
        expect(screen.getByText('12.0 KiB/s')).toBeInTheDocument();
        expect(screen.getByText('6.0 KiB/s')).toBeInTheDocument();
        // Transit shown separately.
        expect(screen.getByText(/Transit:.*30\.0 KiB\/s/)).toBeInTheDocument();
    });

    it('renders tunnel totals + breakdown', () => {
        render(<MeshnetStatus stats={sample} />);
        // Active tunnels = client + transit = 59
        expect(screen.getByText('59')).toBeInTheDocument();
        expect(screen.getByText(/12 client · 47 transit/)).toBeInTheDocument();
    });

    it('renders total transit volume', () => {
        render(<MeshnetStatus stats={sample} />);
        expect(screen.getByText(/100\.0 MiB/)).toBeInTheDocument();
    });

    it('handles zeroed/idle stats without crashing', () => {
        render(<MeshnetStatus stats={EMPTY_STATS} />);
        expect(screen.getByText(/Meshnet Status/)).toBeInTheDocument();
        // Routers count = 0
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
});
