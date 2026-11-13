import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerMarkdown, parseAnswerBlocks } from "@/components/docs/answer-markdown";

const render = (text: string) => renderToStaticMarkup(createElement(AnswerMarkdown, { text }));

describe("AnswerMarkdown", () => {
  it("renders bold instead of showing asterisks (the reported case)", () => {
    const html = render(
      "Einträge in der Akte können Sie während eines Chats nutzen, indem Sie oben im Chat auf **Verlauf** klicken und unten im Fenster **Zur Akte** auswählen (Artikel „Die Akte“).",
    );
    expect(html).toContain('<strong class="font-semibold text-foreground">Verlauf</strong>');
    expect(html).toContain(">Zur Akte</strong>");
    expect(html).not.toContain("**");
  });

  it("renders bullet and numbered lists, italics, code and video references", () => {
    const html = render("Schritte:\n1. Öffne *Verwaltung*\n2. Klicke `Export`\n\n- a\n- b [video:01:23]");
    expect(html).toContain('<ol class="space-y-1 pl-5 list-decimal"><li>Öffne <em>Verwaltung</em></li>');
    expect(html).toContain("<code");
    expect(html).toContain('<ul class="space-y-1 pl-5 list-disc"><li>a</li><li>b <span class="text-muted-foreground">(01:23)</span></li></ul>');
  });

  it("never turns model output into markup", () => {
    const html = render('Hallo <img src=x onerror="alert(1)"> **<script>x</script>** [Link](javascript:alert(1))');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;img");
  });

  it("joins wrapped lines into one paragraph and splits on blank lines", () => {
    const blocks = parseAnswerBlocks("Zeile eins\nZeile zwei\n\nNeuer Absatz\n## Titel");
    expect(blocks).toEqual([
      { kind: "p", lines: ["Zeile eins", "Zeile zwei"] },
      { kind: "p", lines: ["Neuer Absatz"] },
      { kind: "h", text: "Titel" },
    ]);
  });
});
