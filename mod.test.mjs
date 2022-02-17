// You need to add
// 127.0.0.1 test.local www.test.local
// to your hosts file for the tests to run, as those two domains need to resolve to the
// local machine where the server runs.

import {assertEquals,assert} from 'https://deno.land/std/testing/asserts.ts'

await Deno.test({
  name: 'server',
  fn: async(t)=>{
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module',deno:true});
    try{
      await Deno.remove('./example/test.txt');
    }catch(_){}
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
          const response=await fetch('http://www.test.local:8080/example/');
          assertEquals(response.status,200);
          assertEquals(response.headers.get('content-type'),'text/html; charset=utf-8');
          assertEquals(response.headers.get('cache-control'),'public,no-cache');
          assert(response.headers.get('etag'));
          assertEquals(response.headers.get('strict-transport-security'),'max-age=86400');
          assertEquals(response.headers.get('vary'),'Accept-Encoding');
          assertEquals(response.headers.get('x-content-type-options'),'nosniff');
          assertEquals(response.headers.get('x-test'),'test');
          const text=await response.text();
          assert(text.trim().endsWith('</html>'));
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'304 on www.test.local/example/ with if-none-match',
        fn:async _=>{
          const headResponse=await fetch(
            'http://www.test.local:8080/example/', {method: 'head', cache: 'no-store'}
          );
          assertEquals(headResponse.status,200);
          const etag=headResponse.headers.get('etag');
          const response=await fetch(
            'http://www.test.local:8080/example/',
            {
              headers: {
                'if-none-match': etag
              }
            }
          );
          assertEquals(response.status,304);
          assertEquals(response.headers.get('etag'),etag);
          const text=await response.text();
          assertEquals(text,'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'200 on www.test.local/example/deno.svg',
        fn:async _=>{
          const response=await fetch('http://www.test.local:8080/example/deno.svg');
          assertEquals(response.status,200);
          assertEquals(response.headers.get('content-type'),'image/svg+xml');
          assertEquals(response.headers.get('cache-control'),'public,immutable');
          assert(response.headers.get('etag'));
          assertEquals(response.headers.get('strict-transport-security'),'max-age=86400');
          assertEquals(response.headers.get('vary'),'Accept-Encoding');
          assertEquals(response.headers.get('x-content-type-options'),'nosniff');
          const text=await response.text();
          assert(text.trim().endsWith('</svg>'));
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'404 on www.test.local/example/test.txt',
        fn:async _=>{
          const response=await fetch('http://www.test.local:8080/example/test.txt');
          assertEquals(response.status,404);
          const text=await response.text();
          assertEquals(text,'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
      t.step({
        name:'200 on www.test.local/example/endpoint',
        fn:async _=>{
          const response=await fetch('http://www.test.local:8080/example/endpoint');
          assertEquals(response.status,200);
          assertEquals(response.headers.get('content-type'),'text/plain');
          assertEquals(response.headers.get('cache-control'),'no-store');
          assert(response.headers.get('access-control-allow-origin'));
          assertEquals(response.headers.get('strict-transport-security'),'max-age=86400');
          assertEquals(response.headers.get('vary'),'Accept-Encoding');
          assertEquals(response.headers.get('x-content-type-options'),'nosniff');
          assertEquals(response.headers.get('x-test'),'true');
          const text=await response.text();
          assertEquals(text,'');
        },
        sanitizeOps:false,
        sanitizeResources:false,
        sanitizeExit:false
      }),
    ]);
    await Deno.writeTextFile('./example/test.txt','test data');
    await t.step({
      name: 'update',
      fn:async _=>{
        const response=await fetch('http://localhost:8080/update/example');
        assertEquals(response.status,200);
        const text=await response.text();
        assertEquals(text,'');
      },
      sanitizeOps:false,
      sanitizeResources:false,
      sanitizeExit:false
    });
    await t.step({
      name:'200 on www.test.local/example/test.txt',
      fn:async _=>{
        const response=await fetch('http://www.test.local:8080/example/test.txt');
        assertEquals(response.status,200);
        assertEquals(response.headers.get('content-type'),'text/plain');
        assertEquals(response.headers.get('cache-control'),'public,no-cache');
        assert(response.headers.get('etag'));
        assertEquals(response.headers.get('strict-transport-security'),'max-age=86400');
        assertEquals(response.headers.get('vary'),'Accept-Encoding');
        assertEquals(response.headers.get('x-content-type-options'),'nosniff');
        const text=await response.text();
        assertEquals(text,'test data');
      },
      sanitizeOps:false,
      sanitizeResources:false,
      sanitizeExit:false
    });
    await Deno.remove('./example/test.txt');
    await t.step({
      name: 'update all',
      fn:async _=>{
        const response=await fetch('http://localhost:8080/update');
        assertEquals(response.status,200);
        const text=await response.text();
        assertEquals(text,'');
      },
      sanitizeOps:false,
      sanitizeResources:false,
      sanitizeExit:false
    });
    await t.step({
      name:'404 on www.test.local/example/test.txt',
      fn:async _=>{
        const response=await fetch('http://www.test.local:8080/example/test.txt');
        assertEquals(response.status,404);
        const text=await response.text();
        assertEquals(text,'');
      },
      sanitizeOps:false,
      sanitizeResources:false,
      sanitizeExit:false
    });
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
