// Local UI review using fictional fixtures and in-memory changes. No installed profile access.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { response, dashboard } from '../tests/fixtures/documentation.mjs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
let cards=structuredClone(dashboard.cards);
const demo={
  name:'wakeline-local-review',
  transformIndexHtml(html){
    const setup=`localStorage.setItem('wakeline-release-shown',${JSON.stringify(version)});localStorage.setItem('wakeline-daily-summary-enabled','false');localStorage.setItem('wakeline-lang','es');if(!localStorage.getItem('wakeline-chat:overview:'))localStorage.setItem('wakeline-chat:overview:',JSON.stringify([{id:1,role:'user',text:'¿Puedes revisar los cambios de esta semana?'},{id:2,role:'assistant',model:'claude-sonnet-5-5',text:'## Revisión de ejemplo\\n\\nEl cambio principal añade protección frente a eventos repetidos.\\n\\n- El estado de las tarjetas se conserva durante el escaneo.\\n- Puedes ampliar este chat arrastrando el borde izquierdo.\\n- Adjunta una imagen y haz clic para verla en grande.'}]));`;
    return html.replace('<head>',`<head><script>${setup}</script>`).replace('</body>','<div style="position:fixed;bottom:8px;left:12px;z-index:9999;padding:6px 10px;border-radius:6px;background:#262626;color:#ccc;font:11px system-ui;pointer-events:none">Vista local · datos de ejemplo</div></body>');
  },
  configureServer(server){server.middlewares.use('/__wakeline/read',async(req,res)=>{
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>15*1024*1024){res.statusCode=413;res.end();return;}}
    try{
      const {command,args}=JSON.parse(raw);let data=response(command);
      if(command==='get_dashboard_data')data={...dashboard,cards};
      if(command==='set_cards_status'){
        for(const input of args.inputs)cards=cards.map(card=>card.fingerprint===input.fingerprint?{...card,status:input.status}:card);
        data=null;
      }
      if(command==='ask_pr_agent'||command==='ask_review_agent'){
        // Deliberately hold only the fictional preview request so thinking can be inspected.
        if(new URL(req.headers.referer || 'http://localhost').searchParams.get('thinking')==='1')return;
        await new Promise(resolve=>setTimeout(resolve,800));
        if(command==='ask_pr_agent')data=readFileSync(new URL('../tests/fixtures/pr-review.es.md',import.meta.url),'utf8');
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error)}));}
  });},
};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[demo,react()],resolve:{alias:{src:path.resolve('src')}},server:{host:'127.0.0.1',port:3041,strictPort:true}});
await server.listen();server.printUrls();
