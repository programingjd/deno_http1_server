import {listen} from '../mod.js';

let host='0.0.0.0';
let port=8080;
console.info('Press Ctrl-C to stop the server.');
const serve=await listen({
  hostname:host||'0.0.0.0',port:port||8080
});
await serve();
