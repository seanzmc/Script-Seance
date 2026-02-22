import {
  Outcome,
  Receipt,
  RunOptions
} from './types';

type ActiveOp = {
  opId: string;
  receipt: Receipt;
};

const isAbortError = (error: unknown) => {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  return (
    record.name === 'AbortError' ||
    record.code === 'ABORT_ERR' ||
    record.code === 'REQUEST_ABORTED'
  );
};

const createOpId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type DebugWindow = Window & {
  __SS_DEBUG_AI_ABORTS__?: boolean;
};

const isAbortDebugEnabled = () =>
  typeof window !== 'undefined' &&
  Boolean((window as DebugWindow).__SS_DEBUG_AI_ABORTS__);

const debugAbortLog = (event: string, details: Record<string, unknown>) => {
  if (!isAbortDebugEnabled()) {
    return;
  }
  console.info(`[orchestrator:${event}]`, details);
};

export class GenerationOrchestrator {
  private activeByScope = new Map<string, ActiveOp>();

  public cancelScope(scopeKey: string): boolean {
    const active = this.activeByScope.get(scopeKey);
    if (!active) {
      return false;
    }
    active.receipt.status = 'aborted';
    active.receipt.abortController.abort('cancelled');
    this.activeByScope.delete(scopeKey);
    return true;
  }

  public async run<T>(options: RunOptions<T>): Promise<Outcome<T>> {
    const nextOpId = createOpId();
    const previous = this.activeByScope.get(options.scopeKey);
    if (previous) {
      debugAbortLog('abort-prior', {
        scopeKey: options.scopeKey,
        priorOpId: previous.opId,
        priorOpType: previous.receipt.opType,
        newOpId: nextOpId,
        newOpType: options.opType
      });
      previous.receipt.status = 'aborted';
      previous.receipt.abortController.abort('superseded');
    }

    const receipt: Receipt = {
      opId: nextOpId,
      opType: options.opType,
      scopeKey: options.scopeKey,
      startedAt: Date.now(),
      trigger: options.trigger ?? 'user',
      abortController: new AbortController(),
      status: 'started',
      metadata: options.metadata
    };

    this.activeByScope.set(options.scopeKey, { opId: receipt.opId, receipt });

    try {
      const value = await options.execute(receipt.abortController.signal, receipt);

      if (receipt.abortController.signal.aborted) {
        receipt.status = 'aborted';
        return { kind: 'aborted', reason: 'aborted', receipt };
      }

      receipt.status = 'resolved';
      const active = this.activeByScope.get(receipt.scopeKey);
      if (!active || active.opId !== receipt.opId) {
        receipt.status = 'dropped';
        return { kind: 'dropped', reason: 'superseded', receipt };
      }

      if (!options.isFresh(receipt)) {
        receipt.status = 'dropped';
        return { kind: 'dropped', reason: 'stale', receipt };
      }

      await options.commit(value, receipt);
      receipt.status = 'committed';
      return { kind: 'committed', value, receipt };
    } catch (error) {
      if (receipt.abortController.signal.aborted || isAbortError(error)) {
        receipt.status = 'aborted';
        const reasonValue = receipt.abortController.signal.reason;
        const reason = reasonValue === 'superseded'
          ? 'superseded'
          : reasonValue === 'cancelled'
          ? 'cancelled'
          : 'aborted';
        return { kind: 'aborted', reason, receipt };
      }

      receipt.status = 'failed';
      return { kind: 'failed', error, receipt };
    } finally {
      const active = this.activeByScope.get(receipt.scopeKey);
      if (active && active.opId === receipt.opId) {
        this.activeByScope.delete(receipt.scopeKey);
      }
    }
  }
}
