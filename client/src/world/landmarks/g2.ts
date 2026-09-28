// Group g2: Bir-Hakeim, Alexandre III, Pont Neuf, Pont des Arts, Alma + Flamme (§1 #3, #7, #18, #19, #26).
// docs/plans/phase2b-assets.md. Owned by the g2 agent: register a DetailFn per landmark id; ids without one get the
// generic S3DB renderer (index.ts generic(), which a DetailFn may call and add to).
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { DetailFn } from './index.ts';

export const details: Partial<Record<LandmarkId, DetailFn>> = {};
