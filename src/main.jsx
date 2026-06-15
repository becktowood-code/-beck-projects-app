import React, {useMemo, useState, useEffect} from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Trash2, Save, Printer, FileText, Users, HardHat, Image as ImageIcon, Download } from 'lucide-react';
import './style.css';

const COMPANY = {
  name: 'Beck Projects LLC',
  tagline: 'Electrical & Construction Services',
  address: '18332 181st Cir S, Boca Raton, FL 33498',
  phone: '+1 (561) 579-2642',
  email: 'beckprojectsllc@outlook.com',
  hourlyRate: 150,
  taxRate: 0.07,
  terms: 'Due on receipt',
  invoicePrefix: 'BP'
};

const blankDoc = () => ({
  id: crypto.randomUUID(), type:'Quote', status:'Draft', number: nextNumber(), date: new Date().toISOString().slice(0,10), dueDate: new Date().toISOString().slice(0,10),
  customerName:'', customerPhone:'', customerEmail:'', billingAddress:'', jobAddress:'', contractorName:'', contractorPhone:'', contractorEmail:'',
  projectTitle:'', notes:'Thank you for choosing Beck Projects LLC.',
  labor:[{id:crypto.randomUUID(), description:'Electrical / construction labor', hours:1, rate:COMPANY.hourlyRate}],
  materials:[{id:crypto.randomUUID(), description:'Materials', qty:1, cost:0, markup:0}],
  fixedItems:[], photos:[], files:[], payments:[], applyTax:true
});
function nextNumber(){ const n = Number(localStorage.getItem('bp_counter')||'1'); localStorage.setItem('bp_counter', String(n+1)); return `${COMPANY.invoicePrefix}-${String(n).padStart(4,'0')}`; }
const money = n => (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD'});

function App(){
 const [docs,setDocs]=useLocal('bp_docs',[]); const [current,setCurrent]=useState(docs[0]||blankDoc());
 const [tab,setTab]=useState('document');
 useEffect(()=>{ if(!docs.length){ setDocs([current]); }},[]);
 const totals=useMemo(()=>calc(current),[current]);
 function update(p){setCurrent(c=>({...c,...p}));}
 function save(){ setDocs(ds=>{const i=ds.findIndex(d=>d.id===current.id); return i>=0? ds.map(d=>d.id===current.id?current:d):[current,...ds]}); alert('Saved on this device.'); }
 function newDoc(type='Quote'){ const d={...blankDoc(), type}; setCurrent(d); setDocs(ds=>[d,...ds]); setTab('document'); }
 function loadDoc(id){ const d=docs.find(x=>x.id===id); if(d){setCurrent(d); setTab('document');}}
 function removeDoc(id){ if(confirm('Delete this document?')){ const nd=docs.filter(d=>d.id!==id); setDocs(nd); setCurrent(nd[0]||blankDoc()); }}
 return <div className="app">
   <header className="top no-print"><Logo/><button onClick={()=>newDoc('Quote')}><Plus size={18}/> New Quote</button><button onClick={()=>newDoc('Invoice')}><Plus size={18}/> New Invoice</button></header>
   <nav className="tabs no-print"><button className={tab==='document'?'on':''} onClick={()=>setTab('document')}><FileText/> Document</button><button className={tab==='records'?'on':''} onClick={()=>setTab('records')}><Users/> Records</button><button className={tab==='report'?'on':''} onClick={()=>setTab('report')}><Download/> Tax Report</button></nav>
   {tab==='document' && <main className="grid"><section className="panel no-print"><Editor doc={current} update={update}/><LineEditor doc={current} update={update}/><Uploads doc={current} update={update}/><div className="actions"><button onClick={save}><Save size={18}/> Save</button><button onClick={()=>window.print()}><Printer size={18}/> Print / Save PDF</button></div></section><Preview doc={current} totals={totals}/></main>}
   {tab==='records' && <Records docs={docs} loadDoc={loadDoc} removeDoc={removeDoc}/>} 
   {tab==='report' && <Report docs={docs}/>} 
 </div>
}
function useLocal(k,init){ const [v,setV]=useState(()=>{try{return JSON.parse(localStorage.getItem(k))??init}catch{return init}}); useEffect(()=>localStorage.setItem(k,JSON.stringify(v)),[v]); return [v,setV];}
function calc(d){ const labor=d.labor.reduce((s,x)=>s+(+x.hours||0)*(+x.rate||0),0); const mat=d.materials.reduce((s,x)=>s+(+x.qty||0)*(+x.cost||0)*(1+(+x.markup||0)/100),0); const fixed=(d.fixedItems||[]).reduce((s,x)=>s+(+x.amount||0),0); const subtotal=labor+mat+fixed; const tax=d.applyTax?subtotal*COMPANY.taxRate:0; const paid=(d.payments||[]).reduce((s,x)=>s+(+x.amount||0),0); return {labor,mat,fixed,subtotal,tax,total:subtotal+tax,paid,balance:subtotal+tax-paid};}
function Logo(){return <div className="logo"><div className="mark">⌂⚡</div><div><b>{COMPANY.name}</b><span>{COMPANY.tagline}</span></div></div>}
function Field({label,value,onChange,type='text'}){return <label>{label}<input type={type} value={value||''} onChange={e=>onChange(e.target.value)}/></label>}
function Editor({doc,update}){return <><h2>Document details</h2><div className="two"><label>Type<select value={doc.type} onChange={e=>update({type:e.target.value})}><option>Quote</option><option>Invoice</option></select></label><Field label="Number" value={doc.number} onChange={v=>update({number:v})}/><Field label="Date" type="date" value={doc.date} onChange={v=>update({date:v})}/><Field label="Status" value={doc.status} onChange={v=>update({status:v})}/></div><h2>Customer</h2><div className="two"><Field label="Customer name" value={doc.customerName} onChange={v=>update({customerName:v})}/><Field label="Phone" value={doc.customerPhone} onChange={v=>update({customerPhone:v})}/><Field label="Email" value={doc.customerEmail} onChange={v=>update({customerEmail:v})}/><Field label="Job address" value={doc.jobAddress} onChange={v=>update({jobAddress:v})}/></div><h2>Contractor / Subcontractor</h2><div className="two"><Field label="Name" value={doc.contractorName} onChange={v=>update({contractorName:v})}/><Field label="Phone" value={doc.contractorPhone} onChange={v=>update({contractorPhone:v})}/></div><Field label="Project title" value={doc.projectTitle} onChange={v=>update({projectTitle:v})}/><label>Notes<textarea value={doc.notes||''} onChange={e=>update({notes:e.target.value})}/></label><label className="check"><input type="checkbox" checked={doc.applyTax} onChange={e=>update({applyTax:e.target.checked})}/> Apply 7% tax</label></>}
function LineEditor({doc,update}){ const set=(key,arr)=>update({[key]:arr}); const row=(key,obj)=>set(key,[...(doc[key]||[]),{id:crypto.randomUUID(),...obj}]); const del=(key,id)=>set(key,doc[key].filter(x=>x.id!==id)); const edit=(key,id,p)=>set(key,doc[key].map(x=>x.id===id?{...x,...p}:x)); return <><h2>Labor</h2>{doc.labor.map(x=><div className="line" key={x.id}><input value={x.description} onChange={e=>edit('labor',x.id,{description:e.target.value})}/><input type="number" value={x.hours} onChange={e=>edit('labor',x.id,{hours:e.target.value})}/><input type="number" value={x.rate} onChange={e=>edit('labor',x.id,{rate:e.target.value})}/><button onClick={()=>del('labor',x.id)}><Trash2 size={16}/></button></div>)}<button onClick={()=>row('labor',{description:'Labor',hours:1,rate:COMPANY.hourlyRate})}>Add labor</button><h2>Materials</h2>{doc.materials.map(x=><div className="line" key={x.id}><input value={x.description} onChange={e=>edit('materials',x.id,{description:e.target.value})}/><input type="number" value={x.qty} onChange={e=>edit('materials',x.id,{qty:e.target.value})}/><input type="number" value={x.cost} onChange={e=>edit('materials',x.id,{cost:e.target.value})}/><button onClick={()=>del('materials',x.id)}><Trash2 size={16}/></button></div>)}<button onClick={()=>row('materials',{description:'Materials',qty:1,cost:0,markup:0})}>Add material</button><h2>Fixed job costs</h2>{(doc.fixedItems||[]).map(x=><div className="line" key={x.id}><input value={x.description} onChange={e=>edit('fixedItems',x.id,{description:e.target.value})}/><input type="number" value={x.amount} onChange={e=>edit('fixedItems',x.id,{amount:e.target.value})}/><button onClick={()=>del('fixedItems',x.id)}><Trash2 size={16}/></button></div>)}<button onClick={()=>row('fixedItems',{description:'Fixed job total',amount:0})}>Add fixed cost</button></>}
function Uploads({doc,update}){ async function add(e,type){ const files=[...e.target.files]; const items=await Promise.all(files.map(f=>new Promise(res=>{const r=new FileReader(); r.onload=()=>res({id:crypto.randomUUID(),name:f.name,type:f.type,data:r.result}); r.readAsDataURL(f)}))); update({[type]:[...(doc[type]||[]),...items]}); } return <><h2>Job photos</h2><input type="file" accept="image/*" multiple onChange={e=>add(e,'photos')}/><h2>Material quotes / receipts</h2><input type="file" multiple onChange={e=>add(e,'files')}/></>}
function Preview({doc,totals}){return <section className="preview"><div className="paper"><div className="phead"><Logo/><div><h1>{doc.type}</h1><p>{doc.number}<br/>{doc.date}<br/>{COMPANY.terms}</p></div></div><p>{COMPANY.address}<br/>{COMPANY.phone} • {COMPANY.email}</p><hr/><b>Bill To</b><p>{doc.customerName}<br/>{doc.customerPhone}<br/>{doc.customerEmail}<br/>{doc.jobAddress}</p>{doc.contractorName&&<p><b>Contractor/Subcontractor:</b> {doc.contractorName} {doc.contractorPhone}</p>}<h2>{doc.projectTitle}</h2><Table title="Labor" rows={doc.labor} kind="labor"/><Table title="Materials" rows={doc.materials} kind="materials"/><Table title="Fixed Costs" rows={doc.fixedItems||[]} kind="fixed"/><div className="totals"><p>Subtotal <b>{money(totals.subtotal)}</b></p><p>Tax 7% <b>{money(totals.tax)}</b></p><p className="grand">Total <b>{money(totals.total)}</b></p><p>Paid <b>{money(totals.paid)}</b></p><p>Balance Due <b>{money(totals.balance)}</b></p></div><p><b>Payment:</b> Bank transfer. Routing 065000090. Account 5734331434.</p><p>{doc.notes}</p>{doc.photos?.length>0&&<><h2>Job Photos</h2><div className="photos">{doc.photos.map(p=><img key={p.id} src={p.data}/>)}</div></>}</div></section>}
function Table({title,rows,kind}){ if(!rows?.length)return null; return <><h3>{title}</h3><table><tbody>{rows.map(r=><tr key={r.id}><td>{r.description}</td><td>{kind==='labor'?`${r.hours} hrs × ${money(r.rate)}`:kind==='materials'?`${r.qty} × ${money(r.cost)}`:''}</td><td>{money(kind==='labor'?r.hours*r.rate:kind==='materials'?r.qty*r.cost:r.amount)}</td></tr>)}</tbody></table></>}
function Records({docs,loadDoc,removeDoc}){return <main className="panel wide"><h2>Saved Quotes & Invoices</h2>{docs.map(d=><div className="record" key={d.id}><div><b>{d.number}</b> {d.type}<br/><span>{d.customerName||'No customer'} — {d.projectTitle}</span></div><button onClick={()=>loadDoc(d.id)}>Open</button><button onClick={()=>removeDoc(d.id)}>Delete</button></div>)}</main>}
function Report({docs}){ const inv=docs.filter(d=>d.type==='Invoice'); const sums=inv.reduce((a,d)=>{const t=calc(d); a.total+=t.total; a.tax+=t.tax; a.balance+=t.balance; return a},{total:0,tax:0,balance:0}); return <main className="panel wide"><h2>Tax Report</h2><p>Total invoiced: <b>{money(sums.total)}</b></p><p>Sales tax collected/owed: <b>{money(sums.tax)}</b></p><p>Unpaid balance: <b>{money(sums.balance)}</b></p><p>Data is stored in this browser. Export/backup features can be added in the next version.</p></main>}

createRoot(document.getElementById('root')).render(<App/>);
