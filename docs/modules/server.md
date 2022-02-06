# Namespace: server

## Interfaces

- [DirectoryConfig](../interfaces/server.DirectoryConfig.md)
- [DomainDirectories](../interfaces/server.DomainDirectories.md)
- [Endpoint](../interfaces/server.Endpoint.md)
- [MimeTypeConfig](../interfaces/server.MimeTypeConfig.md)
- [MimeTypes](../interfaces/server.MimeTypes.md)
- [State](../interfaces/server.State.md)
- [StaticConfig](../interfaces/server.StaticConfig.md)

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
