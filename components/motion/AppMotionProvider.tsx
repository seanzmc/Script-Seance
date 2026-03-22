import React from 'react';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';

type AppMotionProviderProps = {
  children: React.ReactNode;
};

export const AppMotionProvider: React.FC<AppMotionProviderProps> = ({ children }) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  </LazyMotion>
);
