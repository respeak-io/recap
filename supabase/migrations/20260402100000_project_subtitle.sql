-- Add subtitle to projects for the public docs landing page
alter table projects add column subtitle text not null default '';
