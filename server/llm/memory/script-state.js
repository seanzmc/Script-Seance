export function serializeScriptState(state) {
  const lines = [];
  const characters = Array.isArray(state.characters)
    ? state.characters.map((char) =>
        typeof char === 'string'
          ? { name: char }
          : {
              name: char?.name ?? 'UNKNOWN',
              goals: char?.goals,
              traits: char?.traits,
              relationships: char?.relationships
            }
      )
    : [];

  lines.push(`TITLE: ${state.title}`);
  lines.push(`SCENES SO FAR: ${state.totalScenes}`);

  if (state.style) {
    lines.push(`\nSTYLE: ${state.style.genre} / ${state.style.tone}`);
    if (state.style.formattingNotes?.length) {
      lines.push(`FORMAT NOTES: ${state.style.formattingNotes.join('; ')}`);
    }
    if (state.style.influences?.length) {
      lines.push(`INFLUENCES: ${state.style.influences.join(', ')}`);
    }
  }

  if (characters.length > 0) {
    lines.push('\nCHARACTERS:');
    for (const c of characters) {
      let line = `- ${c.name}`;
      if (c.goals) line += ` | Goal: ${c.goals}`;
      if (c.traits?.length) line += ` | Traits: ${c.traits.join(', ')}`;
      if (c.relationships?.length) line += ` | Relations: ${c.relationships.join(', ')}`;
      lines.push(line);
    }
  }

  const active = (state.plotThreads ?? []).filter((thread) => thread.status === 'active');
  if (active.length > 0) {
    lines.push('\nACTIVE PLOT THREADS:');
    for (const thread of active) {
      lines.push(`- ${thread.description}`);
    }
  }

  if (state.canonFacts?.length > 0) {
    lines.push('\nESTABLISHED FACTS:');
    for (const fact of state.canonFacts) {
      lines.push(`- ${fact.fact}`);
    }
  }

  if (state.currentSceneOutline) {
    lines.push(`\nCURRENT SCENE OUTLINE: ${state.currentSceneOutline}`);
  }

  return lines.join('\n');
}

export function compressScriptState(state) {
  const lines = [];
  const characters = Array.isArray(state.characters)
    ? state.characters.map((char) =>
        typeof char === 'string'
          ? { name: char }
          : {
              name: char?.name ?? 'UNKNOWN',
              goals: char?.goals
            }
      )
    : [];

  lines.push(`${state.title} | ${state.style.genre}/${state.style.tone} | ${state.totalScenes} scenes`);

  if (characters.length > 0) {
    const charSummary = characters
      .map((char) => (char.goals ? `${char.name}(${char.goals})` : char.name))
      .join(', ');
    lines.push(`CHARS: ${charSummary}`);
  }

  const active = (state.plotThreads ?? []).filter((thread) => thread.status === 'active');
  if (active.length > 0) {
    lines.push(`THREADS: ${active.map((thread) => thread.description).join('; ')}`);
  }

  if (state.canonFacts?.length > 0) {
    const recentFacts = state.canonFacts.slice(-5);
    lines.push(`FACTS: ${recentFacts.map((fact) => fact.fact).join('; ')}`);
  }

  return lines.join('\n');
}
