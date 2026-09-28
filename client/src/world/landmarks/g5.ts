// Group g5: Notre-Dame, Sainte-Chapelle, Conciergerie, Hôtel de Ville, Pompidou, Saint-Jacques, Saint-Sulpice, Panthéon, Luxembourg + skyline (§1 #11, #20–24, #30–32, S1–S3).
// docs/plans/phase2b-assets.md. Owned by the g5 agent: register a DetailFn per landmark id; ids without one get the
// generic S3DB renderer (index.ts generic(), which a DetailFn may call and add to).
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { DetailFn } from './index.ts';

export const details: Partial<Record<LandmarkId, DetailFn>> = {};
