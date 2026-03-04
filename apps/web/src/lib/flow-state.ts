import type { FlowDraftState } from '@/lib/contracts';

export const FLOW_DRAFT_KEY = 'cryptopay:web:flow-draft';

export const EMPTY_FLOW_DRAFT: FlowDraftState = {
  recipientId: null,
  recipient: null,
  quote: null,
  transfer: null,
  updatedAt: new Date(0).toISOString()
};

function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isValidDraftTransfer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const transfer = value as {
    transferId?: unknown;
    depositAddress?: unknown;
    routeKind?: unknown;
    fundingMode?: unknown;
    quote?: unknown;
  };

  return Boolean(
    typeof transfer.transferId === 'string' &&
      transfer.transferId.trim() &&
      typeof transfer.depositAddress === 'string' &&
      transfer.depositAddress.trim() &&
      (transfer.routeKind === 'address_route' || transfer.routeKind === 'solana_program_pay') &&
      (transfer.fundingMode === 'copy_address_auto' || transfer.fundingMode === 'program_pay_legacy') &&
      transfer.quote &&
      typeof transfer.quote === 'object'
  );
}

export function readFlowDraft(): FlowDraftState {
  if (!inBrowser()) return EMPTY_FLOW_DRAFT;

  const raw = window.sessionStorage.getItem(FLOW_DRAFT_KEY);
  if (!raw) {
    return EMPTY_FLOW_DRAFT;
  }

  try {
    const parsed = JSON.parse(raw) as FlowDraftState;
    const transfer = isValidDraftTransfer(parsed.transfer) ? parsed.transfer : null;
    return {
      ...EMPTY_FLOW_DRAFT,
      ...parsed,
      transfer
    };
  } catch {
    return EMPTY_FLOW_DRAFT;
  }
}

export function writeFlowDraft(next: FlowDraftState): void {
  if (!inBrowser()) return;
  window.sessionStorage.setItem(FLOW_DRAFT_KEY, JSON.stringify(next));
}

export function patchFlowDraft(patch: Partial<FlowDraftState>): FlowDraftState {
  const current = readFlowDraft();
  const next: FlowDraftState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeFlowDraft(next);
  return next;
}

export function clearFlowDraft(): void {
  if (!inBrowser()) return;
  window.sessionStorage.removeItem(FLOW_DRAFT_KEY);
}
