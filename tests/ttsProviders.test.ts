import { describe, it, expect } from 'vitest';
import {
  extractAudioBase64FromPayload,
  collectAudioFromStreamBody,
  limitInworldVoices,
  normalizeInworldVoice,
  dedupeVoices
} from '../server/ttsProviders.js';
import { resolveDefaultNarratorVoiceId } from '../shared/voiceDefaults.js';

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

  it('re-encodes padded chunks into a single valid base64 payload', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"audio":"QQ=="}\n'));
        controller.enqueue(encoder.encode('data: {"audio":"Qg=="}\n'));
        controller.close();
      }
    });

    const base64 = await collectAudioFromStreamBody(stream);
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('AB');
  });

  it('extracts audio from a single JSON payload body', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"result":{"audioContent":"UklGRg=="}}'));
        controller.close();
      }
    });

    const base64 = await collectAudioFromStreamBody(stream);
    expect(base64).toBe('UklGRg==');
  });

  it('extracts repeated audioContent keys from a single JSON response body', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"result":{"audioContent":"QQ==","audioContent":"Qg=="}}'));
        controller.close();
      }
    });

    const base64 = await collectAudioFromStreamBody(stream);
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('AB');
  });

  it('normalizes and deduplicates inworld voices', () => {
    const sourceA = normalizeInworldVoice(
      { id: 'voice-1', displayName: 'Voice One', languages: ['en-US'], labels: ['calm'], tags: ['neutral'] },
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
    expect(merged[0].language).toBe('en-US');
    expect(merged[0].labels).toEqual(expect.arrayContaining(['calm', 'narrator']));
    expect(merged[0].tags).toEqual(expect.arrayContaining(['neutral', 'narrator']));
  });

  it('limits catalog to english voices and strips unknown/general tags', () => {
    const voiceA = normalizeInworldVoice(
      {
        id: 'voice-a',
        displayName: 'Voice A',
        languages: ['en-US'],
        tags: ['general', 'expressive'],
        category: 'General',
        gender: 'Unknown'
      },
      'inworld-premade',
      false
    );
    const voiceB = normalizeInworldVoice(
      {
        id: 'voice-b',
        displayName: 'Voice B',
        languages: ['es-ES'],
        tags: ['warm']
      },
      'inworld-premade',
      false
    );
    const voiceC = normalizeInworldVoice(
      {
        id: 'voice-c',
        displayName: 'Voice C',
        language: 'en-GB',
        tags: ['calm']
      },
      'inworld-premade',
      false
    );

    const limited = limitInworldVoices([voiceA, voiceB, voiceC].filter(Boolean), 2);
    expect(limited.map((voice) => voice.id)).toEqual(['voice-a', 'voice-c']);
    expect(voiceA?.tags).toEqual(['expressive']);
    expect(voiceA?.labels).toEqual(['expressive']);
  });

  it('curates Inworld voice catalog to the supported selectable voices with metadata', () => {
    const sampleVoices = [
      normalizeInworldVoice({ id: 'v-1', displayName: 'Alex', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-2', displayName: 'Hades', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-3', displayName: 'Luna', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-4', displayName: 'Mark', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-5', displayName: 'Olivia', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-6', displayName: 'Theodore', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-7', displayName: 'Hana', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-8', displayName: 'Clive', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-9', displayName: 'Blake', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-10', displayName: 'Ashley', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-11', displayName: 'Dennis', language: 'en-US' }, 'inworld-premade', false)
    ].filter(Boolean);

    const limited = limitInworldVoices(sampleVoices, 10);
    expect(limited.map((voice) => voice.displayName)).toEqual([
      'Mark',
      'Olivia',
      'Theodore',
      'Hana',
      'Clive',
      'Blake',
      'Luna',
      'Alex',
      'Ashley',
      'Dennis'
    ]);

    const mark = limited[0];
    expect(mark.gender).toBe('Masculine');
    expect(mark.category).toBe('High Energy');
    expect(mark.autoAssignable).toBe(true);
    expect(mark.tags).toEqual(expect.arrayContaining(['articulate', 'engaging', 'narrator', 'professional']));
    expect(mark.labels).toEqual(expect.arrayContaining(['narrator', 'professional']));
  });

  it('drops disallowed Hades voices before curation so they cannot re-enter the usable catalog', () => {
    const sampleVoices = [
      normalizeInworldVoice({ id: 'v-1', displayName: 'Mark', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'v-2', displayName: 'Hades', language: 'en-US' }, 'inworld-premade', false),
      normalizeInworldVoice({ id: 'Hades', language: 'en-US' }, 'inworld-premade', false)
    ].filter(Boolean);

    const limited = limitInworldVoices(sampleVoices, 10);
    expect(limited.map((voice) => voice.displayName)).toEqual(['Mark']);
  });

  it('resolves Mark as the default narrator voice', () => {
    const voices = [
      { id: 'voice-1', displayName: 'Olivia', labels: ['feminine'], source: 'inworld-premade', isCustom: false },
      { id: 'voice-2', displayName: 'Mark', labels: ['narrator', 'professional'], source: 'inworld-premade', isCustom: false },
      { id: 'voice-3', displayName: 'Dennis', labels: ['calm'], source: 'inworld-premade', isCustom: false }
    ];

    expect(resolveDefaultNarratorVoiceId(voices)).toBe('voice-2');
  });
});
