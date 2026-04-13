export const LANGUAGES = [
  { code: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "de", label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "es", label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "fr", label: "Francais", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "ja", label: "\u65E5\u672C\u8A9E", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "zh", label: "\u4E2D\u6587", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "ko", label: "\uD55C\uAD6D\uC5B4", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "pt", label: "Portugues", flag: "\u{1F1E7}\u{1F1F7}" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const langMap = new Map<string, (typeof LANGUAGES)[number]>(
  LANGUAGES.map((l) => [l.code, l]),
);

export function getLanguageLabel(code: string): string {
  return langMap.get(code)?.label ?? code;
}

export function getLanguageFlag(code: string): string {
  return langMap.get(code)?.flag ?? "\u{1F310}";
}
