import { generateText } from "./generate";

export function getTranslationPrompt(targetLanguage: string, content: string) {
  return `Translate the following documentation to ${targetLanguage}.
Preserve all formatting, code snippets, [video:MM:SS] timestamp references, and technical terms.
Only translate the natural language text. Return ONLY the translated text, no preamble.

${content}`;
}

export function getVttTranslationPrompt(targetLanguage: string, vtt: string) {
  return `Translate the following WebVTT subtitle file to ${targetLanguage}.
Preserve all timestamps exactly as they are. Only translate the subtitle text lines.
Return the complete VTT file with translated text. Return ONLY the VTT content, no preamble.

${vtt}`;
}

export async function translateContent(
  content: string,
  targetLanguage: string
): Promise<string> {
  const prompt = getTranslationPrompt(targetLanguage, content);
  const result = await generateText(prompt);
  return result || content;
}

export async function translateVtt(
  vtt: string,
  targetLanguage: string
): Promise<string> {
  const prompt = getVttTranslationPrompt(targetLanguage, vtt);
  const result = await generateText(prompt);
  return result || vtt;
}

/** Translate Tiptap JSON content by extracting text, translating, and re-assembling */
export async function translateTiptapJson(
  contentJson: Record<string, unknown>,
  contentText: string,
  targetLanguage: string,
  title?: string
): Promise<{ json: Record<string, unknown>; text: string; title?: string }> {
  // Translate the plain text version
  const translatedText = await translateContent(contentText, targetLanguage);

  // For the JSON content, we ask Gemini to translate while preserving structure
  const jsonPrompt = `Translate the following Tiptap JSON document to ${targetLanguage}.
Rules:
- Preserve the exact JSON structure (all "type", "attrs", "marks" fields unchanged)
- Only translate the "text" field values that contain natural language
- Do NOT translate code snippets, URLs, or technical identifiers
- Preserve [video:MM:SS] references exactly
- Return ONLY valid JSON, no markdown fences.

${JSON.stringify(contentJson)}`;

  const responseText = await generateText(jsonPrompt, { json: true });

  let translatedTitle: string | undefined;
  if (title) {
    translatedTitle = await translateContent(title, targetLanguage);
  }

  try {
    const translatedJson = JSON.parse(responseText);
    return { json: translatedJson, text: translatedText, title: translatedTitle };
  } catch {
    // Fallback: return original JSON with translated text
    return { json: contentJson, text: translatedText, title: translatedTitle };
  }
}
