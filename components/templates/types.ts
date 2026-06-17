/**
 * Premium template marketplace — type definitions.
 *
 * v0.1 ships with 6 designed templates: 3 free starters + 3 premium.
 * Premium templates are gated behind a one-time $19 USDC purchase
 * tracked via TemplateEntitlement (Phase E.6).
 *
 * Each template is a TemplateDescriptor that knows:
 *   - its display metadata (id, name, description, category, hero image)
 *   - whether it's free or premium
 *   - the file tree it produces when "Use this template" is clicked
 *
 * The actual marketplace UI lives in components/pages/Templates.tsx and
 * the file-tree generators live in components/templates/{free,premium}/.
 */
import type { FileTree } from '../../types.ts';

export type TemplateTier = 'free' | 'premium';

export type TemplateCategory =
    | 'Personal'
    | 'Portfolio'
    | 'Documentation'
    | 'Landing'
    | 'Forum'
    | 'Gallery';

export interface TemplateDescriptor {
    /** Stable id used for entitlement + analytics. */
    id: string;
    /** User-visible name. */
    name: string;
    /** One-sentence description shown on the gallery card. */
    description: string;
    /** Display grouping. */
    category: TemplateCategory;
    /** Free or behind the $19 USDC pack purchase. */
    tier: TemplateTier;
    /** Color accent used for the gallery card. */
    accent: 'purple' | 'teal' | 'amber' | 'rose' | 'emerald' | 'sky';
    /** Builds the FileTree this template starts with. Pure — no side effects. */
    buildFiles: () => FileTree;
}
