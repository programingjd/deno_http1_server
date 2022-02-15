import {serve} from 'https://raw.githubusercontent.com/programingjd/deno_http1_server/main/mod.js';

let host=null;
let port=null;
for(const arg of Deno.args){
  const match=/^([0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3})(?:[:]([0-9]+))?$/.exec(arg);
  if(match){
    host=match[1];
    const p=parseInt(match[2]);
    if(!isNaN(p)){
      if(port&&port!==p) throw new Error('Port is defined several times with conflicting values.');
      port=p;
    }
  }else if(/^[0-9]+$/.test(arg)){
    port=parseInt(arg);
  }
}

const controller=new AbortController();
// Deno.addSignalListener('SIGINT',_=>{
//   controller.abort();
// });
// console.info('Press Ctrl-C to stop the server.');
await serve({hostname:host||'0.0.0.0',port:port||80,transport:'tcp',signal:controller.signal});
