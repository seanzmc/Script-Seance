export const SCENE_GENERATION_LOADING_COPY = {
  core: [
    'Breaking the scene until it works.',
    'Arguing about motivation. Again.',
    'Killing a darling. Regretting it.',
    'Rewriting the ending mid-panic.',
    'Chasing the story off the rails.'
  ],
  higherChaos: [
    'Blowing up the outline - on purpose.',
    'Someone hates this. Keep going.',
    'Fixing act two with vibes.',
    'Ignoring structure. Trusting instinct.',
    "This wasn't the plan."
  ],
  ultraIndie: [
    "We'll justify it later.",
    'The scene is lying.',
    "Nothing's sacred. Especially that line.",
    'This is the wrong choice. Do it.',
    'We are past the outline.'
  ]
} as const;

export const DEFAULT_SCENE_GENERATION_LOADING_COPY_TIER = 'core';
export const SCENE_GENERATION_LOADING_COPY_INTERVAL_MS = 2000;
