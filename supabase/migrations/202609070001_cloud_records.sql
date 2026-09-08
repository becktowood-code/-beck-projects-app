-- High-Amps cloud records. Run as the project database owner.
-- Invoice mutations are available only through authenticated, owner-scoped RPCs.
create table public.ha_documents (
  owner_id uuid not null references auth.users(id),
  id uuid not null,
  number text not null,
  version integer not null check (version > 0),
  document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id), unique (owner_id, number)
);
create table public.ha_counters (owner_id uuid primary key references auth.users(id), next_number integer not null default 1);
create table public.ha_files (
  owner_id uuid not null references auth.users(id), id uuid not null, document_id uuid not null,
  path text not null unique, primary key (owner_id,id),
  foreign key (owner_id,document_id) references public.ha_documents(owner_id,id)
);
create table public.ha_revisions (
  owner_id uuid not null references auth.users(id), document_id uuid not null, version integer not null,
  document jsonb not null, primary key(owner_id,document_id,version),
  foreign key (owner_id,document_id) references public.ha_documents(owner_id,id)
);
alter table public.ha_documents enable row level security;
alter table public.ha_files enable row level security;
alter table public.ha_revisions enable row level security;
alter table public.ha_counters enable row level security;
create policy own_documents on public.ha_documents for select to authenticated using (owner_id = (select auth.uid()));
create policy own_files on public.ha_files for select to authenticated using (owner_id = (select auth.uid()));
create policy own_revisions on public.ha_revisions for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.ha_documents, public.ha_files, public.ha_revisions, public.ha_counters from anon, authenticated;
grant select on public.ha_documents, public.ha_files, public.ha_revisions to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('high-amps-attachments','high-amps-attachments',false,31457280,array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy read_own_invoice_files on storage.objects for select to authenticated
using (bucket_id='high-amps-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Immutable object keys: no UPDATE or DELETE permission, including after payment.
create policy upload_own_invoice_files on storage.objects for insert to authenticated
with check (bucket_id='high-amps-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text
  and array_length(storage.foldername(name),1)=2
  and not exists (select 1 from public.ha_documents d where d.owner_id=(select auth.uid()) and d.id::text=(storage.foldername(name))[2] and d.document->>'status' in ('Paid','Void')));

create function public.ha_validate(d jsonb, final boolean default false) returns void language plpgsql set search_path='' as $$
declare k text; f text; r jsonb; n numeric; subtotal numeric := 0; total numeric;
begin
  if d is null or jsonb_typeof(d)<>'object' or coalesce(d->>'type','') not in ('Invoice','Quote')
    or coalesce(d->>'status','') not in ('Draft','Issued','Paid','Void')
    or coalesce(d->>'recipient','') not in ('customer','contractor') or length(trim(coalesce(d->>'number','')))=0
    or length(d->>'number')>100 then raise exception 'Invalid document details'; end if;
  perform (d->>'id')::uuid;
  if coalesce(d->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid invoice date'; end if;
  perform (d->>'date')::date;
  n := (d->>'taxRate')::numeric;
  if n is null or n<0 or n>100 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid tax rate'; end if;
  if jsonb_typeof(d->'applyTax') is distinct from 'boolean' then raise exception 'Invalid tax selection'; end if;
  if final and length(trim(coalesce(d->>((d->>'recipient')||'Name'),'')))=0 then raise exception 'Enter the selected recipient name'; end if;
  foreach k in array array['labor','materials','fixedItems'] loop
    if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'Invalid line items'; end if;
    for r in select value from jsonb_array_elements(d->k) loop
      if final and length(trim(coalesce(r->>'description','')))=0 then raise exception 'Line items require descriptions'; end if;
      foreach f in array case k when 'labor' then array['hours','rate'] when 'materials' then array['qty','cost','markup'] else array['amount'] end loop
        n := nullif(r->>f,'')::numeric;
        if n is null or n<0 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid line amount'; end if;
      end loop;
      subtotal := subtotal + round(case k when 'labor' then (r->>'hours')::numeric*(r->>'rate')::numeric when 'materials' then (r->>'qty')::numeric*(r->>'cost')::numeric*(1+(r->>'markup')::numeric/100) else (r->>'amount')::numeric end *100);
    end loop;
  end loop;
  total := subtotal + case when (d->>'applyTax')::boolean then round(subtotal*(d->>'taxRate')::numeric/100) else 0 end;
  if total>10000000000 then raise exception 'Invoice total is too large'; end if;
  if jsonb_typeof(d->'attachments') is distinct from 'array' or jsonb_typeof(d->'history') is distinct from 'array' or jsonb_typeof(d->'payments') is distinct from 'array' then raise exception 'Invalid record structure'; end if;
  if length(coalesce(d->>'paidDate',''))>0 then perform (d->>'paidDate')::date; end if;
end $$;

create function public.ha_register_files(d jsonb, extra jsonb default '[]') returns void language plpgsql security definer set search_path='' as $$
declare a jsonb; p text; aid uuid; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  for a in select value from jsonb_array_elements((d->'attachments')||extra) loop
    if coalesce((a->>'missing')::boolean,false) then continue; end if;
    aid := (a->>'id')::uuid; p := uid::text||'/'||(d->>'id')||'/'||aid::text;
    if not exists(select 1 from storage.objects where bucket_id='high-amps-attachments' and name=p) then raise exception 'Missing attachment: %',a->>'name'; end if;
    if exists(select 1 from public.ha_files where owner_id=uid and id=aid and document_id<>(d->>'id')::uuid) then raise exception 'Attachment belongs to another record'; end if;
    insert into public.ha_files(owner_id,id,document_id,path) values(uid,aid,(d->>'id')::uuid,p) on conflict(owner_id,id) do nothing;
  end loop;
end $$;

create function public.ha_create(template jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); d jsonb; num integer; identifier uuid:=(template->>'id')::uuid; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if uid is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select document into d from public.ha_documents where owner_id=uid and id=identifier;
  if found then return d; end if;
  insert into public.ha_counters(owner_id) values(uid) on conflict do nothing;
  select next_number into num from public.ha_counters where owner_id=uid for update;
  while exists(select 1 from public.ha_documents where owner_id=uid and number='HA-'||lpad(num::text,greatest(4,length(num::text)),'0')) loop num:=num+1; end loop;
  update public.ha_counters set next_number=num+1 where owner_id=uid;
  d := template || jsonb_build_object('number','HA-'||lpad(num::text,greatest(4,length(num::text)),'0'),'version',1,'status','Draft','createdAt',stamp,'updatedAt',stamp,'issuedAt',null,'paidDate','','payments','[]'::jsonb,'attachments','[]'::jsonb,'history',jsonb_build_array(jsonb_build_object('action','Created in cloud','at',stamp,'version',1)));
  perform public.ha_validate(d);
  insert into public.ha_documents(owner_id,id,number,version,document) values(uid,identifier,d->>'number',1,d);
  return d;
end $$;

create function public.ha_save(candidate jsonb, action text default 'save', detail jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); old jsonb; d jsonb; next_status text; version integer; label text; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if uid is null then raise exception 'Sign in required'; end if;
  select document into old from public.ha_documents where owner_id=uid and id=(candidate->>'id')::uuid for update;
  if not found then raise exception 'Document not found'; end if;
  if old->>'status' in ('Paid','Void') then raise exception 'Paid and void records are locked'; end if;
  if (candidate->>'version')::integer is distinct from (old->>'version')::integer then raise exception 'This record changed on another device. Reload it before editing.'; end if;
  if candidate->>'status' is distinct from old->>'status' or candidate->>'type' is distinct from old->>'type' then raise exception 'Use the lifecycle actions to change status'; end if;
  next_status:=old->>'status';
  case action
    when 'save' then label:='Saved corrections';
    when 'issue' then next_status:='Issued'; label:='Issued';
    when 'reopen' then if next_status<>'Issued' then raise exception 'Only issued records can be reopened'; end if; next_status:='Draft'; label:='Reopened for corrections';
    when 'paid' then
      if next_status<>'Issued' or old->>'type'<>'Invoice' then raise exception 'Only issued invoices can be paid'; end if;
      if coalesce(detail->>'paidDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (detail->>'paidDate')::date > (now() at time zone 'America/New_York')::date then raise exception 'Invalid paid date'; end if;
      if exists(select 1 from jsonb_array_elements(candidate->'attachments') a where (a->>'missing')::boolean and (a->>'showOnInvoice')::boolean) then raise exception 'Resolve missing attachments before marking paid'; end if;
      next_status:='Paid'; label:='Marked paid';
    when 'void' then
      if length(trim(coalesce(detail->>'reason','')))=0 then raise exception 'Enter a void reason'; end if;
      next_status:='Void'; label:='Voided';
    else raise exception 'Invalid lifecycle action';
  end case;
  version:=(old->>'version')::integer+1;
  d:=candidate || jsonb_build_object('number',trim(candidate->>'number'),'company',old->'company','createdAt',old->'createdAt','issuedAt',case when action='issue' then coalesce(nullif(old->'issuedAt','null'::jsonb),to_jsonb(stamp)) else old->'issuedAt' end,'payments',old->'payments','paidDate',case when action='paid' then detail->>'paidDate' else old->>'paidDate' end,'paymentMethod',case when action='paid' then coalesce(detail->>'paymentMethod','Other') else old->>'paymentMethod' end,'paymentReference',case when action='paid' then coalesce(detail->>'paymentReference','') else old->>'paymentReference' end,'voidReason',case when action='void' then detail->>'reason' else old->>'voidReason' end,'status',next_status,'version',version,'updatedAt',stamp,'history',(old->'history')||jsonb_build_array(jsonb_build_object('action',label,'at',stamp,'version',version,'detail',detail)));
  perform public.ha_validate(d,next_status in ('Issued','Paid'));
  perform public.ha_register_files(d);
  insert into public.ha_revisions values(uid,(old->>'id')::uuid,(old->>'version')::integer,old);
  update public.ha_documents set document=d,number=d->>'number',version=(d->>'version')::integer,updated_at=now() where owner_id=uid and id=(d->>'id')::uuid;
  return d;
end $$;

-- Restore/import is append-only. Matching IDs/numbers can never overwrite paid records.
create function public.ha_import(doc jsonb, files jsonb default '[]', revisions jsonb default '[]') returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r jsonb; d jsonb; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if uid is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.ha_documents where owner_id=uid and (id=(doc->>'id')::uuid or number=trim(doc->>'number'))) then return false; end if;
  perform public.ha_validate(doc);
  d:=doc||jsonb_build_object('number',trim(doc->>'number'),'updatedAt',stamp,'history',(doc->'history')||jsonb_build_array(jsonb_build_object('action','Imported to cloud','at',stamp,'version',(doc->>'version')::integer)));
  insert into public.ha_documents(owner_id,id,number,version,document) values(uid,(d->>'id')::uuid,d->>'number',(d->>'version')::integer,d);
  perform public.ha_register_files(d,files);
  for r in select value from jsonb_array_elements(revisions) loop
    if r->'document'->>'id' is distinct from d->>'id' then raise exception 'Invalid revision owner'; end if;
    perform public.ha_validate(r->'document');
    insert into public.ha_revisions values(uid,(d->>'id')::uuid,(r->'document'->>'version')::integer,r->'document');
  end loop;
  return true;
end $$;
revoke all on function public.ha_validate(jsonb,boolean), public.ha_register_files(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.ha_create(jsonb), public.ha_save(jsonb,text,jsonb), public.ha_import(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.ha_create(jsonb), public.ha_save(jsonb,text,jsonb), public.ha_import(jsonb,jsonb,jsonb) to authenticated;
