# Deno HTTP/1.1 server #

## Why HTTP/1.1 ?

This server is supposed to be behind another server that handles HTTPS and the TLS Certificates, as well as HTTP2 and HTTP3 upgrades.

This can be a CDN like [cloudflare](https://www.cloudflare.com/) and/or another server like [nginx](https://www.nginx.com/) or [caddy](https://caddyserver.com/).

## File structure

The root directory is given as an argument when launching the server, or it defaults to the current directory.

```
${root}/
  domains.mjs
  mimes.mjs
  ${domain1}/
    endpoints/
      endpoint_group1.mjs
      internal/
        ...
    static.mjs
    static/
      ...
```

## domains.mjs

This should have a default export that returns an object.

The keys of the object are strings and represent directory names.

The values are arrays of strings representing a list of domains whose endpoints and/or static files reside inside that directory.

## mimes.mjs

TODO

## static.mjs

TODO
