import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '../components/workspace/WorkspaceShell';

const createProps = (overrides: Partial<React.ComponentProps<typeof WorkspaceShell>> = {}) => ({
  currentMode: 'draft' as const,
  onModeChange: vi.fn(),
  hasDraft: true,
  title: 'Project Draft',
  canExport: true,
  onExportTxt: vi.fn(),
  onExportPdf: vi.fn(),
  onClearDraft: vi.fn(),
  onOpenPrivacy: vi.fn(),
  children: <div>Workspace content</div>,
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkspaceShell project menu', () => {
  it('groups project-level actions behind a single project menu', () => {
    render(<WorkspaceShell {...createProps()} />);

    expect(screen.getByRole('button', { name: 'Open project actions menu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Privacy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear Draft' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open project actions menu' }));

    expect(screen.getByRole('menu', { name: 'Project actions' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Export Script (.txt)' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Export PDF' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Privacy' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Clear Draft' })).toBeTruthy();
  });

  it('invokes project actions and closes the menu after selection', async () => {
    const onExportTxt = vi.fn();
    const onOpenPrivacy = vi.fn();
    const onClearDraft = vi.fn();
    render(
      <WorkspaceShell
        {...createProps({
          onExportTxt,
          onOpenPrivacy,
          onClearDraft
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open project actions menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export Script (.txt)' }));
    expect(onExportTxt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Project actions' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open project actions menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Privacy' }));
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open project actions menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear Draft' }));
    expect(onClearDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps export and clear actions disabled when no draft is available', () => {
    render(
      <WorkspaceShell
        {...createProps({
          hasDraft: false,
          canExport: false
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open project actions menu' }));

    expect(screen.getByRole('menuitem', { name: 'Privacy' })).toBeTruthy();
    expect((screen.getByRole('menuitem', { name: 'Export Script (.txt)' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: 'Export PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: 'Clear Draft' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
