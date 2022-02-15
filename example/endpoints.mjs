/**
 * @type {[Endpoint<*>]}
 */
const endpoints=[
  /** @type {Endpoint<{Request,URL}>} */
  {
    accept:(request, url)=>{
      if(url.pathname!=='/example/endpoint') return null;
      return {request,url};
    },
    handle:({request,url},headers)=>{
      if(url.hostname!=='www.test.local'){
        return new Response(
          null,
          {
            status:301,
            headers:{
              location:'http://www.test.local/example/endpoint',
              'access-control-allow-origin': request.headers.get('origin')
            }
          }
        );
      }
      return new Response(
        null, //new TextEncoder().encode('Test endpoint response body.'),
        {
          status: 200,
          headers: new Headers([
            ...Object.entries(headers),
            [ 'x-test', 'true' ],
            [ 'access-control-allow-origin', request.headers.get('origin') ],
            [ 'cache-control', 'no-store' ]
          ])
        }
      );
    }
  },
  /** @type {Endpoint<Request>} */
  {
    accept:(request, url)=>{
      if(url.pathname!=='/push_webhook') return null;
      return {request};
    },
    handle:async({request})=>{
      const signatureHeaderValue=request.headers.get('x-hub-signature-256');
      if(!signatureHeaderValue){
        return { headers: new Headers({'cache-control':'no-cache'}), status:403 };
      }
      const body=await request.arrayBuffer();
      const secret=new TextEncoder().encode(Deno.env.get('github_webhook_secret'));
      const key=await crypto.subtle.importKey(
        'raw',
        secret,
        {name:'HMAC',hash:'SHA-256'},
        true,
        ['sign','verify']
      );
      const signature=[...new Uint8Array(
        await crypto.subtle.sign('HMAC',key,body.buffer)
      )].map(it=>it.toString(16).padStart(2,'0')).join('');
      if(`sha256=${signature}`!==signatureHeaderValue){
        return { headers: new Headers({'cache-control':'no-cache'}), status:400 };
      }
      const json=new TextDecoder().decode(body.buffer);
      if(json.ref==='refs/heads/main'){
        const response=await fetch('http://localhost/update');
        await response.arrayBuffer();
        return { headers: new Headers({'cache-control':'no-cache'}), status: response.status };
      }
      return { headers: new Headers({'cache-control':'no-cache'}), status: 200 };
    }
  }
]

export default endpoints;
