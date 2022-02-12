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

/** @type {Object<string,ValidateFunction<*>>} */
const {validateDirectoryConfig_,validateMimeTypes_}=await(async()=>{
  try{
    return await import('./validator.js');
  }catch(err){
    console.error('Failed to load validators.');
    console.error(err);
    return {validateDirectoryConfig_:null,validateMimeTypes_:null};
  }
})();

/** @type {CacheValue} */
const methodNotAllowed={
  headers: new Headers([
    ['allow','GET, HEAD']
  ]),
  status: 405
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

  let defaultHeaders=(await import('./headers.json',{assert:{type:'json'}})).default;
  for(const [,value] of Object.entries(defaultHeaders)){
    if(typeof value!=='string'){
      throw new Error('Header value for default header "`${key}`" should be a string.');
    }
  }

  /** @type {State} */
  let state=new Map();

  /** @type {ValidateFunction<MimeTypes>} */
  const validateMimeTypes=await(async()=>{
    return (data)=>{
      if(validateMimeTypes_&&!validateMimeTypes_(data)){
        throw new Error(validateMimeTypes_.errors?.map(it=>`Error validating ${it.keyword}:\n${it.message}`).join('\n'));
      }
      return data;
    };
  })();
  let defaultMimes=validateMimeTypes((await import('./mimes.json',{assert:{type:'json'}})).default);

  /** @type {ValidateFunction<DirectoryConfig>} */
  const validateDirectoryConfig=await(async()=>{
    return (data)=>{
      if(validateDirectoryConfig_&&!validateDirectoryConfig_(data)){
        throw new Error(validateDirectoryConfig_.errors?.map(it=>`Error validating ${it.keyword}:\n${it.message}`).join('\n'));
      }
      return data;
    }
  })();

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
      if(updating) return new Response(null,{status:429});
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

  /**
   * @param {string} path
   * @returns {string}
   */
  function sanitizePath(path){
    path=(path||'/').replace('./','');
    if(!path.startsWith('/')) path=`/${path}`;
    path=path.replace(/\/{2,}/g,'/');
    if(path.endsWith('/')) path=path.substring(0,path.length-1);
    return path;
  }

  /**
   * @param {string} dir
   * @param {string} path
   * @param {string} prefix
   * @param {Object<string,string>} headers
   * @param {MimeTypes} mimes
   * @param {Set<string>} excludes
   * @param {Map<string,CacheValue>} cache
   * @returns {Promise<void>}
   */
  async function walk(path,prefix,headers,mimes,excludes,cache){
    /** @type [[string,MimeTypeConfig]] */
    const mimeEntries=Object.entries(mimes);
    for await(const it of Deno.readDir(path)){
      const name=it.name;
      if(it.isFile){
        const mimeEntry=mimeEntries.find(
          ([,value])=>value.suffixes.find(suffix=>name.endsWith(suffix))
        );
        if(mimeEntry){
          let filename=`${path}/${name}`;
          if(excludes.has(filename)) continue;
          let pathname;
          if(it.name==='index.html'){
            pathname=prefix===''?'':`${prefix}/`;
            const redir=prefix===''?`${prefix}/`:prefix;
            cache.set(
              redir,
              {
                headers:new Headers(Object.fromEntries([
                  ...Object.entries(headers),
                  ['location',pathname]
                ])),
                status: 301
              }
            );
          }else pathname=`${prefix}/${name}`;
          const stat=await Deno.stat(filename);
          const body=await Deno.readFile(filename);
          const etag=`${stat.mtime.getTime().toString(16)}:${stat.size.toString(16)}`;
          cache.set(
            pathname,
            {
              headers:new Headers(Object.fromEntries([
                ...Object.entries(headers),
                ['Content-Type',mimeEntry[0]],
                ['Content-Length',body.byteLength],
                ...Object.entries(mimeEntry[1].headers||{}),
                ['ETag',etag],
              ])),
              body
            }
          );
          console.log(yellow(pathname));
        }
      }else if(it.isDirectory){
        const filename=`${path}/${name}`;
        if(!excludes.has(filename)) await walk(filename,`${prefix}/${name}`,headers,mimes,cache);
      }
    }
  }

  /**
   * @param {DirectoryName} dir
   * @param {Object<string,string>} headers
   * @param {?StaticConfig} config
   * @return {Promise<?Endpoint<CacheValue>>}
   */
  async function staticEndpoint(dir, headers, config){
    if(!config) return null;
    /** @type {Map<string,CacheValue>} */
    const cache=new Map();
    const path=sanitizePath(config.path);
    await walk(
      dir,
      path,
      Object.assign({...defaultHeaders},config.headers||{}),
      Object.assign({...defaultMimes},config.mime_types||{}),
      new Set([
        `${dir}/directory.json`,
        (config.excludes||[]).map(it=>sanitizePath(`${dir}/${it}`).replace(/^\//,''))
      ]),
      cache
    );
    return {
      accept:(request, url)=>{
        const entry=cache.get(url.pathname);
        if(!entry) return null;
        if(request.method==='HEAD'||request.method==='GET'){
          if(entry.status) return entry;
          const ifNoneMatch=request.headers.get('if-none-match');
          const etag=entry.headers.get('etag');
          const status=etag===ifNoneMatch?304:200;
          if(status===200&&request.method==='GET'){
            return { headers: entry.headers, body: entry.body, status };
          }else return { headers: entry.headers, status };
        }else return methodNotAllowed;
      },
      handle:(value)=>{
        return new Response(
          value.body,
          {
            headers: value.headers,
            status: value.status
          }
        );
      }
    };
  }

  /**
   * @param {DirectoryName} dir
   * @return {Promise<?DirectoryEndpoints>}
   */
  async function updateDirectoryState(dir){
    try{
      console.log(bold(`${magenta('Directory')}: ${dir}`));
      const mod=await import(`./${dir}/directory.json`,{assert:{type:'json'}});
      const config=validateDirectoryConfig(mod.default);
      /**
       * @param {string} mod
       * @return {Promise<[Endpoint<*>]>}
       */
      const load=async(mod)=>{
        return [(await import(`./${dir}/${mod}`)).default].flat(1);
      };
      /** @type {[Endpoint<*>]} */
      const endpoints=[
        await staticEndpoint(dir,config.headers,config.static),
        ...(await Promise.all(config.endpoints?.map(mod=>load(mod))||[])).flat(1)
      ].filter(it=>it);
      return {
        directory: dir,
        domains: config.domains,
        endpoints
      }
    }catch(err){
      console.error(err);
      return null;
    }
  }
  /**
   * @return {Promise<State>}
   */
  async function updateState(){
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
    /** @type {DirectoryEndpoints} */
    const localEndpoints={
      directory: '.local',
      domains: [...localDomains],
      endpoints: [updateAllEndpoint,updateDirectoryEndpoint]
    };
    for(const domain of localDomains){
      state.set(domain,localEndpoints);
    }
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

  state=await updateState();
  const server=Deno.listen(options);
  // noinspection HttpUrlsUsage
  console.log(bold(`Listening on http://${address(options)}.`));
  signal.addEventListener('abort',()=>server.close());
  /**
   * @param {Deno.HttpConn} requests
   * @returns {Promise<void>}
   */
  const handleRequests=async(requests)=>{
    try{
      for await(/** @type {Deno.RequestEvent} */const requestEvent of requests){
        try{
          const url=new URL(requestEvent.request.url);
          const hostname=url.hostname;
          // noinspection ES6MissingAwait
          handle(requestEvent,url,state.get(hostname)?.endpoints);
        }catch(err){
          console.warn(err);
        }
        if(signal?.aborted===true) break;
      }
    }catch(err){
      console.warn(err);
    }
  }
  for await(const conn of server){
    try{
      // noinspection ES6MissingAwait
      handleRequests(Deno.serveHttp(conn))
    }catch(err){
      console.warn(err);
    }
    if(signal?.aborted===true) break;
  }
  await Deno.shutdown(server.rid);
};

export {
  serve
}
