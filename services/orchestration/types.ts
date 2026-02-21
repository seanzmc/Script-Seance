export type OperationType =
  | 'titleSuggestion'
  | 'generateOpeningScene'
  | 'generateNextScene'
  | 'suggestPlotTwist'
  | 'rewriteBlock'
  | 'insertSurpriseText'
  | 'setupSurprise'
  | 'setupAutoSurprise'
  | 'ttsPlaybackPrefetch'
  | 'ttsPlaybackRefresh'
  | 'ttsPreview'
  | 'ttsBlockRetry';

export type OperationTrigger = 'user' | 'system';

export type ReceiptStatus =
  | 'started'
  | 'resolved'
  | 'committed'
  | 'dropped'
  | 'aborted'
  | 'failed';

export type Receipt = {
  opId: string;
  opType: OperationType;
  scopeKey: string;
  startedAt: number;
  trigger: OperationTrigger;
  abortController: AbortController;
  status: ReceiptStatus;
  // Allows callers to include revision snapshots and any operation metadata.
  metadata?: Record<string, unknown>;
};

export type RunOptions<T> = {
  opType: OperationType;
  scopeKey: string;
  trigger?: OperationTrigger;
  metadata?: Record<string, unknown>;
  execute: (signal: AbortSignal, receipt: Receipt) => Promise<T>;
  isFresh: (receipt: Receipt) => boolean;
  commit: (value: T, receipt: Receipt) => void | Promise<void>;
};

export type CommittedOutcome<T> = {
  kind: 'committed';
  value: T;
  receipt: Receipt;
};

export type DroppedOutcome = {
  kind: 'dropped';
  reason: 'stale' | 'superseded';
  receipt: Receipt;
};

export type AbortedOutcome = {
  kind: 'aborted';
  reason: 'cancelled' | 'superseded' | 'aborted';
  receipt: Receipt;
};

export type FailedOutcome = {
  kind: 'failed';
  error: unknown;
  receipt: Receipt;
};

export type Outcome<T> =
  | CommittedOutcome<T>
  | DroppedOutcome
  | AbortedOutcome
  | FailedOutcome;
