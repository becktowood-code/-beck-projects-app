import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDocument } from '../src/domain/invoice.js';
import { invoiceEmail, emailLink } from '../src/domain/email.js';

test('email uses selected recipient, actual balance and saved company details', () => {
 const doc={...blankDocument('HA-EMAIL'),recipient:'contractor',contractorName:'Jane & Co',contractorEmail:'jane+invoice@example.com',customerEmail:'other@example.com',projectTitle:'Panel & lighting',dueDate:'2026-10-01',payments:[{amount:50}]};
 const draft=invoiceEmail(doc);
 assert.equal(draft.to,'jane+invoice@example.com');
 assert.match(draft.body,/Hi Jane & Co,/);assert.match(draft.body,/Invoice total: \$150.00/);assert.match(draft.body,/Balance due: \$100.00/);assert.match(draft.body,/Due date: 2026-10-01/);
 const link=emailLink(draft);const parsed=new URL(link);
 assert.equal(decodeURIComponent(parsed.pathname),draft.to);assert.equal(parsed.searchParams.get('subject'),draft.subject);assert.equal(parsed.searchParams.get('body').replaceAll('\r\n','\n'),draft.body);
});
test('quotes and paid invoices do not request payment; missing email stays blank',()=>{
 const d=blankDocument('HA-EMAIL');assert.equal(invoiceEmail(d).to,'');
 assert.doesNotMatch(invoiceEmail({...d,status:'Paid'}).body,/Balance due|Payment terms/);
 assert.match(invoiceEmail({...d,status:'Paid'}).body,/Payment received/);
 assert.match(invoiceEmail({...d,type:'Quote'}).body,/Quote total/);
 assert.doesNotMatch(invoiceEmail({...d,type:'Quote'}).body,/Balance due|Payment instructions/);
});
test('email URI keeps reserved characters and newlines out of headers',()=>{
 const link=emailLink({to:'client@example.com\r\n',subject:'Invoice\r\nBcc: other & #?',body:'A & B\nThanks'});
 const u=new URL(link);assert.equal(u.searchParams.size,2);assert.equal(u.searchParams.get('body'),'A & B\r\nThanks');assert.doesNotMatch(u.searchParams.get('subject'),/[\r\n]/);
});
