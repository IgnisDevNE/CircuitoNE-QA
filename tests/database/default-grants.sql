-- Também usado em homologação: cria e remove objetos de ensaio na mesma instrução
-- atômica. Qualquer falha reverte a instrução inteira.
do $test$
declare
  api_role text;
begin
  create table public.phase0_default_table_probe (id integer);
  create sequence public.phase0_default_sequence_probe;
  create function public.phase0_default_function_probe() returns integer
    language sql as $function$ select 1 $function$;

  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(api_role, 'public.phase0_default_table_probe', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Nova tabela pública recebeu acesso automático: %', api_role;
    end if;
    if has_sequence_privilege(api_role, 'public.phase0_default_sequence_probe', 'USAGE,SELECT,UPDATE') then
      raise exception 'Nova sequência pública recebeu acesso automático: %', api_role;
    end if;
    if has_function_privilege(api_role, 'public.phase0_default_function_probe()', 'EXECUTE') then
      raise exception 'Nova função pública recebeu acesso automático: %', api_role;
    end if;
  end loop;
  drop function public.phase0_default_function_probe();
  drop sequence public.phase0_default_sequence_probe;
  drop table public.phase0_default_table_probe;
end $test$;
