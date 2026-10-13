-- Keep acceptance and provenance fields out of ordinary editor mutations.
alter function public.ha_save(jsonb,text,jsonb) rename to ha_save_base;
revoke all on function public.ha_save_base(jsonb,text,jsonb) from public,anon,authenticated;
create function public.ha_save(candidate jsonb, action text default 'save', detail jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
  select document into old from public.ha_documents
    where owner_id=auth.uid() and id=(candidate->>'id')::uuid for update;
  if not found then raise exception 'Document not found'; end if;
  candidate := candidate || jsonb_build_object(
    'acceptedAt',old->'acceptedAt','invoiceId',old->'invoiceId','invoiceNumber',old->'invoiceNumber',
    'sourceQuoteId',old->'sourceQuoteId','sourceQuoteNumber',old->'sourceQuoteNumber');
  return public.ha_save_base(candidate,action,detail);
end $$;
revoke all on function public.ha_save(jsonb,text,jsonb) from public,anon;
grant execute on function public.ha_save(jsonb,text,jsonb) to authenticated;

create function public.ha_accept_quote(quote_id uuid, expected_version integer, invoice_id uuid, attachment_ids jsonb, invoice_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); q jsonb; d jsonb; accepted jsonb; a jsonb; copied jsonb:='[]'; i integer:=0;
  stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if uid is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select document into q from public.ha_documents where owner_id=uid and id=quote_id for update;
  if not found or q->>'type'<>'Quote' then raise exception 'Quote not found'; end if;
  if q->>'invoiceId' is not null then
    select document into d from public.ha_documents where owner_id=uid and id=(q->>'invoiceId')::uuid;
    if not found then raise exception 'Linked invoice is missing. Restore it from a backup.'; end if;
    return d;
  end if;
  if (q->>'version')::integer is distinct from expected_version then raise exception 'This quote changed. Reload it before accepting.'; end if;
  if q->>'status'<>'Issued' then raise exception 'Issue the quote before accepting it'; end if;
  perform public.ha_validate(q,true);
  if invoice_id is null or invoice_date is null then raise exception 'Invalid invoice details'; end if;
  if exists(select 1 from public.ha_documents where owner_id=uid and id=invoice_id) then raise exception 'Invoice ID already exists'; end if;
  if jsonb_typeof(attachment_ids) is distinct from 'array' or jsonb_array_length(attachment_ids)<>jsonb_array_length(q->'attachments') then raise exception 'Invalid attachment copies'; end if;
  for a in select value from jsonb_array_elements(q->'attachments') loop
    if coalesce((a->>'missing')::boolean,false) then raise exception 'Re-upload missing attachments before accepting'; end if;
    if not exists(select 1 from public.ha_files where owner_id=uid and document_id=quote_id and id=(a->>'id')::uuid) then raise exception 'Missing quote attachment'; end if;
    if attachment_ids->>i is null then raise exception 'Invalid attachment copy'; end if;
    copied:=copied||jsonb_build_array(a||jsonb_build_object('id',attachment_ids->>i));
    i:=i+1;
  end loop;
  d := (q - array['validUntil','quoteTerms','acceptedAt','invoiceId','invoiceNumber','voidReason','paymentMethod','paymentReference']) ||
    jsonb_build_object('id',invoice_id,'type','Invoice','date',invoice_date::text,'dueDate','',
      'sourceQuoteId',quote_id,'sourceQuoteNumber',q->>'number');
  d:=public.ha_create(d);
  d:=d||jsonb_build_object('attachments',copied);
  d:=public.ha_save_base(d,'issue',jsonb_build_object('sourceQuoteNumber',q->>'number'));
  accepted:=q||jsonb_build_object('acceptedAt',stamp,'invoiceId',invoice_id,'invoiceNumber',d->>'number',
    'version',expected_version+1,'updatedAt',stamp,
    'history',(q->'history')||jsonb_build_array(jsonb_build_object('at',stamp,'action','Accepted; created invoice '||(d->>'number'),'version',expected_version+1)));
  insert into public.ha_revisions values(uid,quote_id,expected_version,q);
  update public.ha_documents set document=accepted,version=expected_version+1,updated_at=now() where owner_id=uid and id=quote_id;
  return d;
end $$;
revoke all on function public.ha_accept_quote(uuid,integer,uuid,jsonb,date) from public,anon;
grant execute on function public.ha_accept_quote(uuid,integer,uuid,jsonb,date) to authenticated;
