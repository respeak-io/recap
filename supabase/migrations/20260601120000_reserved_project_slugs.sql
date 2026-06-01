-- Reserved project slugs.
--
-- Public docs URLs are `/<locale>/<projectSlug>/…`, so a project slug that equals
-- a supported language code (en/de/es/fr/ja/zh/ko/pt) is ambiguous with the locale
-- segment, and a slug that equals another route group's segment (api/project/
-- dashboard/login/signup/callback) collides with that route. Either makes the
-- project's bare URL unreachable. The app guards these at creation time
-- (see lib/docs-locale.ts `isReservedDocsSlug`); this constraint enforces it at the
-- database so every insert path — including direct client inserts — is covered.
alter table projects
  add constraint projects_slug_not_reserved
  check (
    slug not in (
      'en', 'de', 'es', 'fr', 'ja', 'zh', 'ko', 'pt',
      'api', 'project', 'dashboard', 'login', 'signup', 'callback'
    )
  );
