declare module server {
  export type MimeType = string;
  export interface MimeTypeConfig {
    suffixes: string[],
    headers: HeadersInit,
    compress: boolean,
    cache_threshold?: string|number
  }
  export interface MimeTypes {
    [key: MimeType]: MimeTypeConfig
  }
  export type DomainName = string;
  export interface StaticConfig {
    domain: DomainName,
    headers?: HeadersInit,
    path?: string,
    excludes?: string[],
    mime_types: MimeTypeConfig
  }
  export interface DirectoryConfig {
    domains: DomainName[],
    headers?: Record<string,string>,
    endpoints?: string[],
    static?: StaticConfig
  }
  export type DirectoryName = string;
  export interface Endpoint<T> {
    accept: (request: Request, url: URL) => Promise<T>
    handle: (accepted: T, headers?: Record<string,string>) => Promise<Response>
  }
  export type ServeOptions = Deno.ListenOptions & { transport?: 'tcp' }
  export type ServerOptions = ServeOptions & { signal?: AbortSignal }
  export function serve(options: ServerOptions):Promise<void>
  interface DirectoryEndpoints {
    directory: string,
    domains: DomainName[],
    endpoints?: Endpoint<unknown>[]
  }
  type State = Map<DomainName,DirectoryEndpoints>;
  type Uint8ArrayAsyncFunction=()=>Promise<Uint8Array>;
  interface CacheValue {
    headers: Headers,
    body?: Uint8Array|Uint8ArrayAsyncFunction,
    status?: number
  }
  interface ErrorObject {
    keyword: string
    message?: string
  }
  type ValidateFunction<T> = (data: unknown)=>T & {errors?:ErrorObject[]};
}
