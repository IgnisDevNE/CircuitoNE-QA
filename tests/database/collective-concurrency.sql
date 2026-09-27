begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'race-collective-'||n||'@example.invalid',now(),'558199700000'||n,now() from generate_series(1,3) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Sintético '||n,(array['52998224725','12345678909','11144477735'])[n],'1990-01-01','Recife','PE',true,gen_random_uuid(),'test-only' from generate_series(1,3) n;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'totp','verified',now(),now() from generate_series(1,3) n;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','aal2',now(),now());
insert into public.collectives(id,owner_user_id,member_role_id,kind,name,description,activity,city,state_code,state) values
('74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','collective','Race','Somente ensaio','Música','Recife','PE','approved');
insert into private.collective_details(collective_id,kind,creator_user_id,request_id,request_hash) values
('74000000-0000-4000-8000-000000000001','collective','70000000-0000-4000-8000-000000000001',gen_random_uuid(),'test-only');
insert into private.collective_roles(id,collective_id,name,builtin) values
('75000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','Membro',true),
('75000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','Operador',false);
insert into private.collective_role_permissions(collective_id,role_id,permission) values
('74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','remove_members');
insert into private.collective_memberships(collective_id,user_id,role_id)
select '74000000-0000-4000-8000-000000000001',('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'75000000-0000-4000-8000-000000000002' from generate_series(1,2) n;
insert into private.membership_requests(id,collective_id,user_id) values
('77000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003');
commit;
