import sharedGenres from '../../shared/catalog/genres.json';

const sanitizeLoadingCopy = (entries: readonly string[]) => (
  entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
);

export const SCENE_GENERATION_LOADING_COPY = {
  core: sanitizeLoadingCopy([
    "It said 'delve.' It always says 'delve.'",
    'The plot hole is load-bearing.',
    "CONT'D forever.",
    'Still in development. Always in development.',
    'Nobody asked for five alternatives.',
    "Removing 'certainly!' from every line.",
    'The second act is a hostage situation.'
  ]),
  messier: sanitizeLoadingCopy([
    'Nobody greenlit this.',
    "We're in the wrong genre.",
    'The listicle is being tried as a person.',
    "It started with 'Great question!' Fixing that.",
    'INT. VOID - CONTINUOUS',
    'Cutting the part where it apologized.',
    "It used 'tapestry' again.",
    'Burning the treatment. Starting fresh.'
  ]),
  unhinged: sanitizeLoadingCopy([
    'The villain was right.',
    "This draft doesn't leave the room.",
    'The scene knows too much.',
    "It ended with 'I hope this helps!' It didn't.",
    'Three paragraphs of throat-clearing. Gone.',
    'We are past the outline.',
    'The AI had thoughts. Too many thoughts.'
  ]),
  genreSpecific: {
    'Sci-Fi': sanitizeLoadingCopy([
      'Rebooting the timeline. Again.',
      'The AI became self-aware. Briefly.',
      'Calculating odds. Ignoring them.',
      'Hull breach in act two.',
      "This wasn't in the mission parameters.",
      'The timeline is unstable. Keep typing.',
      'We opened the airlock for a better idea.',
      'The machine became sentient halfway through this scene.',
      "Reality desynced. We're writing through it.",
      'Calibrating the catastrophe engine.',
      'The plot is a paradox. Embracing it.'
    ]),
    Noir: sanitizeLoadingCopy([
      "The city doesn't care about your outline.",
      "Following a lead that's probably dead.",
      "It's always the third draft, sweetheart.",
      'Somewhere a typewriter is lying.',
      'The dame had notes. Bad ones.',
      "Someone is lying, and it's probably the narration.",
      'Pouring rain on the truth until it talks.',
      'The alibi collapsed under a streetlight.',
      'We lit a cigarette and the plot got worse.',
      'Every lead is dirty. Follow it anyway.'
    ]),
    Comedy: sanitizeLoadingCopy([
      'Timing the pause. Nailing it. Ruining it.',
      'The joke landed. Explaining it anyway.',
      "Someone's going to trip. It's structural.",
      'The bit is too long. Making it longer.',
      'Yes-anding into the void.',
      'This is the wrong choice. Great, use that.',
      'Escalating a tiny problem into public ruin.',
      'The scene was normal for three seconds.',
      'Adding a laugh track. Removing it. Adding it again.',
      'Weaponizing awkward silence.',
      'Chasing the joke past the point of safety.'
    ]),
    Horror: sanitizeLoadingCopy([
      "Something's in the second act.",
      'The script keeps rewriting itself.',
      "Don't go in the third act. Too late.",
      'The notes came from inside the house.',
      'The shadows are longer than they should be.',
      'It was the outline all along.',
      'Something heard us outline this.',
      'The scene is breathing on its own now.',
      'Opening the door nobody should open.',
      'We lost the light and kept writing.',
      'Tightening the dread until it snaps.',
      ''
    ]),
    Romance: sanitizeLoadingCopy([
      'They were almost on the same page.',
      'The chemistry is off. Fixing it.',
      'Delaying the obvious for forty more pages.',
      "Someone's about to ruin a wedding.",
      'The meet-cute needs another cute.',
      'Crying. For craft reasons.',
      'Misreading the signal with full confidence.',
      'Staring too long. Calling it tension.',
      'Ruining the moment for emotional flavor.',
      'One glance from disaster.',
      'Forcing fate to sit at the same table.',
      'The love interest is a liar.'
    ]),
    Fantasy: sanitizeLoadingCopy([
      'The prophecy was vague on purpose.',
      'The world is bigger than we thought.',
      'Consulting the lore. It contradicts itself.',
      'The map is wrong. The map is always wrong.',
      'Killing a character who had a name.',
      'The chosen one is having second thoughts.',
      'The magic system is more complicated than it looks.',
      'The prophecy is being rewritten mid-omens.',
      'Summoning trouble with excellent posture.',
      'The kingdom is doomed, but beautifully.',
      'Enchanting the bad decision until it glows.',
      'Rolling fate downhill and chasing it.'
    ]),
    Thriller: sanitizeLoadingCopy([
      'Someone knows too much. Trimming.',
      'The twist is load-bearing. Checking it.',
      'The reveal is too obvious. Making it less obvious.',
      'Act three just got a tail.',
      'Burning the document. Regenerating it.',
      'Trust no one. Especially the outline.',
      "Following the red herring. It's a good one.",
      'Pulling one thread and losing the whole room.',
      'The plan is cracked. Proceed faster.',
      'Trusting the wrong person for momentum.',
      'We are now several decisions past safe.',
      'Turning suspicion into architecture.'
    ])
  }
} as const;

const CANONICAL_GENRES = new Set<string>(sharedGenres);
const GENRE_LOADING_COPY_SCHEDULE = ['genre', 'core', 'genre', 'messier', 'genre', 'unhinged'] as const;
const SHARED_LOADING_COPY_SCHEDULE = ['core', 'messier', 'unhinged'] as const;

type SceneGenerationLoadingCopyBucket = 'genre' | 'core' | 'messier' | 'unhinged';

const buildSceneGenerationLoadingCopy = (
  schedule: readonly SceneGenerationLoadingCopyBucket[],
  buckets: Record<SceneGenerationLoadingCopyBucket, readonly string[]>
) => {
  const bucketIndexes: Record<SceneGenerationLoadingCopyBucket, number> = {
    genre: 0,
    core: 0,
    messier: 0,
    unhinged: 0
  };
  const messages: string[] = [];

  while (true) {
    let appendedMessage = false;

    for (const bucketName of schedule) {
      const bucket = buckets[bucketName];
      const nextIndex = bucketIndexes[bucketName];
      const nextMessage = bucket[nextIndex];
      if (!nextMessage) {
        continue;
      }
      messages.push(nextMessage);
      bucketIndexes[bucketName] = nextIndex + 1;
      appendedMessage = true;
    }

    if (!appendedMessage) {
      return messages;
    }
  }
};

export const getSceneGenerationLoadingMessages = (genre?: string): readonly string[] => {
  const genreMessages = typeof genre === 'string' && CANONICAL_GENRES.has(genre)
    ? SCENE_GENERATION_LOADING_COPY.genreSpecific[genre as keyof typeof SCENE_GENERATION_LOADING_COPY.genreSpecific] ?? []
    : [];
  const schedule = genreMessages.length > 0
    ? GENRE_LOADING_COPY_SCHEDULE
    : SHARED_LOADING_COPY_SCHEDULE;

  return buildSceneGenerationLoadingCopy(schedule, {
    genre: genreMessages,
    core: SCENE_GENERATION_LOADING_COPY.core,
    messier: SCENE_GENERATION_LOADING_COPY.messier,
    unhinged: SCENE_GENERATION_LOADING_COPY.unhinged
  });
};

export const SCENE_GENERATION_LOADING_COPY_INTERVAL_MS = 2000;
