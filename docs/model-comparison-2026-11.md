# Gemini model choice and docs search (2026-11-13)

Why the models in `packages/cli/src/ai/models.ts` and `lib/ai/models.ts` are set the way they are, and why the docs search ranking changed.

## Search answers: model comparison

Setup: 10 real questions against the `experte` docs (5 English, 5 German). The real `/api/search` route picked the top 3 articles for each, and the exact production answer prompt was sent to each variant. Prices are Standard tier from the Gemini API pricing page as of 13.11.2026. Thinking tokens are billed as output.

| Variant | Median | p90 | Output tokens (of which thinking) | $ / 1,000 answers (now / from 2027) |
|---|---|---|---|---|
| `3-flash-preview (previous)` | 5.5 s | 18.0 s | 1414 (1288) | 5.20 / 5.20 |
| `3-flash-preview LOW` | 1.3 s | 1.7 s | 121 (0) | 1.32 / 1.32 |
| `3.5-flash-lite` | 0.7 s | 1.2 s | 90 (0) | 0.80 / 0.80 |
| `3.5-flash-lite LOW` | 1.0 s | 1.8 s | 159 (78) | 0.97 / 0.97 |
| `3.1-flash-lite LOW` | 1.4 s | 2.0 s | 217 (110) | 0.80 / 0.80 |
| `3.8-flash` | 7.9 s | 15.0 s | 934 (805) | 4.93 / 9.87 |
| `3.8-flash LOW` | 2.9 s | 4.2 s | 118 (0) | 1.87 / 3.74 |

Answer quality, judged by reading all answers side by side: `3.5-flash-lite` with its default thinking matched `gemini-3-flash-preview`. It quotes, cites article titles and says when the provided articles don't cover the question. LOW thinking on Flash-Lite was slower than the default, and once answered a German question in English. The prompt now also asks for an answer in the language of the question.

Decision: search answers use `gemini-3.5-flash-lite` with default thinking.

## Other tasks

| Task | Model | Thinking | Reason |
|---|---|---|---|
| Video → segments, docs writing, `analyze` | `gemini-3.8-flash` | MEDIUM | Quality matters most; runs once per video or plan |
| `record` (step → Playwright code) | `gemini-3.8-flash` | LOW | Many short calls; keeps the recording fast |
| Translation (CLI and dashboard) | `gemini-3.5-flash-lite` | default | Built for translation; high volume |

`gemini-2.5-flash`, the previous CLI default, is deprecated. From 01.12.2026, Google routes it to `gemini-3.5-flash-lite`. `gemini-3-flash-preview` is listed as a legacy model.

## Docs search ranking

The answer can only be as good as the 3 articles the search hands over. In the comparison above, 3 of 10 questions got the wrong articles, so the search was rebuilt:

- **Before:** the strict stage required every word (stop words like "kann" and "ich" included) and returned matches in no particular order. A ranked OR search ran only when the strict stage found nothing.
- **Now:** `search_articles_ranked` (migrations `20261113140000` and `20261113150000`) gets the meaningful terms, with German and English stop words removed (`lib/search/query.ts`). It matches word prefixes and ranks by one score: matched terms + 2 × title relevance + body relevance. Sorting by matched terms first and relevance second ranked worse on the same queries (MRR 0.66 instead of 0.73).

On 15 test queries (the 10 above plus 5 short keyword searches), the expected article is now in the top 3 for 14 queries, up from 10. The mean reciprocal rank rose from 0.49 to 0.73.

## Cost protection for the public search

`/api/search/answer` is public and unauthenticated. Four layers limit what it can cost:

1. **Input limits:** at most 300 characters per question, 3 articles, and an 8 KB request body.
2. **Per-IP rate limits** (`lib/rate-limit.ts`): 10 answers per minute and 200 per day; 60 searches per minute; 120 analytics events per minute.
3. **Answer cache:** keyed by project, language, normalised question and articles. It clears with the docs cache whenever content changes. Repeated questions cost nothing.
4. **Daily budget** (`lib/ai/budget.ts`, table `ai_usage_daily`): the `AI_DAILY_BUDGET_USD` setting, default $5 per UTC day. When it's reached, search still works and only the AI answer is skipped. If the spend can't be read, the AI answer is skipped as well (fails closed).

The rate limits live in memory, which suits a single container: they reset when the container restarts. The daily budget is stored in the database and is the hard ceiling.
