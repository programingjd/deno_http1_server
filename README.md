# Deno HTTP/1.1 server #

## <a id="why_http1">Why HTTP/1.1 ?</a>

This server is supposed to be behind another server that handles HTTPS and the TLS Certificates, as well as HTTP2 and HTTP3 upgrades.

This can be a CDN like [cloudflare](https://www.cloudflare.com/) and/or another server like [nginx](https://www.nginx.com/) or [caddy](https://caddyserver.com/).

## <a id="file_structure">File structure</a>

The server will scan the current directory looking for subdirectories (direct children) containing a `directory.json` config file (direct child).

## <a id="directory_config_files">directory.json config files</a>

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

## <a id="static_files">Static files</a>

Static files are pre-compressed (with `brotli --best`) when applicable and preloaded into memory to improve speed and avoid disk io bottlenecks.

### <a id="indexes">Indexes</a>
`index.html` is used for the directory itself. If this file doesn't exist, then a `404` is returned.

### <a id="redirects">Redirects</a>
A redirect is used to remove the trailing slash for
the domain root.

`http://www.example.com/` redirects to `http://www.example.com` with a `301`.

For other directory urls, redirects are used to add a trailing slash.

`http://www.example.com/dir` redirects to `http://www.example.com/dir/` with a `301`.

If there are multiple domains specified, requests will be redirected to the domain specified.

`http://example.com/hero.svg` redirects to `http://www.example.com/hero.svg` with a `301`.

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


## <a id="json_validation">JSON validation</a>

A Draft 2020-20 JSON Schema is available to validate the directory.json files:
  `directory.schema.json`

The server uses the same schema to validate the configuration files.
