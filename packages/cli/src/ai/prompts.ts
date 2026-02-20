export function getDocGenerationPrompt(
  segments: Record<string, unknown>[]
) {
  return `You are a technical writer creating documentation from a product video.

Write clear documentation based strictly on the video content below. You may rephrase for clarity and describe what is visually shown on screen, but NEVER add information that is not present in the spoken content or visible on screen. If code, APIs, or UI elements appear in the video, document them faithfully. Do NOT invent code snippets, API endpoints, JSON examples, or technical details that are not explicitly shown or spoken in the video.

Video segments (with timestamps and visual context):
${JSON.stringify(segments, null, 2)}

Generate a structured documentation article in JSON format:
{
  "title": "Article title",
  "chapters": [
    {
      "title": "Chapter title",
      "sections": [
        {
          "heading": "Section heading",
          "content": "Markdown content with video timestamp references like [video:MM:SS]",
          "timestamp_ref": "MM:SS"
        }
      ]
    }
  ]
}

Rules:
- Reference specific video timestamps using [video:MM:SS] format
- Each section should be self-contained and readable
- Group related content into chapters
- Only include code snippets if they are visible on screen or explicitly dictated in the video
- NEVER fabricate API endpoints, JSON schemas, or developer integration guides unless they appear in the video
- When uncertain whether something was in the video, leave it out — omission is better than hallucination
- Return ONLY valid JSON, no markdown fences.`;
}
