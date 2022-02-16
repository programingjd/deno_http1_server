import {listen} from './mod.js';
const abortController=new AbortController();
const hostname='127.0.0.1';
const port=8080;
const signal=abortController.signal;
const serve=await listen({hostname,port,signal});
onmessage=function(msg){
  console.log('message');
  if(msg.abort) abortController.abort();
};
await serve();
postMessage({terminate:'terminate'});
