-- Ensaio de infraestrutura: nunca aplicar aos projetos hospedados.
create table public.phase0_pipeline_probe (id integer primary key check (id > 0));
alter table public.phase0_pipeline_probe enable row level security;
revoke all on public.phase0_pipeline_probe from anon, authenticated;
insert into public.phase0_pipeline_probe values (1);
