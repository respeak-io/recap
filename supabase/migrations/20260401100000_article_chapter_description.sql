-- Add description field to articles and chapters
alter table articles add column description text not null default '';
alter table chapters add column description text not null default '';
