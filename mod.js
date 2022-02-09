import {magenta,yellow,bold} from 'https://deno.land/std/fmt/colors.ts';
import Ajv from 'https://esm.sh/ajv?bundle';

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
 * @param {?[Endpoint<*>]} endpoints
 * @return {Promise<void>}
 */
const handle=async(requestEvent,url,endpoints)=>{
  if(endpoints){
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
  }
  return requestEvent.respondWith(new Response(null,{status:404}));
}

/**
 * @param {ServerOptions} options
 * @return {Promise<void>}
 */
const serve=async(options)=>{
  const {signal=null}=options;

  let headers=new Headers((await import('./headers.json',{assert:{type:'json'}})).default);

  /** @type {State} */
  let state=new Map();

  /** @type {ValidateFunction<MimeTypes>} */
  const validateMimeTypes=await(async()=>{
    const validate=new Ajv().compile(
      (await import('./MimeTypes.schema.json',{assert:{type:'json'}})).default
    );
    return (data)=>{
      if(!validate(data)) throw new Error(validate.errors.join('\n'));
      return data;
    };
  })();
  let mimes=validateMimeTypes(await import('./mimes.json',{assert:{type:'json'}}).default);

  /** @type {ValidateFunction<DirectoryConfig>} */
  const validateDirectoryConfig=await(async()=>{
    const validate=new Ajv().compile(
      (await import('./DirectoryConfig.schema.json',{assert:{type:'json'}})).default
    );
    return (data)=>{
      if(!validate(data)) throw new Error(validate.errors.join('\n'));
      return data;
    };
  })();

  /**
   * @param {DirectoryName} dir
   * @return {Promise<?DirectoryEndpoints>}
   */
  const updateDirectoryState=async(dir)=>{
    try{
      console.log(bold(`${magenta('Directory')}: ${dir}`));
      const config=validateDirectoryConfig(
        await import(`./${dir}/directory.json`,{assert:{type:'json'}}).default
      );
      /**
       * @param {string} mod
       * @return {Promise<[Endpoint<*>]>}
       */
      const load=async(mod)=>{
        return [(await import(`./${mod}`)).default].flat(1);
      };
      const staticEndpoint=null; //todo
      /** @type {[Endpoint<*>]} */
      const endpoints=[
        staticEndpoint,
        ...(await Promise.all(config.endpoints.map(mod=>load(mod))
      )).flat(1)].filter(it=>it);
      return {
        directory: dir,
        domains: config.domains,
        endpoints
      }
    }catch(err){
      console.error(err);
      return null;
    }
  };
  /**
   * @return {Promise<State>}
   */
  const updateState=async()=>{
    /** @type {State} */
    const state=new Map();
    /**
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    const hasConfig=async(name)=>{
      try{
        return (await Deno.lstat(`./${name}/directory.json`)).isFile;
      }catch(_){
        return false;
      }
    };
    for await(const it of Deno.readDir('.')){
      if(it.isDirectory){
        if(it.name.charAt(0)==='.') continue;
        if(await hasConfig(it.name)){
          const config=await updateDirectoryState(it.name);
          if(!config) throw new Error(`Could not load config for directory "${it.name}".`);
          for(const domain of config.domains){
            if(state.has(domain)) {
              throw new Error(`Domain "${domain}" is assigned to two different directories.`);
            }
            state.set(domain,config);
          }
        }
      }
    }
    return state;
  }

  /** @type {Endpoint<boolean>} */
  const updateAllEndpoint={
    updating: false,
    accept: async function(request, url){
      if(request.method!=='GET') return null;
      if(url.pathname!=='/update') return null;
      // noinspection JSPotentiallyInvalidUsageOfThis
      const value=this.updating;
      // noinspection JSPotentiallyInvalidUsageOfThis
      this.updating=true;
      return value;
    },
    handle: async function(updating){
      if(updating) return new Response({status:429});
      try{
        state=await updateState();
        return new Response(null,{status:200});
      }finally{
        // noinspection JSPotentiallyInvalidUsageOfThis
        this.updating=false;
      }
    }
  };

  /** @type {Endpoint<{name:DirectoryName,updating:boolean}>} */
  const updateDirectoryEndpoint={
    updating: false,
    accept: async function(request, url){
      if(request.method!=='GET') return null;
      const match=/^[/]update[/]([^/]+)$/.exec(url.pathname);
      if(!match) return null;
      const name=match[1];
      if(name.charAt(0)==='.') return null;
      if(localDomains.has(name)) return null;
      // noinspection JSPotentiallyInvalidUsageOfThis
      const updating=this.updating;
      // noinspection JSPotentiallyInvalidUsageOfThis
      this.updating=true;
      return {name,updating};
    },
    handle: async function(accepted){
      const {name,updating}=accepted;
      if(updating) return new Response({status:429});
      try{
        const newConfig=await updateDirectoryState(name);
        if(!newConfig) throw new Error(`Could not load config for directory "${name}".`);
        const newState=new Map();
        for(const [domain,config] of state){
          if(config.directory!==name){
            newState.set(domain,config);
          }
        }
        for(const domain of newConfig.domains){
          if(newState.has(domain)) {
            throw new Error(`Domain "${domain}" is assigned to two different directories.`);
          }
          newState.set(domain,newConfig);
        }
        state=newState;
        return new Response(null,{status:200});
      }finally{
        // noinspection JSPotentiallyInvalidUsageOfThis
        this.updating=false;
      }
    }
  };
  /** @type {DirectoryEndpoints} */
  const endpoints={
    directory: '.local',
    domains: [...localDomains],
    endpoints: [updateAllEndpoint,updateDirectoryEndpoint]
  };
  for(const domain of localDomains){
    state.set(domain,endpoints);
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
          handle(requestEvent,url,state.get(hostname)?.endpoints);
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
