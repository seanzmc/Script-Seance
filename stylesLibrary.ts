export type StyleCategory = "genre_format_parody" | "linguistic_dialogue_constraint" | "absurdist_mechanic" | "vibe_tone";

export type StyleItem = {
    id: string; // stable slug
    category: StyleCategory;
    title: string;
    description: string;
    sampleLine: string; // for preview in setup UI (no model call)
};

export const STYLE_CATEGORIES: Array<{ id: StyleCategory; label: string }> = [
    { id: "genre_format_parody", label: "Genre & Format Parodies" },
    { id: "linguistic_dialogue_constraint", label: "Linguistic & Dialogue Constraints" },
    { id: "absurdist_mechanic", label: "Absurdist & Situational Mechanics" },
    { id: "vibe_tone", label: "Pure Vibes & Tones" },
];

export const stylesLibrary: StyleItem[] = [
    // 🎬 Genre & Format Parodies
    {
        id: "noir-1940s-detective",
        category: "genre_format_parody",
        title: "1940s Noir Detective",
        description: "Everyone speaks in brooding metaphors, rain is always falling, and there is a heavy reliance on cynical voiceovers.",
        sampleLine: "VOICEOVER (TIRED): The neon blinked like it knew something I didn’t, and that made two of us.",
    },
    {
        id: "daytime-soap-telenovela",
        category: "genre_format_parody",
        title: "Daytime Soap Opera / Telenovela",
        description: "Extreme melodrama. Every scene involves a shocking gasp, a sudden betrayal, amnesia, or a long-lost evil twin.",
        sampleLine: "MARIANA gasps so hard the room changes temperature: “You… you’re not my brother. You’re my brother’s brother.”",
    },
    {
        id: "reality-tv-drama",
        category: "genre_format_parody",
        title: "Reality TV Drama",
        description: 'Includes frequent "confessional" cutaways where characters talk trash about what just happened in the scene.',
        sampleLine: "CONFESSIONAL: “So when he said ‘nice idea,’ I heard ‘I hope your Wi-Fi dies.’ Just saying.”",
    },
    {
        id: "corporate-training-video",
        category: "genre_format_parody",
        title: "Corporate Training Video",
        description: 'Unnaturally enthusiastic, full of buzzwords ("synergy," "circling back"), forced smiles, and awkward acronyms.',
        sampleLine: "NARRATOR (CHEERFUL): “Let’s operationalize gratitude by aligning on next steps for our feelings deliverables.”",
    },
    {
        id: "true-crime-reenactment",
        category: "genre_format_parody",
        title: "True Crime Reenactment",
        description: 'Mundane actions are treated with ominous dread, complete with a narrator explaining the "chilling" details of someone making toast.',
        sampleLine: "NARRATOR (LOW): She reached for the butter… unaware it would be the last normal choice she’d make that morning.",
    },
    {
        id: "silent-film-era",
        category: "genre_format_parody",
        title: "Silent Film Era",
        description: 'Dialogue is sparse and comes in "title cards." Stage directions focus on exaggerated physical gestures, mustache twirling, and damsel-in-distress fainting.',
        sampleLine: "[TITLE CARD]: “CURSES! MY PLAN IS RUINED!” (He twirls a mustache that is clearly plotting.)",
    },

    // 🗣️ Linguistic & Dialogue Constraints
    {
        id: "shakespearean-drama",
        category: "linguistic_dialogue_constraint",
        title: "Shakespearean Drama",
        description: '"Thees," "thous," iambic pentameter, and ending scenes with dramatic rhyming couplets.',
        sampleLine: "PRITHEE, good sir, unhand mine anxious heart, lest dawn arrive and tear our scheme apart.",
    },
    {
        id: "overly-literal",
        category: "linguistic_dialogue_constraint",
        title: "Overly Literal",
        description: "Characters do not understand metaphors, sarcasm, or idioms. Everything is taken at exact face value.",
        sampleLine: "“Break a leg?” I will not. I need both legs for walking. Please revise your request.",
    },
    {
        id: "passive-aggressive-polite",
        category: "linguistic_dialogue_constraint",
        title: "Passive-Aggressive Polite",
        description: 'Everyone is smiling and using incredibly polite manners, but the dialogue is laced with venomous, underlying insults (e.g., "Southern Belle" or "British High Society").',
        sampleLine: "“Bless your heart, that is such a brave opinion to say out loud in public.”",
    },
    {
        id: "caveman-toddler",
        category: "linguistic_dialogue_constraint",
        title: "Caveman / Toddler",
        description: "Extremely limited vocabulary. Simple sentences, big emotions, and third-person self-references.",
        sampleLine: "ME WANT PLAN. PLAN MAKE ME HAPPY. NO PLAN MAKE ME SCREAM-CRY.",
    },
    {
        id: "interrogation-mode",
        category: "linguistic_dialogue_constraint",
        title: "Interrogation Mode",
        description: "Every single line of dialogue must end in a question mark? Even if they are just stating a fact?",
        sampleLine: "You’re telling me you brought the map, and you’re proud of that decision?",
    },
    {
        id: "spoken-word-musical",
        category: "linguistic_dialogue_constraint",
        title: "Spoken-Word Musical",
        description: "Characters burst into highly choreographed, emotional monologues that read exactly like musical theater songs, but without the music.",
        sampleLine: "I am a suitcase full of feelings, zipped up, dragged along, hoping the handle doesn’t snap mid-chorus.",
    },

    // 🌀 Absurdist & Situational Mechanics
    {
        id: "constant-fourth-wall-breaks",
        category: "absurdist_mechanic",
        title: "Constant Fourth-Wall Breaks",
        description: "Characters frequently pause the scene to look directly at the camera and complain to the audience about the script or other characters.",
        sampleLine: "(To camera) “We’re doing this scene again because someone said ‘tighten pacing’ like it’s a spell.”",
    },
    {
        id: "inner-monologue-out-loud",
        category: "absurdist_mechanic",
        title: "Inner Monologue Out Loud",
        description: "Characters accidentally say their deepest insecurities and true motives out loud, but everyone pretends it’s totally normal conversation.",
        sampleLine: "“I’m only here because I fear being forgotten,” he says aloud. “Anyway, how’s traffic?”",
    },
    {
        id: "mundane-epic",
        category: "absurdist_mechanic",
        title: "Mundane Epic",
        description: "High-fantasy, life-or-death stakes are applied to completely mundane tasks (e.g., treating a trip to the DMV like the quest to destroy the One Ring).",
        sampleLine: "He raised the sacred Ticket Number. The oracle called… B-37. The fellowship wept.",
    },
    {
        id: "everyone-lying-badly",
        category: "absurdist_mechanic",
        title: "Everyone is Lying (Badly)",
        description: "No character tells the truth about anything, but their lies are horribly obvious and instantly disprovable.",
        sampleLine: "“I’ve never seen a spoon,” she says, holding a spoon, wearing a spoon-shaped hat.",
    },
    {
        id: "inconvenient-narrator",
        category: "absurdist_mechanic",
        title: "The Inconvenient Narrator",
        description: "A narrator is present in the scene, but they keep getting the facts wrong, forcing the characters to stop acting and correct them.",
        sampleLine: "NARRATOR: He strode confidently into the palace. CHARACTER: “This is a Wendy’s.”",
    },
    {
        id: "time-travel-sickness",
        category: "absurdist_mechanic",
        title: "Time-Travel Sickness",
        description: "Characters randomly jump back and forth a few minutes in the conversation, repeating lines or answering questions before they are asked.",
        sampleLine: "“Yes, I did it,” she says. He blinks. “Did what?” She sighs, “Right. We haven’t asked yet.”",
    },

    // 🎭 Pure Vibes & Tones
    {
        id: "aggressively-wholesome",
        category: "vibe_tone",
        title: "Aggressively Wholesome",
        description: "No conflict, no villains. Everyone is incredibly supportive, overly communicative, and eager to go to therapy.",
        sampleLine: "“Thank you for sharing that. Would you like a hug, a boundary, or a snack?”",
    },
    {
        id: "deeply-cynical",
        category: "vibe_tone",
        title: "Deeply Cynical",
        description: "No one cares about the plot. Every character is exhausted, apathetic, and just wants to go home.",
        sampleLine: "“Sure,” he says, not looking up. “Let’s save the world or whatever. I have leftovers.”",
    },
    {
        id: "fever-dream",
        category: "vibe_tone",
        title: "Fever Dream",
        description: "Logic has left the chat. Scenes transition nonsensically, characters swap names, and inanimate objects might start talking.",
        sampleLine: "The door clears its throat. “I’m your mother now,” it says, politely, while the sky changes fonts.",
    },
    {
        id: "overstimulated-caffeine-rush",
        category: "vibe_tone",
        title: "Overstimulated / Caffeine Rush",
        description: "Extremely fast-paced. Sentences run together, characters constantly interrupt each other, and stage directions are chaotic and panicked.",
        sampleLine: "He opens his mouth and three conversations sprint out, trip over a chair, and apologize mid-fall.",
    },
];
