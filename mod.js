import {underline,strikethrough,magenta} from 'https://deno.land/std/fmt/colors.ts';
import {readableStreamFromReader} from 'https://deno.land/std/streams/mod.ts';
import {toFileUrl} from 'https://deno.land/std/path/mod.ts';
import {compress as br} from 'https://deno.land/x/brotli/mod.ts';

/** @type {Set<DomainName>} */
const localDomains=new Set([
  'localhost',
  '127.0.0.1',
  '::1'
]);

/**
 * @param {ServeOptions} options
 * @return {string}
 */
const address=(options)=>{
  if(options.path){
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
 * @param {Request} request
 * @param {URL} url
 * @param {Deno.UnixAddr|Deno.NetAddr} remoteAddr
 * @param {?Endpoint<*>[]} endpoints
 * @return {Promise<Response>}
 */
const handle=async(request,url,remoteAddr,endpoints)=>{
  if(endpoints){
    for(const endpoint of endpoints){
      try{
        const accepted=await endpoint.accept(request,url,remoteAddr);
        if(accepted!==null){
          try{
            return await endpoint.handle(accepted);
          }catch(err){
            console.warn(err);
            return new Response(null,{status:500});
          }
        }
      }catch(err){
        console.warn(err);
      }
    }
  }
  return new Response(null,{status:404});
}

/**
 * @param {ServeOptions} options
 * @param {string} [baseUrl=Deno.baseUrl()]
 * @return {Promise<()=>Promise<void>>}
 */
const listen=async(options, baseUrl=toFileUrl(Deno.cwd()))=>{
  const {signal=null}=options;

  let defaultHeaders=(await import('./headers.json',{with:{type:'json'}})).default;
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
  let defaultMimes=validateMimeTypes((await import('./mimes.json',{with:{type:'json'}})).default);

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
    name: '/update',
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
    name: '/update/{directory}',
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
   * @param {number|string|null} threshold
   * @returns {?number}
   */
  function threshold(threshold){
    if(threshold===null) return null;
    if(typeof threshold==='number') return threshold;
    const match=/^([0-9]+.)([kmg]?)b$/.exec(threshold.toString());
    if(!match) throw new Error(`Invalid cache threshold value: ${threshold}`);
    let multiplier=1;
    const unit=match[2];
    if(unit==='k') multiplier=1024;
    if(unit==='m') multiplier=1024*1024;
    if(unit==='g') multiplier=1024*1024*1024;
    return parseFloat(match[1])*multiplier;
  }

  /**
   * @param {...(Object<string,string>|Headers)} args
   * @return {Headers}
   */
  function mergeHeaders(...args){
    const map=new Map();
    for(const headers of args){
      if(headers){
        for(const entry of headers instanceof Headers?headers.entries():Object.entries(headers)){
          map.set(entry[0].toLowerCase(),entry[1]);
        }
      }
    }
    return new Headers([...map.entries()]);
  }

  function deriveEtag(stat,filesize){
    try{
      return `${stat.mtime.getTime().toString(16)}:${filesize.toString(16)}`;
    }catch(_){ // Deno deploy doesn't support mtime
      return `${Date.now().toString(16)}:${filesize.toString(16)}`;
    }
  }

  /**
   * @param {string} domain
   * @param {string} path
   * @param {string} prefix
   * @param {Headers} headers
   * @param {MimeTypes} mimes
   * @param {Set<string>} excludes
   * @param {Map<string,CacheValue>} cache
   * @returns {Promise<void>}
   */
  async function walk(domain,path,prefix,headers,mimes,excludes,cache){
    /** @type {[string,MimeTypeConfig][]} */
    const mimeEntries=Object.entries(mimes);
    const dirUrl=new URL(sanitizePath(`${baseUrl.pathname}/${path}`), baseUrl);
    for await(const it of Deno.readDir(dirUrl)){
      const name=it.name;
      if(name.charAt(0)==='.') continue;
      if(it.isFile){
        // noinspection JSCheckFunctionSignatures
        const mimeEntry=mimeEntries.find(
          ([,value])=>value.suffixes.find(suffix=>name.endsWith(suffix))
        );
        if(mimeEntry){
          let filename=sanitizePath(`${path}/${name}`);
          if(excludes.has(filename)) continue;
          let pathname;
          if(it.name==='index.html'){
            if(prefix===''){
              pathname='';
              cache.set(
                '/',
                {
                  headers: mergeHeaders(headers,{location:`https://${domain}`}),
                  status: 308
                }
              );
            }else{
              pathname=`${prefix}/`
              cache.set(
                prefix,
                {
                  headers: mergeHeaders(headers,{location:pathname}),
                  status: 308
                }
              );
            }
          }else pathname=`${prefix}/${name}`;
          const childUrl=new URL(sanitizePath(`${baseUrl.pathname}/${filename}`),baseUrl);
          const stat=await Deno.stat(childUrl);
          const cacheThreshold=threshold(mimeEntry[1].cache_threshold);
          const filesize=stat.size
          const cacheBody=cacheThreshold===null||filesize<=cacheThreshold;
          const compress=cacheBody&&mimeEntry[1].compress;
          const etag=deriveEtag(stat,filesize); // `${stat.mtime.getTime().toString(16)}:${filesize.toString(16)}`;
          const cacheHeaders=mergeHeaders(
            headers,
            {'content-type': mimeEntry[0],etag},
            mimeEntry[1].headers,
          );
          let body;
          if(cacheBody){
            body=await Deno.readFile(childUrl);
            if(compress){
              body=await br(body);
              cacheHeaders.set('content-encoding','br');
            }
            cacheHeaders.set('content-length',body.byteLength.toString());
          }else{
            body=async()=>{
              const file=await Deno.open(childUrl,{read:true});
              const stat=await file.stat();
              if(stat.size!==filesize) throw new Error('File changed.');
              return readableStreamFromReader(file);
            }
            cacheHeaders.set('content-length',filesize.toString());
          }
          cache.set(
            pathname,
            {
              headers: cacheHeaders,
              body
            }
          );
          console.log(`${underline(pathname||'/').padEnd(80)}   ${filesize.toString().padStart(12)}`
                      +`   ${(body.byteLength||filesize).toString().padStart(12)}`);
        }
      }else if(it.isDirectory){
        const filename=sanitizePath(`${path}/${name}`);
        if(!excludes.has(filename)){
          await walk(domain,filename,`${prefix}/${name}`,headers,mimes,excludes,cache);
        }
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
    // noinspection JSValidateTypes
    const mergedHeaders=mergeHeaders(defaultHeaders,config.headers);
    const mergedMimes=Object.assign({...defaultMimes},config.mime_types||{});
    await walk(
      config.domain,
      dir,
      path,
      mergedHeaders,
      mergedMimes,
      new Set([
        sanitizePath(`${dir}/directory.json`),
      ...(config.excludes||[]).map(it=>sanitizePath(`${dir}/${it}`))
      ]),
      cache
    );
    return {
      name: `${path}/{files}`,
      accept: async(request, url)=>{
        const key=url.pathname==='/'?'':url.pathname;
        const entry=cache.get(key);
        if(!entry) return null;
        if(url.hostname!==config.domain){
          const location=new URL(url);
          location.hostname=config.domain;
          const redirectHeaders=new Headers(mergedHeaders);
          redirectHeaders.set('location',location.toString());
          return { headers: redirectHeaders, status: 308 };
        }
        if(request.method==='HEAD'||request.method==='GET'){
          if(entry.compressed){
            const encodings=request.headers.get('accept-encoding');
            if(!encodings||encodings.indexOf('br')=== -1){
              return {headers:new Headers(mergedHeaders),status:406};
            }
          }
          if(entry.status) return entry;
          // we don't check for accept-encoding br because browsers don't include it with http.
          const ifNoneMatch=request.headers.get('if-none-match');
          const etag=entry.headers.get('etag');
          const status=etag===ifNoneMatch?304:200;
          if(status===200&&request.method==='GET'){
            return { headers: entry.headers, body: entry.body, status };
          }else return { headers: entry.headers, status };
        }else return methodNotAllowed;
      },
      handle: async(value)=>{
        const body=typeof value.body==='function'?await value.body():value.body;
        return new Response(
          body,
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
   * @param {Object<string,string>} headers
   * @param {?string[]} modules
   * @returns {Promise<Endpoint<*>[]>}
   */
  async function dynamicEndpoints(dir,headers,modules){
    if(modules&&modules.length>0){
      const additionalHeaders=Object.assign({...defaultHeaders},headers||{});
      const importMod=async mod=>{
        const url=new URL(baseUrl);
        url.pathname+=sanitizePath(`${dir}/${mod}`);
        const imported=await import(url);
        let endpoints=imported.default;
        if(typeof endpoints==='function') endpoints=await endpoints();
        return Array.isArray(endpoints)?endpoints:[endpoints];
      };
      return (await Promise.all(modules.map(importMod))).
        flat(1).
        map(it=>{
          if(it.name) console.log(underline(it.name));
          return {
            accept: it.accept,
            handle: async(accepted)=>await it.handle(accepted,additionalHeaders)
          };
        });
    }
    return [];
  }

  /**
   * @param {DirectoryName} dir
   * @return {Promise<?DirectoryEndpoints>}
   */
  async function updateDirectoryState(dir){
    try{
      console.log(`${magenta('Directory')}: ${dir}`);
      const url=new URL(baseUrl);
      url.pathname=sanitizePath(`${url.pathname}/${dir}/directory.json`);
      const json=JSON.parse(await Deno.readTextFile(url));
      const config=validateDirectoryConfig(json);
      // const mod=await import(url,{with:{type:'json'}});
      // const config=validateDirectoryConfig(mod.default);
      /** @type {[Endpoint<*>]} */
      const endpoints=[
        ...await dynamicEndpoints(dir,config.headers,config.endpoints),
        await staticEndpoint(dir,config.headers,config.static),
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
        return (await Deno.lstat(new URL(sanitizePath(`${baseUrl.pathname}/${name}/directory.json`), baseUrl))).isFile;
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
    for await(const it of Deno.readDir(baseUrl)){
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
        }else console.log(strikethrough(`Directory: ${it.name}`));
      }
    }
    return state;
  }

  state=await updateState();
  /**
   * @param {Request} request
   * @param {Deno.UnixAddr|Deno.NetAddr} remoteAddr
   * @returns {Promise<Response>}
   */
  const handleRequest=async(request,remoteAddr)=>{
    try{
      const url=new URL(request.url);
      const hostname=url.hostname;
      return await handle(request,url,remoteAddr,state.get(hostname)?.endpoints);
    }catch(err){
      console.warn(remoteAddr,err);
      return new Response(null,{status:500});
    }
  };
  const server=Deno.serve(options, handleRequest);
  // noinspection HttpUrlsUsage
  console.log(`Listening on http://${address(options)}.`);
  signal?.addEventListener('abort',()=>{
    console.log('stopping server');
    server.shutdown();
  });
  await server.finished;
  console.log('server shutdown');
};

export {
  listen
}
