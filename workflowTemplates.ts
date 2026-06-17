import { WorkflowTemplate } from './types';

// Icons for templates, defined as arrays of SVG path data strings.
const blogIconPaths: string[] = ["M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 1V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-5l-2.5-2.5L17 16V7.5M14 12a2 2 0 11-4 0 2 2 0 014 0z"];

const healthCheckIconPaths: string[] = [
    "M4.5 12.75l6 6 9-13.5",
    "M21.75 9v.75A9.75 9.75 0 0112 21.75 9.75 9.75 0 012.25 12 9.75 9.75 0 0112 2.25c1.556 0 3.041.372 4.382 1.053"
];

const autoCompoundIconPaths: string[] = ["M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-4.991-2.693L7.985 5.356m0 0v4.992m0 0h4.992"];

const ipfsIconPaths: string[] = ["M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"];


export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    { id: 'mirror-blog', title: 'Mirror Blog to I2P', description: 'Sync a public blog (RSS/Atom) to an I2P eepsite.', icon: blogIconPaths },
    { id: 'peer-health', title: 'Peer Health Check', description: 'Monitor a list of I2P peers and get notified on downtime.', icon: healthCheckIconPaths },
    { id: 'auto-compound', title: 'Staking Reward Auto-Compound', description: 'Automatically re-stake your RTD rewards to maximize gains.', icon: autoCompoundIconPaths },
    { id: 'ipfs-pin', title: 'IPFS Content Pinning', description: 'Watch a local directory and pin new files to IPFS.', icon: ipfsIconPaths },
];