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

import type { CodebaseSummary } from "../analyze/scanners/nextjs.js";

export function getFeatureDiscoveryPrompt(
  summary: CodebaseSummary,
  hints?: string
): string {
  const routeDescriptions = summary.routes
    .map(
      (r) =>
        `Route: ${r.path}${r.isDynamic ? " (dynamic)" : ""}\nSource:\n${r.componentSource}\n`
    )
    .join("\n---\n");

  return `You are analyzing a ${summary.framework} web application to identify user-facing features for documentation.

Here are the discovered routes and their page components:

${routeDescriptions}

${hints ? `The user has specifically requested focus on: ${hints}\n` : ""}

For each user-facing feature you identify, generate a walkthrough script. Each feature should have:
- "id": a URL-safe slug (e.g., "create-project")
- "title": a human-readable title (e.g., "Creating a New Project")
- "category": a documentation category (e.g., "Getting Started", "Projects", "Settings")
- "steps": an array of walkthrough steps, each with:
  - "action": a human-readable browser action (e.g., "navigate to /dashboard", "click button 'New Project'", "fill input[name='email'] with 'user@example.com'")
  - "narration": what a voiceover would say during this step
  - "pause": milliseconds to pause after the action (default 1500 for navigation, 1000 for clicks, 500 for typing)

Action format guidelines:
- "navigate to /path" — go to a URL
- "click button 'Label'" — click a button by visible text
- "click link 'Label'" — click a link by visible text
- "click 'Label'" — click any element by visible text
- "fill input[name='x'] with 'value'" — type into a form field
- "select 'Option' from 'Label'" — select from a dropdown
- "wait 2000" — explicit wait

Rules:
- Only include features that are accessible to end users (skip admin, API routes, auth internals)
- Group related features logically into categories
- Each feature should demonstrate a complete workflow (not just one click)
- The narration should explain what the user is doing and why, in a friendly tutorial tone
- Skip features behind dynamic routes that require specific data unless you can infer reasonable demo data
- Return ONLY valid JSON matching this structure, no markdown fences.

Return format:
{
  "features": [
    {
      "id": "...",
      "title": "...",
      "category": "...",
      "steps": [{ "action": "...", "narration": "...", "pause": 1500 }]
    }
  ]
}`;
}

export function getActionTranslationPrompt(
  action: string,
  ariaSnapshot: string
): string {
  return `You are translating a human-readable browser action into a Playwright API call.

Current page structure (ARIA snapshot):
${ariaSnapshot}

Action to translate: "${action}"

Return a single Playwright statement that performs this action. Use the most resilient selector strategy:
- Prefer getByRole() with name for buttons, links, headings
- Prefer getByLabel() for form inputs
- Prefer getByText() for generic text elements
- Use locator() with CSS only as a fallback

Return ONLY the Playwright code (e.g., "page.getByRole('button', { name: 'Submit' }).click()"), no explanation.`;
}

export function getNarrationTranslationPrompt(
  narration: string,
  targetLanguage: string
): string {
  return `Translate the following narration text to ${targetLanguage}.
Keep it natural and conversational — this will be spoken aloud by a text-to-speech system.
Preserve any technical terms, product names, or UI element names that should stay in English.
Return ONLY the translated text, no preamble.

${narration}`;
}

export function getDocsPolishPrompt(
  featureTitle: string,
  steps: { action: string; narration: string }[]
): string {
  const stepText = steps
    .map((s, i) => `Step ${i + 1}: [Action: ${s.action}] ${s.narration}`)
    .join("\n");

  return `You are a technical writer creating documentation from a product walkthrough script.

Feature: ${featureTitle}

Walkthrough steps:
${stepText}

Write clear, structured documentation for this feature. The output should be:
- Written in second person ("you can", "click the button")
- Organized with a brief introduction, then step-by-step instructions
- Include the step actions as context but rewrite narration into polished prose
- Use Markdown formatting (headings, bold for UI elements, numbered lists for steps)
- Keep it concise — aim for documentation, not a transcript

Return ONLY the Markdown content, no preamble.`;
}
