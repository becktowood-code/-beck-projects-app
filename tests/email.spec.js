import { test, expect } from '@playwright/test';

test('issued invoice email is editable, addresses selected contractor and follows saved changes',async({page})=>{
 await page.goto('http://127.0.0.1:5174');
 await page.getByRole('button',{name:'+ New invoice',exact:true}).click();
 await expect(page.getByRole('button',{name:'Draft email',exact:true})).toHaveCount(0);
 await page.getByLabel('Customer name',{exact:true}).fill('Client');
 await page.getByLabel('Customer email',{exact:true}).fill('client@example.com');
 await page.getByLabel('Contractor name',{exact:true}).fill('Contractor');
 await page.getByLabel('Contractor email',{exact:true}).fill('contractor@example.com');
 await page.getByLabel('Bill to',{exact:true}).selectOption('contractor');
 await page.getByLabel('Invoice name').fill('Panel replacement');
 await page.getByRole('button',{name:'Generate / issue invoice',exact:true}).click();
 await expect(page.locator('.paper')).toContainText('Panel replacement');
 await page.getByRole('button',{name:'Draft email',exact:true}).click();
 await expect(page.getByLabel('Email recipient',{exact:true})).toHaveValue('contractor@example.com');
 await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue('Invoice HA-0001 — Panel replacement');
 await expect(page.getByLabel('Email message',{exact:true})).toContainText('Balance due: $150.00');
 await expect(page.getByLabel('Email message',{exact:true})).toContainText('Thank you,\nJoao Beck\nHigh-Amps Electrical Services');
 await page.getByLabel('Email message',{exact:true}).fill('Hi Contractor,\nPlease find attached the invoice.');
 const link=page.getByRole('link',{name:'Open in email app'});
 const uri=new URL(await link.getAttribute('href'));
 expect(decodeURIComponent(uri.pathname)).toBe('contractor@example.com');
 expect(uri.searchParams.get('body')).toBe('Hi Contractor,\r\nPlease find attached the invoice.');
 await expect(page.getByText('The PDF is not attached automatically.',{exact:false})).toBeVisible();
 // Inspect the mailto destination without launching a real email client.
 await page.getByLabel('Labor 1 Hours').fill('2');
 await expect(page.getByRole('button',{name:'Draft email',exact:true})).toBeDisabled();
 await expect(link).toHaveCount(0);
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Draft email',exact:true}).click();
 await expect(page.getByLabel('Email message',{exact:true})).toContainText('Balance due: $300.00');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('region',{name:'Invoice email'}).screenshot({path:'artifacts/email-draft-mobile.png'});
});
