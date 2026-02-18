-- Remove audience from articles table
-- First drop the unique constraint that includes audience
ALTER TABLE articles DROP CONSTRAINT articles_project_id_audience_language_slug_key;

-- Add new unique constraint without audience
ALTER TABLE articles ADD CONSTRAINT articles_project_id_language_slug_key
  UNIQUE (project_id, language, slug);

-- Drop the audience column
ALTER TABLE articles DROP COLUMN audience;

-- Remove audience from page_views
ALTER TABLE page_views DROP COLUMN audience;

-- Remove audience from search_events
ALTER TABLE search_events DROP COLUMN audience;

-- Drop and recreate analytics_top_articles without audience
CREATE OR REPLACE FUNCTION analytics_top_articles(
  p_project_id uuid,
  p_since timestamptz,
  p_limit integer
)
RETURNS TABLE (article_slug text, article_title text, views bigint) AS $$
  SELECT
    pv.article_slug,
    coalesce(a.title, pv.article_slug) AS article_title,
    count(*) AS views
  FROM page_views pv
  LEFT JOIN articles a ON a.id = pv.article_id
  WHERE pv.project_id = p_project_id
    AND pv.created_at >= p_since
  GROUP BY pv.article_slug, a.title
  ORDER BY views DESC
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER;

-- Drop the audience breakdown function entirely
DROP FUNCTION IF EXISTS analytics_audience_breakdown(uuid, timestamptz);
