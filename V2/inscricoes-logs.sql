-- Rodar no SQL Editor do Supabase (uma vez).
create table if not exists public.inscricoes_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  duration_ms integer,
  ok boolean not null default false,
  forma_ingresso text,
  department text,
  error_code text,
  error_message text,
  lead_id text,
  cpf text,
  email text,
  curso text,
  polo text,
  polo_km numeric,
  order_id text,
  inscricao_siaa text
);

create index if not exists inscricoes_logs_created_at_idx on public.inscricoes_logs (created_at desc);
create index if not exists inscricoes_logs_forma_idx on public.inscricoes_logs (forma_ingresso);
create index if not exists inscricoes_logs_erro_idx on public.inscricoes_logs (error_code);
create index if not exists inscricoes_logs_ok_idx on public.inscricoes_logs (ok);

alter table public.inscricoes_logs enable row level security;

drop policy if exists inscricoes_logs_insert on public.inscricoes_logs;
drop policy if exists inscricoes_logs_select on public.inscricoes_logs;
create policy inscricoes_logs_insert on public.inscricoes_logs for insert with check (true);
create policy inscricoes_logs_select on public.inscricoes_logs for select using (true);

-- Métricas:
-- tempo médio:          select avg(duration_ms) from inscricoes_logs;
-- quantidade:           select count(*) from inscricoes_logs;
-- por tipo:             select forma_ingresso, count(*) from inscricoes_logs group by 1;
-- quantidade de erros:  select count(*) from inscricoes_logs where ok = false;
-- o que é cada erro:    select error_code, error_message, count(*) from inscricoes_logs where ok = false group by 1, 2;
