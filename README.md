# Deno HTTP/1.1 server #

## Why HTTP/1.1 ?

This server is supposed to be behind another server that handles HTTPS and the TLS Certificates, as well as HTTP2 and HTTP3 upgrades.

This can be a CDN like [cloudflare](https://www.cloudflare.com/) and/or another server like [nginx](https://www.nginx.com/) or [caddy](https://caddyserver.com/).

## File structure

The server will scan the current directory looking for subdirectories (direct children) containing a `directory.json` config file (direct child).

## directory.json config files

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

## Endpoints

Endpoints can be implemented in js modules.
The default export should be an `Endpoint<*>[]` or an `async () => Endpoint<*>[]`. 

When multiple domains are used, no redirection is done by default. Redirection to a specific domain should be done in the endpoints if desired.

## Static files

Static files are pre-compressed when applicable and preloaded into memory to improve speed and avoid disk io bottlenecks.

### Indexes
`index.html` is used for the directory itself. If this file doesn't exist, then a `404` is returned.

### Redirects
A redirect is used to remove the trailing slash for
the domain root.

`http://www.example.com/` redirects to `http://www.example.com` with a `301`.

For other directory urls, redirects are used to add a trailing slash.

`http://www.example.com/dir` redirects to `http://www.example.com/dir/` with a `301`.

If there are multiple domains specified, requests will be redirected to the domain specified.

`http://example.com/hero.svg` redirects to `http://www.example.com/hero.svg` with a `301`.

### File types
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
    "prefixes": [
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

The list of default types is [here](./mimes.json).
