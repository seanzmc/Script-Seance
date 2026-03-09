import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildScriptTextExport,
  normalizeSceneCharacters,
  sanitizeGeneratedInsertText,
} from "../App";
import {
  SetupForm,
  SetupFormState,
  synchronizeSetupVoicePreferences,
} from "../components/SetupForm";
import { stylesLibrary } from "../stylesLibrary";
import { BlockType, Scene, StoryContext } from "../types";

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

    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
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

    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
    );

    const button = screen.getByRole("button", {
      name: /generate first scene/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("cycles length and stages incoming wheel text before animating", async () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
    );

    const cycleButton = screen.getByRole("button", {
      name: /cycle scene length/i,
    });
    const lengthValue = screen.getByTestId("setup-length-value");

    expect(lengthValue.textContent).toBe("Medium");

    fireEvent.click(cycleButton);
    expect(lengthValue.textContent).toBe("Long");
    expect(lengthValue.className).toContain("translate-y-[8px]");
    await waitFor(() => {
      expect(lengthValue.className).toContain("translate-y-0");
    });

    fireEvent.click(cycleButton);
    await waitFor(() => {
      expect(lengthValue.textContent).toBe("Short");
    });

    fireEvent.click(cycleButton);
    await waitFor(() => {
      expect(lengthValue.textContent).toBe("Medium");
    });
  });

  it("renders a built-in narrator row that is non-editable and non-deletable", () => {
    render(
      <SetupForm value={baseValue} onChange={vi.fn()} isLoading={false} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
    );

    expect(screen.getByText("Narrator")).toBeTruthy();
    expect(screen.getByText("Built in")).toBeTruthy();
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
    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
    );

    const preferenceButton = screen.getByTestId("setup-narrator-preference");
    expect(preferenceButton.getAttribute("aria-label")).toContain("Male");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Female");

    fireEvent.click(preferenceButton);
    expect(preferenceButton.getAttribute("aria-label")).toContain("Random");
  });

  it("style library selection updates shared context style and bumps prompt revision synchronously", () => {
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
        React.useState<SetupFormState>(baseValue);
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
    expect(
      screen.getByText((content) => content.includes(selectedStyle.sampleLine)),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /style library/i })).toBeNull();
  });

  it("search filters styles by title and description", () => {
    render(
      <SetupForm value={baseValue} onChange={vi.fn()} isLoading={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    fireEvent.change(screen.getByLabelText(/search styles/i), {
      target: { value: "iambic pentameter" },
    });

    expect(
      screen.getByRole("button", { name: /^Shakespearean Drama/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Fever Dream/i }),
    ).toBeNull();
  });

  it("clear control clears style to an empty string", () => {
    const onChange = vi.fn();
    render(
      <SetupForm
        value={{ ...baseValue, style: "Fever Dream" }}
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
      <SetupForm value={baseValue} onChange={vi.fn()} isLoading={false} />,
    );

    expect(screen.queryByRole("button", { name: /× clear/i })).toBeNull();
  });

  it("shuffle picks from full list even when modal search is filtered", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    const SurpriseStyleHarness: React.FC = () => {
      const [setupState, setSetupState] = React.useState<SetupFormState>(baseValue);
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

    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    fireEvent.change(screen.getByLabelText(/search styles/i), {
      target: { value: "iambic pentameter" },
    });
    fireEvent.click(screen.getByRole("button", { name: /close style library/i }));

    fireEvent.click(screen.getByRole("button", { name: /shuffle/i }));

    expect(screen.getByTestId("selected-style").textContent).toBe(
      stylesLibrary[0]?.title ?? "",
    );
    expect(
      screen.getByText((content) =>
        content.includes(stylesLibrary[0]?.sampleLine ?? ""),
      ),
    ).toBeTruthy();
    expect(randomSpy).toHaveBeenCalledTimes(1);
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
      const [setupState, setSetupState] = React.useState<SetupFormState>(baseValue);
      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        setSetupState((prev) => ({ ...prev, ...next }));
      }, []);
      return (
        <SetupForm value={setupState} onChange={onSetupChange} isLoading={false} />
      );
    };

    try {
      render(<SurpriseStyleHarness />);
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

    fireEvent.click(
      screen.getByRole("button", { name: /write my own premise/i }),
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

    fireEvent.click(
      screen.getByRole("button", { name: /generate ai premise/i }),
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

    fireEvent.click(
      screen.getByRole("button", { name: /resolve auto surprise/i }),
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(premisePlaceholder)).not.toBeNull();
    });
  });
});
