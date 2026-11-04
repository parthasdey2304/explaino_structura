import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
const route=process.argv[2]||'/'; const label=process.argv[3]||'canvas'; const mode=process.argv[4]||'mobile';
if(!['mobile','desktop'].includes(mode))throw Error('Choose mobile or desktop');
if(!process.env.EXPLAINO_ADMIN_PASSWORD)throw Error('Set EXPLAINO_ADMIN_PASSWORD before auditing the authenticated canvas.');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:3000';
const output=process.env.AUDIT_OUTPUT_DIR||path.join(os.tmpdir(),'explaino-performance');await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'explaino-audit-'));
const context=await chromium.launchPersistentContext(profile,{headless:true,args:['--remote-debugging-port=9226']});
try{
 const login=await context.request.post(base+'/api/auth/login',{data:{email:process.env.EXPLAINO_ADMIN_EMAIL||'parthasdeyofficial@gmail.com',password:process.env.EXPLAINO_ADMIN_PASSWORD}});if(!login.ok())throw Error('Audit login failed: '+login.status());
 const result=await lighthouse(new URL(route,base).href,{port:9226,logLevel:'error',output:'json',onlyCategories:['performance'],disableStorageReset:true},mode==='desktop'?desktopConfig:undefined);
 const requests=result.lhr.audits['network-requests']?.details?.items||[];if(!requests.some(item=>item.url.includes('/api/canvases')))throw Error('Audit did not reach a canvas API; refusing to report the login screen as the app.');
 const reportPath=path.join(output,label.replace(/[^a-z0-9_-]/gi,'-')+'-'+mode+'.json');await fs.writeFile(reportPath,JSON.stringify(result.lhr,null,2));const a=result.lhr.audits;
 console.log(JSON.stringify({mode,route,score:Math.round(result.lhr.categories.performance.score*100),fcp:a['first-contentful-paint'].displayValue,lcp:a['largest-contentful-paint'].displayValue,tbt:a['total-blocking-time'].displayValue,cls:a['cumulative-layout-shift'].displayValue,speedIndex:a['speed-index'].displayValue,reportPath}));
 console.log('Main thread:',a['mainthread-work-breakdown']?.details?.items);console.log('Script startup:',a['bootup-time']?.details?.items?.slice(0,8));
}finally{await context.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});}
