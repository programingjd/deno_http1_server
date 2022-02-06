[undefined](../README.md) / [server](../modules/server.md) / Endpoint

# Interface: Endpoint<T\>

[server](../modules/server.md).Endpoint

## Type parameters

| Name |
| :------ |
| `T` |

## Table of contents

### Methods

- [accept](server.Endpoint.md#accept)
- [handle](server.Endpoint.md#handle)

## Methods

### accept

▸ **accept**(`request`, `url`): `Promise`<`T`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `request` | `Request` |
| `url` | `URL` |

#### Returns

`Promise`<`T`\>

___

### handle

▸ **handle**(`accepted`): `Promise`<`Response`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `accepted` | `T` |

#### Returns

`Promise`<`Response`\>
