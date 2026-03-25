/// <reference types="vite/client" />

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppMotionProvider } from "./components/motion/AppMotionProvider";
import "./index.css";

type DebugWindow = Window & {
  __SS_DEBUG_PROMPTS__?: boolean;
  __SS_DEBUG_AI_ABORTS__?: boolean;
};

if (import.meta.env.DEV) {
  // Keep these debug toggles out of production bundles and sessions.
  const w = window as DebugWindow;
  if (import.meta.env.VITE_SS_DEBUG_PROMPTS === "1")
    w.__SS_DEBUG_PROMPTS__ = true;
  if (import.meta.env.VITE_SS_DEBUG_AI_ABORTS === "1")
    w.__SS_DEBUG_AI_ABORTS__ = true;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppMotionProvider>
      <App />
    </AppMotionProvider>
  </React.StrictMode>,
);
