export const SCRIPT_EXPORT_ROOT_ATTRIBUTE = 'data-script-export-root';
export const SCRIPT_EXPORT_ROOT_SELECTOR = `[${SCRIPT_EXPORT_ROOT_ATTRIBUTE}="true"]`;

const SCRIPT_EXPORT_STYLES = `
  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    font-family: "Courier Prime", monospace;
    background: #111827;
    color: #111111;
    line-height: 1.5;
  }

  .font-screenplay {
    font-family: "Courier Prime", monospace;
  }

  .script-export-root {
    position: relative;
    max-width: 900px;
    margin: 24px auto;
    padding: 0;
    background: #f6f1e7;
    color: #111111;
    border: 1px solid #d6cdbd;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
    overflow: visible !important;
  }

  .script-export-content {
    position: relative;
    z-index: 1;
    overflow: visible !important;
  }

  .script-export-texture {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.03;
    background-repeat: repeat;
    background-image: url('/textures/cream-paper.svg');
  }

  .script-scene {
    margin-bottom: 16px;
  }

  .script-scene-heading {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 17px;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #d1d5db;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }

  .script-block {
    margin: 0 0 9px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .script-block[data-block-type="action"] {
    line-height: 1.55;
  }

  .script-block[data-block-type="dialogue"] {
    max-width: 4.2in;
    margin: 6px auto 10px;
    text-align: center;
  }

  .script-dialogue-character {
    margin-top: 4px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .script-dialogue-parenthetical {
    font-style: italic;
    font-size: 0.92rem;
    margin: 2px 0;
  }

  .script-dialogue-text {
    white-space: pre-wrap;
    margin: 2px 0 7px;
  }

  .script-block[data-block-type="transition"] {
    text-align: right;
    text-transform: uppercase;
    font-weight: 700;
    padding-right: 8px;
  }

  .script-export-chrome {
    display: none !important;
  }

  .script-block-active {
    background: transparent !important;
    box-shadow: none !important;
  }

  @media print {
    body {
      background: #ffffff;
    }

    .script-export-root {
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
      max-width: none;
      background: #ffffff;
    }

    .script-export-texture {
      display: none !important;
    }

    @page {
      size: letter;
      margin: 0.9in 0.8in 0.9in 1in;
    }
  }
`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const EXPORT_IFRAME_CLEANUP_DELAY_MS = 60_000;

export const buildScriptExportDocument = (
  scriptMarkup: string,
  title: string,
  options?: { baseHref?: string },
) => {
  const safeTitle = escapeHtml(title);
  const safeBaseHref = options?.baseHref
    ? `<base href="${escapeHtml(options.baseHref)}" />`
    : '';
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${safeTitle}</title>
      ${safeBaseHref}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      <style>${SCRIPT_EXPORT_STYLES}</style>
    </head>
    <body>
      ${scriptMarkup}
    </body>
  </html>`;
};

const waitForNextFrame = (targetWindow: Window) => (
  new Promise<void>((resolve) => {
    targetWindow.requestAnimationFrame(() => {
      targetWindow.requestAnimationFrame(() => resolve());
    });
  })
);

export const printScriptExport = async (scriptMarkup: string, title: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF export is only available in the browser.');
  }

  const printFrame = document.createElement('iframe');
  printFrame.setAttribute('aria-hidden', 'true');
  printFrame.tabIndex = -1;
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  printFrame.style.pointerEvents = 'none';

  document.body.appendChild(printFrame);

  const cleanup = () => {
    printFrame.remove();
  };

  try {
    const printWindow = printFrame.contentWindow;
    const printDocument = printWindow?.document;
    if (!printWindow || !printDocument) {
      cleanup();
      throw new Error('Unable to open the print surface for PDF export.');
    }

    const cleanupAfterPrint = () => {
      printWindow.removeEventListener('afterprint', cleanupAfterPrint);
      cleanup();
    };

    printWindow.addEventListener('afterprint', cleanupAfterPrint, { once: true });
    window.setTimeout(cleanupAfterPrint, EXPORT_IFRAME_CLEANUP_DELAY_MS);

    printDocument.open();
    printDocument.write(buildScriptExportDocument(scriptMarkup, title, {
      baseHref: `${window.location.origin}/`
    }));
    printDocument.close();

    const fontSet = printDocument.fonts;
    if (fontSet) {
      await fontSet.ready.catch(() => undefined);
    }
    await waitForNextFrame(printWindow);

    if (typeof printWindow.print !== 'function') {
      cleanupAfterPrint();
      throw new Error('Printing is not available in this browser.');
    }

    printWindow.focus();
    printWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
};
