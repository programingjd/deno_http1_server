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
  }
]

export default endpoints;
