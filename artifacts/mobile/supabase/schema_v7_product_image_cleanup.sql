-- SamaStock Supabase schema V7
-- Product images are local-only from now on.
-- Supabase stores product data, not phone image paths.
-- Safe to run more than once.

alter table public.products
  add column if not exists image_path text;

alter table public.products
  add column if not exists image_url text;

update public.products
set
  image_uri = null,
  image_path = null,
  image_url = null
where image_uri is not null
   or image_path is not null
   or image_url is not null;

-- Supabase does not allow direct SQL deletion from storage.objects/storage.buckets.
-- If the old product-images bucket exists, delete it from:
-- Supabase Dashboard > Storage > product-images > Empty bucket, then Delete bucket.