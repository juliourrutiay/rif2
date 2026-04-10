create table if not exists public.raffle_tickets (
  id bigserial primary key,
  raffle_id text not null,
  number integer not null,
  status text not null default 'available',
  reserved_until timestamptz null,
  payer_name text null,
  payer_email text null,
  payer_phone text null,
  payer_rut text null,
  payment_id text null,
  transaction_id text null,
  payment_channel text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raffle_tickets_unique unique (raffle_id, number)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_raffle_tickets_updated_at on public.raffle_tickets;
create trigger trg_raffle_tickets_updated_at
before update on public.raffle_tickets
for each row execute function public.set_updated_at();
