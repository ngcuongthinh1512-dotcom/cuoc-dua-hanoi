// Group g4: Grand/Petit Palais, Orsay, Palais Bourbon, Invalides dome + Hôtel, École Militaire, Rodin, Chaillot/Trocadéro, Palais de Tokyo (§1 #2, #6, #8, #9, #12, #17, #27–29).
// docs/plans/phase2b-assets.md. Owned by the g4 agent: register a DetailFn per landmark id; ids without one get the
// generic S3DB renderer (index.ts generic(), which a DetailFn may call and add to).
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { DetailFn } from './index.ts';

export const details: Partial<Record<LandmarkId, DetailFn>> = {};
