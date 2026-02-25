/// <reference types="vite/client" />

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  const w = window as any;
  if (import.meta.env.VITE_SS_DEBUG_PROMPTS === "1") w.__SS_DEBUG_PROMPTS__ = true;
  if (import.meta.env.VITE_SS_DEBUG_AI_ABORTS === "1") w.__SS_DEBUG_AI_ABORTS__ = true;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
