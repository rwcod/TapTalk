export const wizardState = {
  busy: false,
  step: 1,
  cloudAdvancedOpen: false,
  prefsAdvancedOpen: false,
  permAutoAdvanced: false,
  cloudPresetCurrent: "groq",
  cloudApiKeys: {},
  mandatory: false,
  // High-water mark of the furthest step the user has reached, so the sidebar
  // stepper only lets them jump back to steps they have already visited.
  maxStepReached: 1
};

export const WIZARD_STEP_COUNT = 4;
export const WIZARD_DRAFT_STORAGE_KEY = "taptalk.setupWizardDraft.v1";

export const WIZARD_LOCAL_MODEL_PROFILES = {
  fast: {
    model: "tiny",
    hint: "Fastest option, lowest quality. Good for weak CPUs."
  },
  balanced: {
    model: "small",
    hint: "Recommended for most users: good speed and quality."
  },
  quality: {
    model: "medium",
    hint: "Higher quality, slower than small."
  },
  best: {
    model: "large-v3",
    hint: "Best quality but heavy on CPU/RAM."
  },
  custom: {
    model: "",
    hint: "Use any valid faster-whisper model name or local model path."
  }
};
