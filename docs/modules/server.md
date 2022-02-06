[undefined](../README.md) / server

# Namespace: server

## Table of contents

### Interfaces

- [DirectoryConfig](../interfaces/server.DirectoryConfig.md)
- [DomainDirectories](../interfaces/server.DomainDirectories.md)
- [Endpoint](../interfaces/server.Endpoint.md)
- [MimeTypeConfig](../interfaces/server.MimeTypeConfig.md)
- [MimeTypes](../interfaces/server.MimeTypes.md)
- [State](../interfaces/server.State.md)
- [StaticConfig](../interfaces/server.StaticConfig.md)

### Type aliases

- [DirectoryName](server.md#directoryname)
- [DomainName](server.md#domainname)
- [MimeType](server.md#mimetype)
- [ServeOptions](server.md#serveoptions)
- [ServerOptions](server.md#serveroptions)

### Functions

- [serve](server.md#serve)

## Type aliases

### DirectoryName

Ƭ **DirectoryName**: `string`

___

### DomainName

Ƭ **DomainName**: `string`

___

### MimeType

Ƭ **MimeType**: `string`

___

### ServeOptions

Ƭ **ServeOptions**: `Deno.ListenOptions` & { `transport?`: ``"tcp"``  }

___

### ServerOptions

Ƭ **ServerOptions**: [`ServeOptions`](server.md#serveoptions) & { `signal?`: `AbortSignal`  }

## Functions

### serve

▸ **serve**(`options`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `options` | [`ServerOptions`](server.md#serveroptions) |

#### Returns

`Promise`<`void`\>
