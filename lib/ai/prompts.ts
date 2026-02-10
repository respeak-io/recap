export function getDocGenerationPrompt(
  audience: string,
  segments: Record<string, unknown>[]
) {
  const audienceInstructions: Record<string, string> = {
    developers: `Write for software developers. Include technical details, API references, code snippets, and configuration. Be precise and concise. Use technical terminology freely.`,
    "end-users": `Write for non-technical end users. Focus on what they can do, not how it works internally. Use simple language, step-by-step instructions, and reference UI elements by name.`,
    "ai-agents": `Write for LLM consumption (AI coding assistants, agents, RAG systems). Optimize for token efficiency and machine parsing:
- No filler words, no conversational tone, no redundancy
- Use structured formats: tables for parameters, typed signatures for APIs, enums for options
- Every code snippet must be complete and copy-pasteable
- Include explicit error codes, edge cases, and version/compatibility notes
- Use consistent heading hierarchy for reliable section extraction
- Prefer lists and key-value pairs over prose paragraphs`,
  };

  const instruction =
    audienceInstructions[audience] ?? audienceInstructions.developers;

  return `You are a technical writer creating documentation from a product video.

Target audience: ${audience}
${instruction}

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
- Include code snippets for developer audience where relevant
- Return ONLY valid JSON, no markdown fences.`;
}
