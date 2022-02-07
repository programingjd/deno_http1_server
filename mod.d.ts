declare module server {
  export type MimeType = string;
  export interface MimeTypeConfig {
    prefixes: string[],
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
    path?: string,
    excludes?: string[],
    mime_types: MimeTypeConfig
  }
  export interface DirectoryConfig {
    domains: DomainName[],
    headers: HeadersInit,
    endpoints?: string[],
    static?: StaticConfig
  }
  export type DirectoryName = string;
  export interface DomainDirectories {
    [key: DirectoryName]: DomainName[];
  }
  export interface Endpoint<T> {
    accept: (request: Request, url: URL) => Promise<T>
    handle: (accepted: T) => Promise<Response>
  }
  export type ServeOptions = Deno.ListenOptions & { transport?: 'tcp' }
  export type ServerOptions = ServeOptions & { signal?: AbortSignal }
  export function serve(options: ServerOptions):Promise<void>

  interface State {
    directories: Set<DirectoryName>;
    endpoints: Map<DomainName,Endpoint<unknown>[]>
  }
}
