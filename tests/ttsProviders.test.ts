import { describe, it, expect } from 'vitest';
import {
  extractAudioBase64FromPayload,
  collectAudioFromStreamBody,
  normalizeInworldVoice,
  dedupeVoices
} from '../server/ttsProviders.js';

describe('ttsProviders', () => {
  it('extracts nested audio payload fragments', () => {
    const payload = {
      result: {
        chunk: {
          audioContent: 'QUJD'
        }
      }
    };

    expect(extractAudioBase64FromPayload(payload)).toBe('QUJD');
  });

  it('collects base64 chunks from stream body', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"audio":"QUJD"}\n'));
        controller.enqueue(encoder.encode('data: {"result":{"audioContent":"REVG"}}\n'));
        controller.close();
      }
    });

    const base64 = await collectAudioFromStreamBody(stream);
    expect(base64).toBe('QUJDREVG');
  });

  it('normalizes and deduplicates inworld voices', () => {
    const sourceA = normalizeInworldVoice(
      { id: 'voice-1', displayName: 'Voice One', language: 'en-US', labels: ['calm'] },
      'inworld-premade',
      false
    );
    const sourceB = normalizeInworldVoice(
      { id: 'voice-1', tags: ['narrator'] },
      'inworld-custom',
      true
    );
    const merged = dedupeVoices([sourceA, sourceB].filter(Boolean));

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('voice-1');
    expect(merged[0].labels).toEqual(expect.arrayContaining(['calm', 'narrator']));
  });
});
