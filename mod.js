import {magenta,yellow,bold} from 'https://deno.land/std/fmt/colors.ts';

/** @type {Set<DomainName>} */
const localDomains=new Set([
  'localhost',
  '127.0.0.1',
  '::1'
]);

/**
 * @param {ServerOptions} options
 * @return {string}
 */
const address=(options)=>{
  if(options.transport==='unix'){
    // noinspection JSUnresolvedVariable
    return `${options.path}`;
  }
  let host=options.hostname||'0.0.0.0';
  if(host==='0.0.0.0') host='localhost';
  let port=options.port||80;
  if(port===80) return host;
  return `${host}:${port}`;
};

/**
 * @param {Deno.RequestEvent} requestEvent
 * @param {URL} url
 * @param {[Endpoint<*>]} endpoints
 * @return {Promise<void>}
 */
const handle=async(requestEvent,url,endpoints)=>{
  for(const endpoint of endpoints){
    try{
      const accepted=await endpoint.accept(requestEvent.request,url);
      if(accepted!==null){
        try{
          return requestEvent.respondWith(await endpoint.handle(accepted));
        }catch(err){
          console.warn(err);
          return requestEvent.respondWith(new Response(null,{status:500}));
        }
      }
    }catch(err){
      console.warn(err);
    }
  }
  return requestEvent.respondWith(new Response(null,{status:404}));
}

/**
 * @param {ServerOptions} options
 * @return {Promise<void>}
 */
const serve=async(options)=>{
  const {signal=null}=options;

  /** @type {State} */
  let state={
    directories:new Set(),
    endpoints:new Map()
  };

  /**
   * @param {DirectoryName|undefined} [dir=undefined]
   * @return {Promise<void>}
   */
  const updateState=async(dir)=>{
    if(!dir){
      for await(const it of Deno.readDir('.')){
        if(it.isDirectory){
          try{
            if((await Deno.lstat(`./${it.name}/directory.json`)).isFile){
              await updateState(it.name);
            }
          }catch(_){}
        }
      }
      return;
    }
    console.log(bold(`${magenta('Directory')}: ${dir}`));
    const config = await import(`./${dir}/directory.json`,{assert:{type:'json'}});
    console.log(JSON.stringify(config));
  };

  /** @type {Endpoint<boolean>} */
  const updateAllEndpoint={
    accept: async(request, url)=>{
      if(request.method!=='GET') return null;
      if(url.pathname!=='/update') return null;
      return true;
    },
    handle: async(_)=>{
      await updateState();
      return new Response('Updated all');
    }
  };

  /** @type {Endpoint<DirectoryName>} */
  const updateDirectoryEndpoint={
    accept: async(request, url)=>{
      if(request.method!=='GET') return null;
      const match=/^[/]update[/]([^/]+)$/.exec(url.pathname);
      if(!match) return null;
      const dir=match[1];
      if(localDomains.has(dir)) return null;
      if(!state.directories.has(dir)) return null;
      return dir;
    },
    handle: async(accepted)=>{
      await updateState(accepted);
      return new Response(`Updated ${accepted}`);
    }
  };
  for(const domain of localDomains){
    state.endpoints.set(domain,[updateAllEndpoint,updateDirectoryEndpoint]);
  }
  await updateState();
  const server=Deno.listen(options);
  // noinspection HttpUrlsUsage
  console.log(bold(`Listening on http://${address(options)}.`));
  for await(const conn of server){
    if(signal?.aborted===true) break;
    try{
      for await(/** @type {Deno.RequestEvent} */const requestEvent of Deno.serveHttp(conn)){
        try{
          const url=new URL(requestEvent.request.url);
          const hostname=url.hostname;
          // noinspection ES6MissingAwait
          handle(requestEvent,url,state.endpoints.get(hostname));
        }catch(err){
          console.warn(err);
        }
      }
    }catch(err){
      console.warn(err);
    }
  }
  await Deno.shutdown(server.rid);
};

export {
  serve
}
