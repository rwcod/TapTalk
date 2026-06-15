export function profileFromPreferred(preferred) {
  if (preferred === "CommandOrControl+Space") return "cmd_space";
  if (preferred === "CommandOrControl+Shift+Space") return "cmd_shift_space";
  return "fn_space";
}

export function profileToHotkey(profile) {
  if (profile === "cmd_space") {
    return {
      preferred: "CommandOrControl+Space",
      fallbacks: ["CommandOrControl+Shift+Space"]
    };
  }

  if (profile === "cmd_shift_space") {
    return {
      preferred: "CommandOrControl+Shift+Space",
      fallbacks: ["CommandOrControl+Space"]
    };
  }

  return {
    preferred: "Fn+Space",
    fallbacks: ["CommandOrControl+Space", "CommandOrControl+Shift+Space"]
  };
}

const ENGLISH_LANGUAGE_CODE = "en";
const LEGACY_POLISH_ENGLISH_MODE = "pl-en";

export const WHISPER_LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "af", label: "Afrikaans" },
  { value: "am", label: "Amharic" },
  { value: "ar", label: "Arabic" },
  { value: "as", label: "Assamese" },
  { value: "az", label: "Azerbaijani" },
  { value: "ba", label: "Bashkir" },
  { value: "be", label: "Belarusian" },
  { value: "bg", label: "Bulgarian" },
  { value: "bn", label: "Bengali" },
  { value: "bo", label: "Tibetan" },
  { value: "br", label: "Breton" },
  { value: "bs", label: "Bosnian" },
  { value: "ca", label: "Catalan" },
  { value: "cs", label: "Czech" },
  { value: "cy", label: "Welsh" },
  { value: "da", label: "Danish" },
  { value: "de", label: "German" },
  { value: "el", label: "Greek" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "et", label: "Estonian" },
  { value: "eu", label: "Basque" },
  { value: "fa", label: "Persian" },
  { value: "fi", label: "Finnish" },
  { value: "fo", label: "Faroese" },
  { value: "fr", label: "French" },
  { value: "gl", label: "Galician" },
  { value: "gu", label: "Gujarati" },
  { value: "ha", label: "Hausa" },
  { value: "haw", label: "Hawaiian" },
  { value: "he", label: "Hebrew" },
  { value: "hi", label: "Hindi" },
  { value: "hr", label: "Croatian" },
  { value: "ht", label: "Haitian Creole" },
  { value: "hu", label: "Hungarian" },
  { value: "hy", label: "Armenian" },
  { value: "id", label: "Indonesian" },
  { value: "is", label: "Icelandic" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "jw", label: "Javanese" },
  { value: "ka", label: "Georgian" },
  { value: "kk", label: "Kazakh" },
  { value: "km", label: "Khmer" },
  { value: "kn", label: "Kannada" },
  { value: "ko", label: "Korean" },
  { value: "la", label: "Latin" },
  { value: "lb", label: "Luxembourgish" },
  { value: "ln", label: "Lingala" },
  { value: "lo", label: "Lao" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "mg", label: "Malagasy" },
  { value: "mi", label: "Maori" },
  { value: "mk", label: "Macedonian" },
  { value: "ml", label: "Malayalam" },
  { value: "mn", label: "Mongolian" },
  { value: "mr", label: "Marathi" },
  { value: "ms", label: "Malay" },
  { value: "mt", label: "Maltese" },
  { value: "my", label: "Myanmar" },
  { value: "ne", label: "Nepali" },
  { value: "nl", label: "Dutch" },
  { value: "nn", label: "Norwegian Nynorsk" },
  { value: "no", label: "Norwegian" },
  { value: "oc", label: "Occitan" },
  { value: "pa", label: "Punjabi" },
  { value: "pl", label: "Polish" },
  { value: "ps", label: "Pashto" },
  { value: "pt", label: "Portuguese" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "sa", label: "Sanskrit" },
  { value: "sd", label: "Sindhi" },
  { value: "si", label: "Sinhala" },
  { value: "sk", label: "Slovak" },
  { value: "sl", label: "Slovenian" },
  { value: "sn", label: "Shona" },
  { value: "so", label: "Somali" },
  { value: "sq", label: "Albanian" },
  { value: "sr", label: "Serbian" },
  { value: "su", label: "Sundanese" },
  { value: "sv", label: "Swedish" },
  { value: "sw", label: "Swahili" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "tg", label: "Tajik" },
  { value: "th", label: "Thai" },
  { value: "tk", label: "Turkmen" },
  { value: "tl", label: "Tagalog" },
  { value: "tr", label: "Turkish" },
  { value: "tt", label: "Tatar" },
  { value: "uk", label: "Ukrainian" },
  { value: "ur", label: "Urdu" },
  { value: "uz", label: "Uzbek" },
  { value: "vi", label: "Vietnamese" },
  { value: "yi", label: "Yiddish" },
  { value: "yo", label: "Yoruba" },
  { value: "zh", label: "Chinese" }
];

const KNOWN_LANGUAGE_CODES = new Set(WHISPER_LANGUAGE_OPTIONS.map((option) => option.value));

function normalizeLanguageBase(value) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized && normalized !== "auto" ? normalized : "auto";
}

export function parseLocalLanguageConfig(value) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return { baseLanguage: "auto", includeEnglish: false };
  }

  if (normalized === LEGACY_POLISH_ENGLISH_MODE) {
    return { baseLanguage: "pl", includeEnglish: true };
  }

  if (normalized.includes("+")) {
    const parts = normalized
      .split("+")
      .map((item) => item.trim())
      .filter(Boolean);
    const includeEnglish = parts.includes(ENGLISH_LANGUAGE_CODE);
    const baseLanguage =
      parts.find((item) => item !== ENGLISH_LANGUAGE_CODE) ||
      (includeEnglish ? ENGLISH_LANGUAGE_CODE : "auto");
    return {
      baseLanguage: normalizeLanguageBase(baseLanguage),
      includeEnglish: includeEnglish && baseLanguage !== ENGLISH_LANGUAGE_CODE
    };
  }

  return {
    baseLanguage: normalizeLanguageBase(normalized),
    includeEnglish: false
  };
}

export function localLanguageToSetting(baseLanguage, includeEnglish) {
  const normalizedBase = normalizeLanguageBase(baseLanguage);
  if (normalizedBase === "auto") {
    return "";
  }
  if (normalizedBase === ENGLISH_LANGUAGE_CODE) {
    return ENGLISH_LANGUAGE_CODE;
  }
  if (includeEnglish) {
    return `${normalizedBase}+${ENGLISH_LANGUAGE_CODE}`;
  }
  return normalizedBase;
}

export function cloudLanguageToSetting(baseLanguage, includeEnglish) {
  const normalizedBase = normalizeLanguageBase(baseLanguage);
  if (normalizedBase === "auto") {
    return "";
  }

  // Most cloud STT APIs accept only one explicit language; in bilingual mode
  // use provider-side auto detection to allow mixed-language speech.
  if (includeEnglish && normalizedBase !== ENGLISH_LANGUAGE_CODE) {
    return "";
  }

  return normalizedBase;
}

export function populateLanguageSelect(selectElement, selectedBaseLanguage) {
  if (!selectElement) {
    return;
  }

  const selected = normalizeLanguageBase(
    selectedBaseLanguage !== undefined ? selectedBaseLanguage : selectElement.value
  );

  while (selectElement.firstChild) {
    selectElement.removeChild(selectElement.firstChild);
  }

  for (const option of WHISPER_LANGUAGE_OPTIONS) {
    const next = document.createElement("option");
    next.value = option.value;
    next.textContent = option.label;
    selectElement.appendChild(next);
  }

  if (selected !== "auto" && !KNOWN_LANGUAGE_CODES.has(selected)) {
    const custom = document.createElement("option");
    custom.value = selected;
    custom.textContent = `${selected} (custom)`;
    selectElement.appendChild(custom);
  }

  selectElement.value = selected;
}

export function langFrom(value) {
  return parseLocalLanguageConfig(value).baseLanguage;
}

export function langTo(value) {
  return localLanguageToSetting(value, false);
}

export function modelToPreset(model) {
  if (model === "tiny") return "ultrafast";
  if (model === "small") return "balanced";
  if (model === "medium") return "quality";
  return null;
}

export function parsePositiveIntOrFallback(rawValue, fallback) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseKeyValuePairs(rawValue) {
  const text = (rawValue || "").trim();
  if (!text) {
    return {};
  }

  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const eq = entry.indexOf("=");
      if (eq <= 0) {
        return acc;
      }

      const key = entry.slice(0, eq).trim();
      const value = entry.slice(eq + 1).trim();
      if (
        !key ||
        !value ||
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ) {
        return acc;
      }

      acc[key] = value;
      return acc;
    }, Object.create(null));
}

export function serializeKeyValuePairs(map) {
  if (!map || typeof map !== "object") {
    return "";
  }

  return Object.entries(map)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

export function parseHints(rawValue) {
  const text = (rawValue || "").trim();
  if (!text) {
    return [];
  }

  return Array.from(
    new Set(
      text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function userFacingErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const ipcPrefixMatch = raw.match(/^Error invoking remote method '[^']+':\s*/);
  if (!ipcPrefixMatch) {
    return raw;
  }
  return raw.slice(ipcPrefixMatch[0].length).trim();
}

export function isLocalEditEndpoint(rawEndpoint) {
  const trimmed = (rawEndpoint || "").trim();
  if (!trimmed) return false;

  let host;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}
