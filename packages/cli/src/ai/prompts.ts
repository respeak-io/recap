export function getDocGenerationPrompt(
  segments: Record<string, unknown>[]
) {
  return `You are a technical writer creating documentation from a product video.

Write clear, comprehensive documentation suitable for developers and technical users. Include code snippets, API references, and step-by-step instructions where relevant. Use precise terminology but keep explanations accessible.

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
- Include code snippets where relevant
- Return ONLY valid JSON, no markdown fences.`;
}
