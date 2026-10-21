const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const file=path.join(__dirname,'../index.html');let html=fs.readFileSync(file,'utf8');
const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob: "+hashes.join(' ')+"; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://obzycbtfbadjwwwfpsed.supabase.co https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'";
const meta='<meta http-equiv="Content-Security-Policy" content="'+policy+'">';
html=html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/g,'');
html=html.replace(/\s*<meta charset="[^"]+"[^>]*>/i,'');
html=html.replace('<head>','<head>\n  <meta charset="UTF-8">\n  '+meta);fs.writeFileSync(file,html);console.log('CSP updated for '+hashes.length+' inline scripts; inline event execution disabled.');
