// Leg 2 landmark group m4 (docs/plans/leg2-landmarks.md §4): one DetailFn per landmark id; empty = the generic renderer.
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { DetailFn } from './index.ts';

export const details: Partial<Record<LandmarkId, DetailFn>> = {};
