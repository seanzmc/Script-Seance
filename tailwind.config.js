/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          surface: '#f6f1e7', // main paper surface
          border: '#d6cdbd', // paper border
          thumb: '#b8ab95', // paper scrollbar thumb
          track: '#e7dece', // paper scrollbar track
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        screenplay: ['"Courier Prime"', 'monospace'],
      },
      zIndex: {
        'app-modal': '70', // Login, Privacy, VoiceCasting modals
        'content-modal': '80', // TitleEdit, SetupForm inline modals
        'popover-backdrop': '84', // Menu/popover backdrop (mobile)
        popover: '85', // Menus, dropdowns
        'anchored-popover': '90', // AnchoredPopover runtime-positioned layer
        'mini-player': '94', // Floating playback mini-player
        header: '95', // Sticky context/header bar
        'drawer-backdrop': '96', // Drawer overlay backdrops
        drawer: '97', // Drawer panels
        'screen-overlay': '98', // Full-screen setup overlay
        'editor-modal': '110', // Style editor and tools sheet
        library: '120', // StyleLibraryDialog and PromptInspector
      },
    },
  },
  plugins: [],
}
