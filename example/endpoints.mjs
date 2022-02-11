/**
 * @type {[Endpoint<*>]}
 */
const endpoints=[
  /** @type {Endpoint<boolean>} */
  {
    accept:(request, url)=>{
      if(url.pathname!=='/test') return null;
      return url.hostname!=='www.test.local';
    },
    handle:(redir)=>{
      if(redir) return new Response(
        null,
        {
          status: 301,
          headers: {
            location:'http://www.test.local/test'
          }
        }
      );
      return new Response(
        null, //new TextEncoder().encode('Test endpoint response body.'),
        {
          status: 200,
          headers: {
            'x-test': 'true'
          }
        }
      );
    }
  }
]

export default endpoints;
