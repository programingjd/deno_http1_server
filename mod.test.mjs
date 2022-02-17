
import {listen} from './mod.js';
import {assertEquals,assert} from 'https://deno.land/std/testing/asserts.ts'

await Deno.test({
  name: 'server',
  fn: async(t)=>{
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module',deno:true});
    await Promise.all([
      t.step({
        name:'404 on localhost',
        fn:async _=>{
          const response=await fetch('http://localhost:8080');
          assertEquals(response.status,404);
          assertEquals(await response.text(),'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'404 on test.local',
        fn:async _=>{
          const response=await fetch('http://test.local:8080');
          assertEquals(response.status,404);
          assertEquals(await response.text(),'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'308 on test.local/example',
        fn:async _=>{
          const response=await fetch('http://test.local:8080/example',{redirect:'manual'});
          assertEquals(response.status,308);
          assertEquals(response.headers.get('location'),'http://www.test.local:8080/example');
          assertEquals(await response.text(),'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'308 on www.test.local/example',
        fn:async _=>{
          const response=await fetch('http://www.test.local:8080/example',{redirect:'manual'});
          assertEquals(response.status,308);
          assertEquals(response.headers.get('location'),'/example/');
          assertEquals(await response.text(),'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'200 on www.test.local/example/',
        fn:async _=>{
          const response=await fetch('http://www.test.local:8080/example/',{redirect:'manual'});
          assertEquals(response.status,200);
          assertEquals(response.headers.get('content-type'),'text/html; charset=utf-8');
          assertEquals(response.headers.get('cache-control'),'public,no-cache');
          assert(response.headers.get('etag'));
          const text=await response.text();
          assert(text.trim().endsWith('</html>'));
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
    ]);
    await t.step({
      name:'stop server',
      fn:async()=>{
        worker.postMessage({abort:'abort'});
        worker.terminate();
      },
      sanitizeOps:false,
      sanitizeResources:false,
      sanitizeExit:false
    });
  }
});
