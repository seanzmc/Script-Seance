import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sanitizeGeneratedInsertText,
} from "../services/scriptController";
import { buildScriptTextExport } from "../services/scriptExport";
import { readStoredDraftPayload } from "../services/draftStorage";
import { normalizeSceneCharacters } from "../services/storyContext";
import {
  SetupForm,
  SetupFormState,
  synchronizeSetupVoicePreferences,
} from "../components/SetupForm";
import { stylesLibrary } from "../stylesLibrary";
import { BlockType, GENRES, Scene, StoryContext } from "../types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("buildScriptTextExport", () => {
  it("includes scene headings even when no heading block exists", () => {
    const scenes: Scene[] = [
      {
        id: "scene-1",
        heading: "INT. APARTMENT - NIGHT",
        summary: "A tense exchange",
        blocks: [
          {
            id: "b1",
            type: BlockType.ACTION,
            text: "Rain hammers the window.",
            blockRevision: 1,
          },
          {
            id: "b2",
            type: BlockType.DIALOGUE,
            character: "Alex",
            text: "We are out of time.",
            blockRevision: 1,
          },
        ],
      },
    ];

    const text = buildScriptTextExport(scenes);

    expect(text).toContain("INT. APARTMENT - NIGHT");
    expect(text).toContain("Rain hammers the window.");
    expect(text).toContain("ALEX");
  });
});

describe("normalizeSceneCharacters", () => {
  it("drops legacy heading blocks while preserving explicit scene heading", () => {
    const scene: Scene = {
      id: "scene-legacy",
      heading: "INT. OFFICE - NIGHT",
      summary: "Legacy heading block should be removed.",
      blocks: [
        {
          id: "legacy-h",
          type: BlockType.HEADING,
          text: "INT. LEGACY - DAY",
          blockRevision: 1,
        },
        {
          id: "legacy-a",
          type: BlockType.ACTION,
          text: "A desk lamp flickers.",
          blockRevision: 1,
        },
      ],
    };

    const normalized = normalizeSceneCharacters(scene, []);

    expect(normalized.heading).toBe("INT. OFFICE - NIGHT");
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0].type).toBe(BlockType.ACTION);
  });

  it("promotes legacy heading block text when scene heading is blank", () => {
    const scene: Scene = {
      id: "scene-legacy-promote",
      heading: "   ",
      summary: "Blank heading should be recovered from legacy heading block.",
      blocks: [
        {
          id: "legacy-h",
          type: BlockType.HEADING,
          text: "int. garage - dawn",
          blockRevision: 1,
        },
        {
          id: "legacy-a",
          type: BlockType.ACTION,
          text: "A chain rattles in the dark.",
          blockRevision: 1,
        },
      ],
    };

    const normalized = normalizeSceneCharacters(scene, []);

    expect(normalized.heading).toBe("INT. GARAGE - DAWN");
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0].type).toBe(BlockType.ACTION);
  });

  it("enforces canonical per-type block fields during normalization", () => {
    const scene = {
      id: "scene-canonicalize",
      heading: " scene heading: ext. alley - night ",
      summary: "Normalize invalid persisted block payloads.",
      blocks: [
        {
          id: "legacy-a",
          type: BlockType.ACTION,
          text: " Action: A neon sign flickers. ",
          blockRevision: 0,
          character: "Alex",
          parenthetical: "(whispering)"
        },
        {
          id: "legacy-d",
          type: BlockType.DIALOGUE,
          text: " Dialogue: Keep moving. ",
          blockRevision: 0,
          character: "   "
        }
      ]
    } as unknown as Scene;

    const normalized = normalizeSceneCharacters(scene, ["Morgan"]);

    expect(normalized.heading).toBe("EXT. ALLEY - NIGHT");
    expect(normalized.blocks).toEqual([
      {
        id: "legacy-a",
        type: BlockType.ACTION,
        text: "A neon sign flickers.",
        blockRevision: 1
      },
      {
        id: "legacy-d",
        type: BlockType.DIALOGUE,
        text: "Keep moving.",
        blockRevision: 1,
        character: "Morgan"
      }
    ]);
  });

  it("preserves heading contract and applies fallback dialogue invariants when character list is empty", () => {
    const scene = {
      id: "scene-heading-invariants",
      heading: " ",
      summary: "Legacy payload with mixed invalid block fields.",
      blocks: [
        {
          id: "legacy-heading",
          type: BlockType.HEADING,
          text: " scene heading: ext. tunnels - night ",
          blockRevision: 1
        },
        {
          id: "legacy-action",
          type: BlockType.ACTION,
          text: " Action: A damp wind whistles through cracked pipes. ",
          blockRevision: 0,
          character: "Alex",
          parenthetical: "(low)"
        },
        {
          id: "legacy-dialogue",
          type: BlockType.DIALOGUE,
          text: " Dialogue: Keep moving. ",
          blockRevision: 0,
          character: " "
        }
      ]
    } as unknown as Scene;

    const normalized = normalizeSceneCharacters(scene, []);

    expect(normalized.heading).toBe("EXT. TUNNELS - NIGHT");
    expect(normalized.blocks.map((block) => block.type)).toEqual([
      BlockType.ACTION,
      BlockType.DIALOGUE
    ]);
    expect(normalized.blocks).toEqual([
      {
        id: "legacy-action",
        type: BlockType.ACTION,
        text: "A damp wind whistles through cracked pipes.",
        blockRevision: 1
      },
      {
        id: "legacy-dialogue",
        type: BlockType.DIALOGUE,
        text: "Keep moving.",
        blockRevision: 1,
        character: "Narrator"
      }
    ]);
  });
});

describe("sanitizeGeneratedInsertText", () => {
  it("strips a leading Action: label from generated insert content", () => {
    const result = sanitizeGeneratedInsertText(
      BlockType.ACTION,
      "   Action: A glass tumbles off the table.",
    );

    expect(result).toBe("A glass tumbles off the table.");
    expect(result.startsWith("Action:")).toBe(false);
  });

  it("strips other known leading block labels case-insensitively", () => {
    expect(
      sanitizeGeneratedInsertText(
        BlockType.DIALOGUE,
        " dialogue: \"We move now.\"",
        "Alex",
      ),
    ).toBe("We move now.");
    expect(
      sanitizeGeneratedInsertText(
        BlockType.TRANSITION,
        " Transition: CUT TO:\nMore text",
      ),
    ).toBe("CUT TO:");
    expect(
      sanitizeGeneratedInsertText(
        BlockType.HEADING,
        " scene heading: INT. STUDIO - DAY",
      ),
    ).toBe("INT. STUDIO - DAY");
  });

  it("keeps generated dialogue insert content free of Dialogue: prefix", () => {
    const result = sanitizeGeneratedInsertText(
      BlockType.DIALOGUE,
      " Dialogue: Keep your voice down.",
      "Alex",
    );

    expect(result).toBe("Keep your voice down.");
    expect(result.startsWith("Dialogue:")).toBe(false);
  });
});

describe("readStoredDraftPayload", () => {
  const createStorage = (entries: Record<string, string>) => {
    const storageMap = new Map(Object.entries(entries));
    return {
      getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageMap.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storageMap.delete(key);
      }),
    };
  };

  const draftPayload = {
    context: {
      title: "Midnight Caller",
      genre: "Noir",
      premise: "A detective answers a phone that should not ring.",
      characters: ["Alex"],
      scenes: [],
      style: "Dry humor",
      styleId: "dry-humor",
      targetLength: "Medium",
    } satisfies StoryContext,
    userInstruction: "Push the tension.",
    savedAt: "2026-03-25T00:00:00.000Z",
  };

  it("returns the canonical v1 draft payload when present", () => {
    const storage = createStorage({
      "script-seance:draft:v1": JSON.stringify(draftPayload),
    });

    const result = readStoredDraftPayload(storage);

    expect(result).toEqual(draftPayload);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("migrates an unversioned legacy draft into the v1 key", () => {
    const storage = createStorage({
      "script-seance:draft": JSON.stringify(draftPayload),
    });

    const result = readStoredDraftPayload(storage);

    expect(result).toEqual(draftPayload);
    expect(storage.setItem).toHaveBeenCalledWith(
      "script-seance:draft:v1",
      JSON.stringify(draftPayload),
    );
    expect(storage.removeItem).toHaveBeenCalledWith("script-seance:draft");
  });

  it("drops invalid stored payloads instead of hydrating them", () => {
    const storage = createStorage({
      "script-seance:draft:v1": "{bad json",
      "script-seance:draft:v0": JSON.stringify({ nope: true }),
    });

    const result = readStoredDraftPayload(storage);

    expect(result).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("script-seance:draft:v1");
    expect(storage.removeItem).toHaveBeenCalledWith("script-seance:draft:v0");
  });
});

describe("SetupForm submit validation", () => {
  const baseValue: SetupFormState = {
    genre: "Noir",
    premise: "A detective uncovers a conspiracy.",
    characters: ["Hero", "Villain"],
    characterVoicePreferences: ["random", "random"],
    narratorVoicePreference: "male",
    style: "",
    length: "Medium",
  };

  it("disables generate when all character names are blank", () => {
    render(
      <SetupForm
        value={{ ...baseValue, characters: ["   ", ""] }}
        onChange={vi.fn()}
        onStart={vi.fn()}
        isLoading={false}
        showSubmit
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(
      screen.getByRole("button", { name: /write the premise myself/i }),
    );

    const button = screen.getByRole("button", {
      name: /generate first scene/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables generate when there is at least one non-empty character", () => {
    render(
      <SetupForm
        value={{ ...baseValue, characters: ["   ", "Lead"] }}
        onChange={vi.fn()}
        onStart={vi.fn()}
        isLoading={false}
        showSubmit
      />,
    );

    const button = screen.getByRole("button", {
      name: /generate first scene/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("cycles scene length by click, keyboard, and wheel-style drag", async () => {
    const LengthCycleHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>(baseValue);
      const handleSetupChange = React.useCallback(
        (next: Partial<SetupFormState>) => {
          setSetupState((previous) => ({ ...previous, ...next }));
        },
        [],
      );

      return (
        <SetupForm
          value={setupState}
          onChange={handleSetupChange}
          isLoading={false}
        />
      );
    };

    render(<LengthCycleHarness />);

    const cycleButton = screen.getByRole("button", {
      name: /scene length:/i,
    });
    expect(screen.getByTestId("setup-length-value").textContent).toBe("Medium");

    fireEvent.click(cycleButton);
    await waitFor(() => {
      expect(screen.getByTestId("setup-length-value").textContent).toBe("Long");
    });

    fireEvent.click(cycleButton);
    await waitFor(() => {
      expect(screen.getByTestId("setup-length-value").textContent).toBe("Short");
    });

    fireEvent.keyDown(cycleButton, { key: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByTestId("setup-length-value").textContent).toBe("Medium");
    });

    fireEvent.pointerDown(cycleButton, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(cycleButton, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(cycleButton, { pointerId: 1, clientY: 130 });

    await waitFor(() => {
      expect(screen.getByTestId("setup-length-value").textContent).toBe("Long");
    });

    fireEvent.pointerDown(cycleButton, { pointerId: 2, clientY: 130 });
    fireEvent.pointerMove(cycleButton, { pointerId: 2, clientY: 100 });
    fireEvent.pointerUp(cycleButton, { pointerId: 2, clientY: 100 });

    await waitFor(() => {
      expect(screen.getByTestId("setup-length-value").textContent).toBe("Medium");
    });
  });

  it("starts with a genre-first stage and advances to style after continue", () => {
    render(
      <SetupForm
        value={{ ...baseValue, premise: "", style: "" }}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByTestId("setup-genre-wheel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /browse/i })).toBeNull();

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));

    expect(screen.getByTestId("setup-genre-summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /browse/i })).toBeTruthy();
  });

  it("cycles genre by click, keyboard, and drag", async () => {
    const nextGenre = GENRES[(GENRES.indexOf("Noir") + 1) % GENRES.length] ?? "Noir";

    const GenreHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>({
        ...baseValue,
        premise: "",
        style: "",
      });
      const handleSetupChange = React.useCallback(
        (next: Partial<SetupFormState>) => {
          setSetupState((previous) => ({ ...previous, ...next }));
        },
        [],
      );

      return (
        <SetupForm
          value={setupState}
          onChange={handleSetupChange}
          isLoading={false}
        />
      );
    };

    render(<GenreHarness />);

    const genreWheel = screen.getByTestId("setup-genre-wheel");
    const readGenreValue = () => screen.getByTestId("setup-genre-value").textContent;

    expect(readGenreValue()).toBe("Noir");

    fireEvent.click(genreWheel);
    expect(readGenreValue()).toBe(nextGenre);

    fireEvent.keyDown(genreWheel, { key: "ArrowUp" });
    expect(readGenreValue()).toBe("Noir");

    fireEvent.pointerDown(genreWheel, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(genreWheel, { pointerId: 1, clientY: 112 });
    fireEvent.pointerUp(genreWheel, { pointerId: 1, clientY: 112 });

    await waitFor(() => {
      expect(readGenreValue()).toBe("Noir");
    });

    fireEvent.pointerDown(genreWheel, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(genreWheel, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(genreWheel, { pointerId: 1, clientY: 130 });

    await waitFor(() => {
      expect(readGenreValue()).toBe(nextGenre);
    });
  });

  it("renders a built-in narrator row that is non-editable and non-deletable", () => {
    render(
      <SetupForm value={baseValue} onChange={vi.fn()} isLoading={false} />,
    );

    expect(screen.getByText("Narrator")).toBeTruthy();
    expect(screen.getByText("Always present")).toBeTruthy();
    expect(screen.queryByDisplayValue("Narrator")).toBeNull();
    expect(screen.getAllByRole("button", { name: /remove character/i })).toHaveLength(2);
  });

  it("cycles narrator preference male -> female -> random", () => {
    const NarratorPreferenceHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>(baseValue);
      const handleSetupChange = React.useCallback(
        (next: Partial<SetupFormState>) => {
          setSetupState((previous) => ({ ...previous, ...next }));
        },
        [],
      );

      return (
        <SetupForm
          value={setupState}
          onChange={handleSetupChange}
          isLoading={false}
        />
      );
    };

    render(<NarratorPreferenceHarness />);

    const preferenceButton = screen.getByTestId("setup-narrator-preference");
    expect(preferenceButton.getAttribute("aria-label")).toContain("Male");
    expect(preferenceButton.textContent).toContain("Voice");
    expect(preferenceButton.textContent).toContain("Male");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Female");
    expect(preferenceButton.textContent).toContain("Female");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Random");
    expect(preferenceButton.textContent).toContain("Random");
  });

  it("cycles character preference male -> female -> random", () => {
    const CharacterPreferenceHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>({
        ...baseValue,
        characterVoicePreferences: ["male", "random"],
      });
      const handleSetupChange = React.useCallback(
        (next: Partial<SetupFormState>) => {
          setSetupState((previous) => ({ ...previous, ...next }));
        },
        [],
      );

      return (
        <SetupForm
          value={setupState}
          onChange={handleSetupChange}
          isLoading={false}
        />
      );
    };

    render(<CharacterPreferenceHarness />);

    const preferenceButton = screen.getByTestId("setup-character-preference-0");
    expect(preferenceButton.getAttribute("aria-label")).toContain("Male");
    expect(preferenceButton.textContent).toContain("Voice");
    expect(preferenceButton.textContent).toContain("Male");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Female");
    expect(preferenceButton.textContent).toContain("Female");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Random");
    expect(preferenceButton.textContent).toContain("Random");
  });

  it("style library selection updates shared context style and bumps prompt revision synchronously", () => {
    const styleStageValue: SetupFormState = {
      ...baseValue,
      premise: "",
      characters: [],
      characterVoicePreferences: [],
    };

    const StylePresetHarness: React.FC = () => {
      const [context, setContext] = React.useState<StoryContext | null>({
        title: "Draft",
        genre: "Noir",
        premise: "A detective uncovers a conspiracy.",
        characters: ["Hero", "Villain"],
        scenes: [],
        style: "",
      });
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(styleStageValue);
      const [promptContextRevision, setPromptContextRevision] =
        React.useState(0);

      const applyContextMutation = React.useCallback(
        (
          mutation:
            | StoryContext
            | null
            | ((previous: StoryContext | null) => StoryContext | null),
        ) => {
          let didMutate = false;
          setContext((previous) => {
            const next =
              typeof mutation === "function"
                ? (
                    mutation as (
                      previous: StoryContext | null,
                    ) => StoryContext | null
                  )(previous)
                : mutation;
            if (next === previous) {
              return previous;
            }
            didMutate = true;
            return next;
          });
          if (didMutate) {
            setPromptContextRevision((previous) => previous + 1);
          }
          return didMutate;
        },
        [],
      );

      const applySetupStateMutation = React.useCallback(
        (
          mutation:
            | SetupFormState
            | ((previous: SetupFormState) => SetupFormState),
          options?: { bumpPromptRevision?: boolean },
        ) => {
          let didMutate = false;
          setSetupState((previous) => {
            const next =
              typeof mutation === "function"
                ? (mutation as (previous: SetupFormState) => SetupFormState)(
                    previous,
                  )
                : mutation;
            if (next === previous) {
              return previous;
            }
            didMutate = true;
            return next;
          });
          if (didMutate && (options?.bumpPromptRevision ?? true)) {
            setPromptContextRevision((previous) => previous + 1);
          }
          return didMutate;
        },
        [],
      );

      const onSetupChange = React.useCallback(
        (next: Partial<SetupFormState>) => {
          const hasStyle = Object.prototype.hasOwnProperty.call(next, "style");
          if (hasStyle && context) {
            const rawStyle = typeof next.style === "string" ? next.style : "";
            const normalizedStyle = rawStyle.trim()
              ? rawStyle.trim()
              : undefined;
            const didMutateContext = applyContextMutation((prev) => {
              if (!prev) return prev;
              if (prev.style === normalizedStyle) {
                return prev;
              }
              return { ...prev, style: normalizedStyle };
            });
            applySetupStateMutation((prev) => ({ ...prev, ...next }), {
              bumpPromptRevision: !didMutateContext,
            });
            return;
          }
          applySetupStateMutation((prev) => ({ ...prev, ...next }));
        },
        [applyContextMutation, applySetupStateMutation, context],
      );

      return (
        <div>
          <p data-testid="context-style">{context?.style || ""}</p>
          <p data-testid="prompt-revision">{String(promptContextRevision)}</p>
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            isLoading={false}
          />
        </div>
      );
    };

    render(<StylePresetHarness />);
    expect(screen.getByTestId("context-style").textContent).toBe("");
    expect(screen.getByTestId("prompt-revision").textContent).toBe("0");

    const selectedStyle = stylesLibrary[0];
    expect(selectedStyle).toBeTruthy();
    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^${selectedStyle.title}`, "i"),
      }),
    );

    expect(screen.getByTestId("context-style").textContent).toBe(
      selectedStyle.title,
    );
    expect(screen.getByTestId("prompt-revision").textContent).toBe("1");
    expect(screen.getAllByText(selectedStyle.title).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: /style library/i })).toBeNull();
  });

  it("search filters styles by title and description", () => {
    vi.useFakeTimers();
    render(
      <SetupForm
        value={{
          ...baseValue,
          premise: "",
          characters: [],
          characterVoicePreferences: [],
        }}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    fireEvent.change(screen.getByLabelText(/search styles/i), {
      target: { value: "iambic pentameter" },
    });
    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(
      screen.getByRole("button", { name: /^Shakespearean Drama/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Fever Dream/i }),
    ).toBeNull();
    vi.useRealTimers();
  });

  it("shows category badges only in search mode, not while browsing by tab", () => {
    vi.useFakeTimers();
    render(
      <SetupForm
        value={{
          ...baseValue,
          premise: "",
          characters: [],
          characterVoicePreferences: [],
        }}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));

    const tabbedCard = screen.getByRole("button", { name: /^1940s Noir Detective/i });
    expect(tabbedCard.textContent).not.toContain("Genre Twist");

    fireEvent.change(screen.getByLabelText(/search styles/i), {
      target: { value: "noir" },
    });
    act(() => {
      vi.advanceTimersByTime(260);
    });

    const searchResult = screen.getByRole("button", { name: /^1940s Noir Detective/i });
    expect(searchResult.textContent).toContain("Genre Twist");
    expect(screen.queryByRole("tablist", { name: /style categories/i })).toBeNull();
    vi.useRealTimers();
  });

  it("supports manual keyboard activation for category tabs", () => {
    render(
      <SetupForm
        value={{
          ...baseValue,
          premise: "",
          characters: [],
          characterVoicePreferences: [],
        }}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));

    const firstTab = screen.getByRole("tab", { name: "Genre Twist" });
    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });

    const secondTab = screen.getByRole("tab", { name: "Dialogue Rules" });
    expect(document.activeElement).toBe(secondTab);
    expect(secondTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(secondTab, { key: "Enter" });

    expect(secondTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: /^Shakespearean Drama/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^1940s Noir Detective/i })).toBeNull();
  });

  it("clear control clears style to an empty string", () => {
    const onChange = vi.fn();
    render(
      <SetupForm
        value={{
          ...baseValue,
          premise: "",
          characters: [],
          characterVoicePreferences: [],
          style: "Fever Dream",
        }}
        onChange={onChange}
        isLoading={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /clear selected style/i }),
    );

    expect(onChange).toHaveBeenCalledWith(
      { styleId: null, style: "" },
      { source: "user" },
    );
  });

  it("does not show inline clear action when no style is selected", () => {
    render(
      <SetupForm
        value={{
          ...baseValue,
          premise: "",
          characters: [],
          characterVoicePreferences: [],
        }}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    expect(screen.queryByRole("button", { name: /× clear/i })).toBeNull();
  });

  it("shuffle picks from full list even when modal search is filtered", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    vi.useFakeTimers();
    const styleStageValue: SetupFormState = {
      ...baseValue,
      premise: "",
      characters: [],
      characterVoicePreferences: [],
    };

    const SurpriseStyleHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(styleStageValue);
      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);
      return (
        <div>
          <p data-testid="selected-style">{setupState.style}</p>
          <SetupForm value={setupState} onChange={onSetupChange} isLoading={false} />
        </div>
      );
    };

    render(<SurpriseStyleHarness />);

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    fireEvent.change(screen.getByLabelText(/search styles/i), {
      target: { value: "iambic pentameter" },
    });
    act(() => {
      vi.advanceTimersByTime(260);
    });
    fireEvent.click(screen.getByRole("button", { name: /close style library/i }));

    fireEvent.click(screen.getByRole("button", { name: /shuffle/i }));

    expect(screen.getByTestId("selected-style").textContent).toBe(
      stylesLibrary[0]?.title ?? "",
    );
    expect(randomSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("scrolls the selected style row into view when shuffle changes style in the open modal", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const SurpriseStyleHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>({
        ...baseValue,
        premise: "",
        characters: [],
        characterVoicePreferences: [],
      });
      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);
      return (
        <SetupForm value={setupState} onChange={onSetupChange} isLoading={false} />
      );
    };

    try {
      render(<SurpriseStyleHarness />);
      fireEvent.click(screen.getByTestId("setup-continue-to-style"));
      fireEvent.click(screen.getByRole("button", { name: /browse/i }));
      fireEvent.click(screen.getByRole("button", { name: /shuffle/i }));

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });
});

describe("setup voice preference synchronization", () => {
  it("adds default character preferences for newly added characters", () => {
    expect(
      synchronizeSetupVoicePreferences({
        characters: ["Hero", "Villain", "Witness"],
        characterVoicePreferences: ["female", "male"],
        narratorVoicePreference: "male",
      }),
    ).toEqual({
      characterVoicePreferences: ["female", "male", "random"],
      narratorVoicePreference: "male",
    });
  });

  it("keeps character preferences aligned when a character is removed", () => {
    expect(
      synchronizeSetupVoicePreferences({
        characters: ["Hero"],
        characterVoicePreferences: ["female", "male"],
        narratorVoicePreference: "male",
      }),
    ).toEqual({
      characterVoicePreferences: ["female"],
      narratorVoicePreference: "male",
    });
  });

  it("restores default setup preferences when missing during reset", () => {
    expect(
      synchronizeSetupVoicePreferences({
        characters: ["Hero", "Villain"],
        characterVoicePreferences: undefined,
        narratorVoicePreference: undefined,
      }),
    ).toEqual({
      characterVoicePreferences: ["random", "random"],
      narratorVoicePreference: "male",
    });
  });

  it("realigns character preferences after AI replaces the cast", () => {
    expect(
      synchronizeSetupVoicePreferences({
        characters: ["Courier", "Fixer"],
        characterVoicePreferences: ["female", "random", "male"],
        narratorVoicePreference: "female",
      }),
    ).toEqual({
      characterVoicePreferences: ["female", "random"],
      narratorVoicePreference: "female",
    });
  });
});

describe("SetupForm detail reveal timing", () => {
  const blankBaseValue: SetupFormState = {
    genre: "Noir",
    premise: "",
    characters: ["Hero", "Villain"],
    characterVoicePreferences: ["random", "random"],
    narratorVoicePreference: "male",
    style: "",
    length: "Medium",
  };

  const premisePlaceholder =
    "e.g., A detective discovers his new partner is a ghost...";

  it("reveals details immediately for write-my-own mode", () => {
    render(
      <SetupForm
        value={blankBaseValue}
        onChange={vi.fn()}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(
      screen.getByRole("button", { name: /write the premise myself/i }),
    );

    expect(screen.queryByPlaceholderText(premisePlaceholder)).not.toBeNull();
  });

  it("keeps details hidden during manual AI generation and reveals after commit", async () => {
    let resolveSurprise: (() => void) | null = null;

    const SurpriseHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(blankBaseValue);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);

      const onRequestSurprise = React.useCallback(async () => {
        return await new Promise<boolean>((resolve) => {
          resolveSurprise = () => {
            setSetupState((prev) => ({
              ...prev,
              premise: "A noir courier uncovers a citywide conspiracy.",
              characters: ["Courier", "Fixer"],
            }));
            resolve(true);
          };
        });
      }, []);

      return (
        <div>
          <button type="button" onClick={() => resolveSurprise?.()}>
            Resolve surprise
          </button>
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            onRequestSurprise={onRequestSurprise}
            isLoading={false}
          />
        </div>
      );
    };

    render(<SurpriseHarness />);

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(
      screen.getByRole("button", { name: /let ai pitch the premise/i }),
    );

    expect(screen.queryByPlaceholderText(premisePlaceholder)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /resolve surprise/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(premisePlaceholder)).not.toBeNull();
    });
  });

  it("keeps details hidden during auto surprise and reveals after commit", async () => {
    let resolveSurprise: (() => void) | null = null;

    const AutoSurpriseHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(blankBaseValue);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);

      const onRequestSurprise = React.useCallback(async () => {
        return await new Promise<boolean>((resolve) => {
          resolveSurprise = () => {
            setSetupState((prev) => ({
              ...prev,
              premise: "Two grifters fake hauntings and summon the real thing.",
              characters: ["Con Artist", "Historian"],
            }));
            resolve(true);
          };
        });
      }, []);

      return (
        <div>
          <button type="button" onClick={() => resolveSurprise?.()}>
            Resolve auto surprise
          </button>
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            onRequestSurprise={onRequestSurprise}
            isLoading={false}
            autoSurprise
          />
        </div>
      );
    };

    render(<AutoSurpriseHarness />);

    expect(screen.queryByPlaceholderText(premisePlaceholder)).toBeNull();

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(
      screen.getByRole("button", { name: /resolve auto surprise/i }),
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(premisePlaceholder)).not.toBeNull();
    });
  });

  it("shows an inline error, clears loading, and allows retry after AI premise failure", async () => {
    const SurpriseFailureHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(blankBaseValue);
      const attemptRef = React.useRef(0);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);

      const onRequestSurprise = React.useCallback(async () => {
        attemptRef.current += 1;
        if (attemptRef.current === 1) {
          const error = new Error("AI response did not match expected format.") as Error & {
            code?: string;
            status?: number;
          };
          error.code = "INVALID_AI_RESPONSE";
          error.status = 502;
          throw error;
        }

        setSetupState((prev) => ({
          ...prev,
          premise: "A disgraced medium gets one final chance to expose a fraud.",
          characters: ["Medium", "Producer", "Skeptic"],
        }));
        return true;
      }, []);

      return (
        <SetupForm
          value={setupState}
          onChange={onSetupChange}
          onRequestSurprise={onRequestSurprise}
          isLoading={false}
        />
      );
    };

    render(<SurpriseFailureHarness />);

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));

    const generateButton = screen.getByRole("button", {
      name: /let ai pitch the premise/i,
    }) as HTMLButtonElement;
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/ai premise draft came back incomplete/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /write it myself instead/i }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(generateButton.disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/disgraced medium/i)).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("AI-written")).toBeTruthy();
  });

  it("lets the user switch to manual premise entry after AI premise failure", async () => {
    const failureError = Object.assign(
      new Error("AI response did not match expected format."),
      { code: "INVALID_AI_RESPONSE", status: 502 },
    );

    render(
      <SetupForm
        value={blankBaseValue}
        onChange={vi.fn()}
        onRequestSurprise={vi.fn().mockRejectedValue(failureError)}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /let ai pitch the premise/i }));

    await waitFor(() => {
      expect(screen.getByText(/ai premise draft came back incomplete/i)).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /write it myself instead/i }),
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(premisePlaceholder)).not.toBeNull();
    });
  });

  it("routes AI premise generation back through Step 2 after clearing Step 3 details", async () => {
    let resolveSurprise: (() => void) | null = null;

    const SurpriseHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(blankBaseValue);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);

      const onRequestSurprise = React.useCallback(async () => {
        return await new Promise<boolean>((resolve) => {
          resolveSurprise = () => {
            setSetupState((prev) => ({
              ...prev,
              premise: "An archivist discovers the town's history is being rewritten overnight.",
              characters: ["Archivist", "Mayor"],
            }));
            resolve(true);
          };
        });
      }, []);

      return (
        <div>
          <button type="button" onClick={() => resolveSurprise?.()}>
            Resolve in-step AI
          </button>
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            onRequestSurprise={onRequestSurprise}
            isLoading={false}
          />
        </div>
      );
    };

    render(<SurpriseHarness />);

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /write the premise myself/i }));
    fireEvent.change(screen.getByPlaceholderText(premisePlaceholder), {
      target: { value: "Manual draft premise" },
    });

    fireEvent.click(screen.getByRole("button", { name: /change style/i }));
    expect(
      screen.getByRole("dialog", { name: /return to step 2/i }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /go back and clear setup details/i }),
    );

    expect(screen.queryByPlaceholderText(premisePlaceholder)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /let ai pitch the premise/i }));
    fireEvent.click(screen.getByRole("button", { name: /resolve in-step ai/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/archivist discovers/i)).toBeTruthy();
    });
    expect(screen.getByText("AI-written")).toBeTruthy();
  });

  it("cancels or confirms destructive Step 3 back-navigation without leaving stale details behind", async () => {
    const DraftHarness: React.FC = () => {
      const [setupState, setSetupState] =
        React.useState<SetupFormState>(blankBaseValue);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);

      return (
        <SetupForm
          value={setupState}
          onChange={onSetupChange}
          isLoading={false}
        />
      );
    };

    render(<DraftHarness />);

    fireEvent.click(screen.getByTestId("setup-continue-to-style"));
    fireEvent.click(screen.getByRole("button", { name: /write the premise myself/i }));

    fireEvent.change(screen.getByPlaceholderText(premisePlaceholder), {
      target: { value: "Manual draft premise" },
    });
    fireEvent.change(screen.getByDisplayValue("Hero"), {
      target: { value: "Pilot" },
    });

    fireEvent.click(screen.getByRole("button", { name: /change style/i }));
    expect(
      screen.getByText(/your premise and characters will be cleared/i),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByDisplayValue("Manual draft premise")).toBeTruthy();
    expect(screen.getByDisplayValue("Pilot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /change style/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /go back and clear setup details/i }),
    );

    expect(screen.getByText(/shape the tone/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(premisePlaceholder)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /write the premise myself/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(premisePlaceholder)).toBeTruthy();
    });

    expect(
      (screen.getByPlaceholderText(premisePlaceholder) as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByDisplayValue("Pilot")).toBeNull();
  });
});
