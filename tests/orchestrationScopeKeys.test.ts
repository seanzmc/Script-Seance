import { describe, expect, it } from 'vitest';
import { scopeKeys } from '../services/orchestration/scopeKeys';

describe('scopeKeys', () => {
  it('builds canonical keys for all refined-spec operations', () => {
    expect(scopeKeys.titleSuggestion('s1')).toBe('script:s1:title');
    expect(scopeKeys.generateOpeningScene('s1')).toBe('script:s1:scene:opening');
    expect(scopeKeys.generateNextScene('s1')).toBe('script:s1:scene:next');
    expect(scopeKeys.suggestPlotTwist('s1')).toBe('script:s1:twist');
    expect(scopeKeys.rewriteBlock('s1', 'b1')).toBe('script:s1:block:b1:rewrite');
    expect(scopeKeys.insertSurpriseText('s1', 'top')).toBe('script:s1:insert:top');
    expect(scopeKeys.insertSurpriseText('s1', 2)).toBe('script:s1:insert:2');
    expect(scopeKeys.setupSurprise('setup-1')).toBe('setup:setup-1:surprise');
    expect(scopeKeys.setupAutoSurprise('setup-1')).toBe('setup:setup-1:auto-surprise');
    expect(scopeKeys.ttsPlaybackPrefetch('s1')).toBe('script:s1:tts:playback');
    expect(scopeKeys.ttsPlaybackRefresh('s1')).toBe('script:s1:tts:playback');
    expect(scopeKeys.ttsPreview('s1', 'voice-1')).toBe('script:s1:tts:preview:voice-1');
    expect(scopeKeys.ttsBlockRetry('s1', 'b1')).toBe('script:s1:block:b1:tts-retry');
  });
});
