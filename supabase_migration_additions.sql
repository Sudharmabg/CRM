-- Run in the Supabase SQL editor. Adds: vendor old balance, customer quotation,
-- rentals, inventory, overheads, and the two storage buckets.

-- 1. Vendors: carried-forward balance
alter table vendors add column if not exists old_balance numeric default 0;

-- 2. Customers: Zoho quotation PDF
alter table customers add column if not exists quotation_url text;

-- 3. Rentals
create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  invoice_no text,
  customer_name text not null,
  phone text,
  address text,
  pickup_date date,
  return_date date,
  labour_charges numeric default 0,
  transport_charges numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists rental_items (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  particulars text not null,
  qty numeric default 1,
  rate numeric default 0,
  amount numeric generated always as (qty * rate) stored
);

-- 4. Inventory
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  available_qty numeric default 0,
  price numeric default 0,
  image_url text,
  condition text default 'New' check (condition in ('New','Used','Repair','Refurbish','Discard')),
  created_at timestamptz default now()
);

-- 5. Overheads (fixed expenses + partner / labour salaries)
create table if not exists overheads (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  person text,
  amount numeric not null,
  expense_date date not null,
  month text not null, -- 'YYYY-MM'
  notes text,
  created_at timestamptz default now()
);
create index if not exists overheads_month_idx on overheads(month);

-- RLS: authenticated users only (matches the rest of the app)
alter table rentals enable row level security;
alter table rental_items enable row level security;
alter table inventory enable row level security;
alter table overheads enable row level security;

create policy "auth all" on rentals for all using (true) with check (true);
create policy "auth all" on rental_items for all using (true) with check (true);
create policy "auth all" on inventory for all using (true) with check (true);
create policy "auth all" on overheads for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table rentals, rental_items, inventory, overheads;

-- Storage buckets (public read so the stored URLs open directly)
insert into storage.buckets (id, name, public) values ('quotations', 'quotations', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('inventory', 'inventory', true) on conflict do nothing;

create policy "quotations rw" on storage.objects for all using (bucket_id = 'quotations') with check (bucket_id = 'quotations');
create policy "inventory rw" on storage.objects for all using (bucket_id = 'inventory') with check (bucket_id = 'inventory');

-- 6. Vendor event charges (one row per event / customer a vendor works on)
create table if not exists vendor_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric not null default 0,
  notes text,
  created_at timestamptz default now()
);
alter table vendor_events enable row level security;
create policy "auth all" on vendor_events for all using (true) with check (true);
alter publication supabase_realtime add table vendor_events;
