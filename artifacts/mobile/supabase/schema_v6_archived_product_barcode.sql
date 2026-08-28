-- SamaStock Supabase schema V6
-- Allow reusing a barcode after a product is archived.
-- Safe to run more than once.

drop index if exists products_shop_barcode_unique;

create unique index if not exists products_shop_barcode_unique
  on public.products(shop_id, barcode)
  where barcode is not null
    and barcode <> ''
    and shop_id is not null
    and is_archived = false
    and deleted_at is null;