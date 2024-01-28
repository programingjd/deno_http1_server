import defaultHeaders from './headers.json' assert {type:'json'};
import defaultMimes from './mimes.json' assert {type:'json'};
import {underline} from 'https://deno.land/std/fmt/colors.ts';
import {compress as br} from 'https://deno.land/x/brotli/mod.ts';
import {readableStreamFromReader} from 'https://deno.land/std/streams/mod.ts';

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
 * @param {Deno.NetAddr} remoteAddr
 * @param {?[Endpoint<*>]} endpoints
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
 * @param {DirectoryConfig} config
 * @param {ServeOptions} options
 * @param {string} [cwd=Deno.cwd()]
 * @return {Promise<()=>Promise<void>>}
 */
const listen=async(config,options, cwd=Deno.cwd())=>{
  const {signal=null}=options;
  /** @type {State} */
  let state=new Map();

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

  const mtime=Date.now().toString(16);

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
    for await(const it of Deno.readDir(`${cwd}/${path}`)){
      const name=it.name;
      if(it.isFile){
        // noinspection JSCheckFunctionSignatures
        const mimeEntry=mimeEntries.find(
          ([,value])=>value.suffixes.find(suffix=>name.endsWith(suffix))
        );
        if(mimeEntry){
          let filename=`/${path}/${name}`;
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
          const stat=await Deno.stat(`${cwd}${filename}`);
          const cacheThreshold=threshold(mimeEntry[1].cache_threshold);
          const filesize=stat.size
          const cacheBody=cacheThreshold===null||filesize<=cacheThreshold;
          const compress=cacheBody&&mimeEntry[1].compress;
          const etag=`${mtime}:${filesize.toString(16)}`;
          const cacheHeaders=mergeHeaders(
            headers,
            {'content-type': mimeEntry[0],etag},
            mimeEntry[1].headers,
          );
          let body;
          if(cacheBody){
            body=await Deno.readFile(`${cwd}${filename}`);
            if(compress){
              body=await br(body);
              cacheHeaders.set('content-encoding','br');
            }
            cacheHeaders.set('content-length',body.byteLength.toString());
          }else{
            body=async()=>{
              const file=await Deno.open(`${cwd}${filename}`,{read:true});
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
        const filename=`${path}/${name}`;
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
        `/${dir}/directory.json`,
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
   * @param {DirectoryConfig} directoryConfig
   * @return {Promise<?DirectoryEndpoints>}
   */
  async function updateDirectoryState(directoryConfig){
    try{
      /** @type {[Endpoint<*>]} */
      const endpoints=[
        await staticEndpoint(cwd,config.headers,config.static)
      ].filter(it=>it);
      return {
        domains: directoryConfig.domains,
        endpoints
      }
    }catch(err){
      console.error(err);
      return null;
    }
  }

  /**
   * @param {DirectoryConfig} directoryConfig
   * @return {Promise<State>}
   */
  async function updateState(directoryConfig){
    /** @type {State} */
    const state=new Map();

    const config=await updateDirectoryState(directoryConfig);
    if(!config) throw new Error('Could not load config.');
    for(const domain of config.domains){
      if(state.has(domain)) {
        throw new Error(`Domain "${domain}" is assigned to two different directories.`);
      }
      state.set(domain,config);
    }
    return state;
  }

  state=await updateState(config);
  /**
   * @param {Request} request
   * @param {Deno.NetAddr} remoteAddr
   * @returns {Promise<void>}
   */
  const handleRequest=async(request,remoteAddr)=>{
    try{
      const url=new URL(request.request.url);
      const hostname=url.hostname;
      return await handle(request,url,remoteAddr,state.get(hostname)?.endpoints);
    }catch(err){
      console.warn(remoteAddr,err);
    }
  };
  const server=Deno.serve(options, handleRequest);
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
