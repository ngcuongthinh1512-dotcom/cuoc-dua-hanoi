// Phase 8 track C (dev only, like character.html): a bare RaceHud with recording actions, driven by scripts/hud-check.ts
import './ui/hud.css';
import type { ClueCard, RaceView } from '@race/shared/protocol';
import { RaceHud } from './race/ui/RaceHud.ts';

const calls: unknown[][] = [];
const opens: boolean[] = [];
const rec = (n: string) => (...a: unknown[]) => void calls.push([n, ...a]);
const hud = new RaceHud({ book: rec('book'), answer: rec('answer'), branch: rec('branch'), accept: rec('accept'), resolveMedia: async (n) => (n === 'none.jpg' ? null : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>')}`) }, 'Đội Xanh');
hud.onOpenChange = (o) => void opens.push(o);
const view = (card: ClueCard, o: Partial<RaceView> = {}): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card, checkinAt: null, result: null, ...o });
Object.assign(window, { hud, calls, opens, view, ready: true });
