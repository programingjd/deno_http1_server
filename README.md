# Deno HTTP/1.1 server #

Table of Content:
  - <a href="#why_http1">Why HTTP/1.1 ?</a>
  - <a href="#file_structure">File structure</a>
  - <a href="#update_endpoints">Update endpoints</a>
  - <a href="#usage">How to use</a>
  - <a href="#example">Example</a>
  - <a href="#directory_config_files">Directory.json config files</a>
  - <a href="#endpoints">Endpoints</a>
  - <a href="#endpoints">Static files</a>
    - <a href="#indexes">Indexes</a>
    - <a href="#redirects">Redirects</a>
    - <a href="#file_types">File types</a>
  - <a href="#tests">Running the tests</a>

## <a id="why_http1">Why HTTP/1.1 ?</a>

This server is supposed to be behind another server that handles HTTPS and the TLS Certificates, as well as HTTP2 and HTTP3 upgrades.

This can be a CDN like [cloudflare](https://www.cloudflare.com/) and/or another server like [nginx](https://www.nginx.com/) or [caddy](https://caddyserver.com/).

File contents are pre-compressed and preloaded into memory (unless the configuration files specifies not to). The compression is using [brotli](https://en.wikipedia.org/wiki/Brotli) compression because it's now available in all mainstream browsers and tools.<br>
Unfortunately, browsers [don't support brotli compression with http (non-https)](https://stackoverflow.com/a/43862563/10498513). This means that you can't test it directly in the browser unless you do have that additional server in front. The [example](#example) includes a caddy configuration to do that. Note that in the caddy configuration, `strict_sni_host` is disabled because [it doesn't work with http3](https://github.com/caddyserver/caddy/issues/4294).

## <a id="file_structure">File structure</a>

The server will scan the current directory looking for subdirectories (direct children) containing a `directory.json` config file (direct child of that subdirectory).

## <a id="update_endpoints">Update endpoints</a>

The server uses a cache that is built on startup.
There are two endpoints to update the cache:
  - `/update`  updates everything by reloading all configurations the same way as during startup.
  - `/update/${directory}` updates the specified directory only (this can also be used to add a new directory).

These endpoints are only available from localhost.
If you need to call them from somewhere else, you need to add custom endpoints and forward the calls. This can be useful to set up git webhooks and keep the server up to date after commits. Look at the example for details on how to implement those.

## <a id="usage">How to use</a>

```javascript
import {listen} from 'https://raw.githubusercontent.com/programingjd/deno_http1_server/main/mod.js';

const serve=await listen({hostname,port});
// serve connections until server is stopped
await serve();
```

See the full [documentation](https://doc.deno.land/https://raw.githubusercontent.com/programingjd/deno_http1_server/main/mod.d.ts) for additional options and details.

## <a id="example">Example</a>

The example has a [directory](example) `example` that holds the configuration for serving content for the `test.local` and `www.test.local` domains.<br>
It serves the static files under that directory except two files:
  - [directory.json](example/directory.json) the configuration file iteself
  - [endpoint.mjs](example/endpoints.mjs) the implementation of custom endpoints

It also has two custom endpoints, implemented in [endpoint.mjs](example/endpoints.mjs):
  - `/example/endpoint`
  - `/update_webhook`

There's also a caddy configuration for that example in [caddy/caddy.json](caddy/caddy.json).
For testing locally, you need to modify your [hosts](https://en.wikipedia.org/wiki/Hosts_(file)) file to have `test.local` and `www.test.local` point to `127.0.0.1`.

The example server can be started with [index.mjs](index.mjs):
`deno run -A index.mjs`

Once the server and caddy are running, you can point your browser (or curl) to
[https://test.local/example](https://test.local/example).

## <a id="directory_config_files">directory.json config files</a>

A JSON Schema is available to validate the directory.json files:
[directory.schema.json](https://raw.githubusercontent.com/programingjd/deno_http1_server/main/directory.schema.json)

The server uses the same schema to validate the configuration files.

```json
{
  "domains": [ "example.com", "www.example.com" ],
  "headers": {
    "vary": "accept-encoding, accept"
  },
  "endpoints": [
    "endpoints.mjs"
  ],
  "static": {
    "domain": "www.example.com",
    "path": "/",
    "excludes": [ "endpoints.mjs" ],
    "mime_types": {
      
    }
  }
}
```
- `domains` is an array of domains that should use this directory config.

- `headers` are headers that will be applied to all endpoints and mime types.<br>
You can unset a header by setting its value to `null`.<br>
The list of default headers is [here](headers.json).<br> 
_This field is optional._

- `endpoints` is an array of modules implementing custom endpoints.<br>
If static file serving is enabled, they take precedence over the endpoints.<br>
_This field is optional._

- `static` enables static file serving and specifies its configuration.<br>
_This field is optional._<br>
  - `domain` specifies which domain to redirect to.<br>
  _This field is only necessary if there are multiple domains enabled for the directory._
  - `path` under which path to serve the static files.<br>
  _This field is optional and defaults to `"/"`._
  - `excludes` is a list of relative paths to exclude.
  It's usually a good idea to exclude the module files used for the endpoints.<br>
  _This field is optional._
  - `mime_types` is a list of mime type overrides. See [File types](#file_types) for how to configure a file type. You can disable a file type by associating its mime-type key to `null`.<br>
  _This field is optional._

## <a id="endpoints">Endpoints</a>

Endpoints can be implemented in js modules.
The default export should be an `Endpoint<*>[]` or an `async () => Endpoint<*>[]`. 

When multiple domains are used, no redirection is done by default. Redirection to a specific domain should be done in the endpoints if desired.

```typescript
interface Endpoint<T> {
  name?: string,
  accept: (request: Request, url: URL, remoteAddr: Deno.Addr) => Promise<T>
  handle: (accepted: T, headers?: Record<string,string>) => Promise<Response>
}
```

## <a id="static_files">Static files</a>

Static files are pre-compressed (with `brotli --best`) when applicable and preloaded into memory to improve speed and avoid disk io bottlenecks.

### <a id="indexes">Indexes</a>
`index.html` is used for the directory itself. If this file doesn't exist, then a `404` is returned.

### <a id="redirects">Redirects</a>
A redirect is used to remove the trailing slash for
the domain root.

`http://www.example.com/` redirects to `http://www.example.com` with a `308`.

For other directory urls, redirects are used to add a trailing slash.

`http://www.example.com/dir` redirects to `http://www.example.com/dir/` with a `308`.

If there are multiple domains specified, requests will be redirected to the domain specified.

`http://example.com/hero.svg` redirects to `http://www.example.com/hero.svg` with a `308`.

### <a id="file_types">File types</a>
There's a list of default file types that can be overwritten.

The configuration of a file type includes:
  
  - The mime-type.
    
    _Example_:

    `"text/plain"`


  - A list of suffixes (extensions of other suffixes).
    
    _Example_:

    `[ ".txt", "readme" ]`


  - A list of headers (cache-control is recommended, content-type defaults to the mime-type but can be overridden here).


  - Whether compression should be enabled.


  - The cache threshold.

    It represents the (uncompressed) file size after which files will not be cached and will instead be read directly from disk.

    Accepted values are numbers or strings with byte units.

    Files that are not cached will not be compressed automatically
    but might support range requests.

    _Examples_:
  
    `null` (always cache)

    `0` (never cache)

    `4096`
 
      `"4kb"`

  
Example configuration:

```json
{
  "text/plain": {
    "suffixes": [
      ".txt",
      "readme"
    ],
    "headers": {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private; max-age=604800; must-revalidate"
    },
    "compress": true,
    "cache_threshold": "16kb"
  }
}
```

The list of default types is [here](mimes.json).

## <a id="tests">Running the tests</a>

The tests assume that `test.local` and `www.test.local` resolve to the local host.

The easiest way to do that is probably to edit `/etc/hosts` (on linux/os-x) or `%SYSTEM_ROOT%\System32\drivers\etc\hosts` (on windows)
and add the lines:

```
127.0.0.1         test.local www.test.local
::1               test.local www.test.local
```
