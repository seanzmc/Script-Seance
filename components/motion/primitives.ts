import type { Transition, Variants } from 'motion/react';

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 1, 1] as const;

export const motionDurations = {
  fast: 0.16,
  base: 0.22,
  slow: 0.28
} as const;

export const motionTransitions: Record<
  'fast' | 'base' | 'slow' | 'emphasized' | 'drawer',
  Transition
> = {
  fast: {
    duration: motionDurations.fast,
    ease: PREMIUM_EASE
  },
  base: {
    duration: motionDurations.base,
    ease: PREMIUM_EASE
  },
  slow: {
    duration: motionDurations.slow,
    ease: PREMIUM_EASE
  },
  emphasized: {
    type: 'spring',
    stiffness: 360,
    damping: 32,
    mass: 0.9
  },
  drawer: {
    type: 'spring',
    stiffness: 410,
    damping: 36,
    mass: 0.92
  }
};

export const fadeVariants: Variants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: motionTransitions.base
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.14,
      ease: EXIT_EASE
    }
  }
};

export const fadeSlideYVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.base
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: motionDurations.fast,
      ease: EXIT_EASE
    }
  }
};

export const stageShellVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.emphasized
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: motionDurations.fast,
      ease: EXIT_EASE
    }
  }
};

export const overlayVariants: Variants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: motionTransitions.base
  },
  exit: {
    opacity: 0,
    transition: {
      duration: motionDurations.fast,
      ease: EXIT_EASE
    }
  }
};

export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.985
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: motionTransitions.emphasized
  },
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.99,
    transition: motionTransitions.fast
  }
};

export const drawerLeftVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: motionTransitions.drawer
  },
  exit: {
    opacity: 0,
    x: -18,
    transition: motionTransitions.fast
  }
};

export const drawerRightVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 20
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: motionTransitions.drawer
  },
  exit: {
    opacity: 0,
    x: 18,
    transition: motionTransitions.fast
  }
};

export const bottomSheetVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.drawer
  },
  exit: {
    opacity: 0,
    y: 14,
    transition: motionTransitions.fast
  }
};

export const floatingNoticeVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.985
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: motionTransitions.emphasized
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.99,
    transition: motionTransitions.fast
  }
};

export const anchoredPopoverVariants: Variants = {
  hidden: {
    scale: 0.985
  },
  visible: {
    scale: 1,
    transition: motionTransitions.base
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    transition: {
      duration: 0.14,
      ease: EXIT_EASE
    }
  }
};
