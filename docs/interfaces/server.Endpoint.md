# Interface: Endpoint<T\>

[server](../modules/server.md).Endpoint

## Type parameters

| Name |
| :------ |
| `T` |

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
