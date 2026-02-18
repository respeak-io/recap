-- Add 'retried' status and retry tracking to processing_jobs
alter table processing_jobs drop constraint processing_jobs_status_check;
alter table processing_jobs add constraint processing_jobs_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'retried'));

-- Track how many times this video has been retried
alter table processing_jobs add column retry_of uuid references processing_jobs(id);
