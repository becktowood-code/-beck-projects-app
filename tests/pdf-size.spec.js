import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import fs from 'node:fs/promises';

test('photo PDFs retain exact JPEG bytes and share resources across attached PDF pages', async ({page}) => {
 await page.goto('http://127.0.0.1:5174');
 const jpeg = await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=1100;c.height=800;
   const ctx=c.getContext('2d');const pixels=ctx.createImageData(c.width,c.height);
   let seed=42;
   for(let i=0;i<pixels.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const n=seed>>>24;pixels.data[i]=n;pixels.data[i+1]=(n+80)%256;pixels.data[i+2]=(n+160)%256;pixels.data[i+3]=255;}
   ctx.putImageData(pixels,0,0);ctx.fillStyle='white';ctx.fillRect(20,20,700,75);ctx.fillStyle='black';ctx.font='32px Arial';ctx.fillText('Electrical rough-in / readable label',30,70);
   const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 const source=await PDFDocument.create();const shared=await source.embedJpg(Uint8Array.from(jpeg));
 for(let i=0;i<3;i++){const p=source.addPage();p.drawImage(shared,{x:40,y:100,width:400,height:300});p.drawText('Receipt page '+(i+1));}
 const sourceBytes=Array.from(await source.save());
 const result=await page.evaluate(async({jpeg,sourceBytes})=>{
   const {blankDocument}=await import('/src/domain/invoice.js');
   const {createInvoicePdf}=await import('/src/services/pdf.js');
   const doc=blankDocument('HA-SIZE');doc.customerName='Size and quality check';
   doc.attachments=[{id:'photo',name:'photo.jpg',type:'image/jpeg',category:'Photo',showOnInvoice:true},{id:'pdf',name:'receipt.pdf',type:'application/pdf',category:'Receipt / material list',showOnInvoice:true}];
   const repo={attachment:async(id)=>({blob:new Blob([Uint8Array.from(id==='photo'?jpeg:sourceBytes)],{type:id==='photo'?'image/jpeg':'application/pdf'})})};
   return Array.from(new Uint8Array(await (await createInvoicePdf(doc,repo)).arrayBuffer()));
 },{jpeg,sourceBytes});
 const bytes=Uint8Array.from(result);await fs.writeFile('artifacts/optimized-size-test.pdf',bytes);
 const pdf=await PDFDocument.load(bytes);
 const jpgs=pdf.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o instanceof PDFRawStream && o.dict.get(PDFName.of('Filter'))?.toString()==='/DCTDecode');
 // One standalone image plus one shared by all three receipt pages.
 expect(jpgs).toHaveLength(2);
 for(const jpg of jpgs)expect(Buffer.from(jpg.getContents())).toEqual(Buffer.from(jpeg));
 expect(pdf.getPageCount()).toBe(5);
 expect(bytes.length).toBeLessThan(jpeg.length*2+500000);
});
