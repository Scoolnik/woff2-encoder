# woff2-encoder

[![License: MIT](https://img.shields.io/github/license/itskyedo/woff2-encoder?color=blue)](https://github.com/itskyedo/woff2-encoder/blob/main/LICENSE)
[![NPM Version](https://img.shields.io/npm/v/woff2-encoder.svg?logo=npm&color=red)](https://npmjs.org/package/woff2-encoder)
[![Download Count](https://img.shields.io/npm/dm/woff2-encoder.svg?color=brightgreen)](https://npmjs.org/package/woff2-encoder)

> [!IMPORTANT]
> You are currently viewing the docs for the upcoming v3 release, which is currently in beta.
>
> The current version is tagged [v2.0.0](https://github.com/itskyedo/woff2-encoder/tree/v2.0.0).

## 👋 Introduction

A TypeScript library for handling WOFF2 encoding using WebAssembly.

### Getting Started

#### Prerequisites

- If using Node, `>= 22.12`
- If using a browser, Chrome/Edge `>= 85`, Firefox `>= 79`, or Safari `>= 14.1`

#### Installation

```console
npm install woff2-encoder@beta
```

## 🗒️ Notes

If you only need to decompress WOFF2 files, it's recommended that you import
from `woff2-encoder/decompress` (see the [Decompress only](#decompress-only)
example below). This will net your end users a significant decrease in bundle
size as it uses its own separate WASM file with a much smaller footprint.

This package is ESM-only, however CJS projects can still load it with `require`.

Decompression output is limited to 30 MB of uncompressed font data, matching
the default limit of the upstream [google/woff2](https://github.com/google/woff2)
library. This guards against decompression bombs, but it means fonts larger
than 30 MB uncompressed will fail to decompress.

## 📚 API Reference

### `compress`

Compresses SFNT (TrueType/OpenType) font data to WOFF2 font data.

**Returns:** `Promise<Uint8Array>` A promise resolving to the WOFF2 font data.

| Parameter | Type                        | Description         |
| :-------- | :-------------------------- | :------------------ |
| buffer    | `ArrayBuffer \| Uint8Array` | The SFNT font data. |

### `compressSync`

Synchronously compresses SFNT (TrueType/OpenType) font data to WOFF2 font data.

Await `preload()` from `woff2-encoder` before the first call. Calling this before
initialization completes throws `Woff2ErrorCode.MODULE_NOT_INITIALIZED`. Invalid
SFNT data throws `Woff2ErrorCode.COMPRESS_FAILED`.

**Returns:** `Uint8Array` The WOFF2 font data.

| Parameter | Type                        | Description         |
| :-------- | :-------------------------- | :------------------ |
| buffer    | `ArrayBuffer \| Uint8Array` | The SFNT font data. |

### `decompress`

Decompresses WOFF2 font data back to SFNT (TrueType/OpenType) font data.

**Returns:** `Promise<Uint8Array>` A promise resolving to the SFNT font data.

| Parameter | Type                        | Description          |
| :-------- | :-------------------------- | :------------------- |
| buffer    | `ArrayBuffer \| Uint8Array` | The WOFF2 font data. |

### `decompressSync`

Synchronously decompresses WOFF2 font data back to SFNT (TrueType/OpenType) data.
Available as a named export from both `woff2-encoder` and
`woff2-encoder/decompress`.

Await `preload()` from the same entry point before the first call. Calling this
before initialization completes throws `Woff2ErrorCode.MODULE_NOT_INITIALIZED`.
Invalid WOFF2 data throws `Woff2ErrorCode.DECOMPRESS_FAILED`; a declared decompressed
size above `MAX_DECOMPRESSED_SIZE` throws `Woff2ErrorCode.MAX_SIZE_EXCEEDED`.

**Returns:** `Uint8Array` The SFNT font data.

| Parameter | Type                        | Description          |
| :-------- | :-------------------------- | :------------------- |
| buffer    | `ArrayBuffer \| Uint8Array` | The WOFF2 font data. |

### `preload`

Eagerly initializes the WASM module so the first `compress` or `decompress`
call does not pay the one-time instantiation cost. Both the package root and
the `woff2-encoder/decompress` subpath export their own `preload`.

Asynchronous operations initialize automatically on first use. For
`compressSync` and `decompressSync`, call and await `preload()` before use;
starting initialization without awaiting it is not sufficient. A completed
asynchronous conversion also leaves that entry point ready for synchronous calls.

The two entry points initialize separate WASM instances. Preloading the package
root does not initialize `woff2-encoder/decompress`, or vice versa. Repeated and
concurrent calls to an entry point's `preload()` share the same initialization.

If an operation throws `WebAssembly.RuntimeError`, the cached instance is
discarded. Await `preload()` again before retrying a synchronous operation;
asynchronous operations initialize a fresh instance on their next call.

**Returns:** `Promise<void>` A promise that resolves once the module is ready.

### `isWoff2Error`

Returns whether an unknown value is an error thrown by this library.

**Returns:** `error is Woff2Error`

| Parameter | Type      | Description         |
| :-------- | :-------- | :------------------ |
| error     | `unknown` | The value to check. |

| Code                     | Meaning                                                                                                           |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `COMPRESS_FAILED`        | The input could not be compressed (e.g. invalid SFNT data).                                                       |
| `DECOMPRESS_FAILED`      | The input could not be decompressed (e.g. invalid WOFF2 data).                                                    |
| `MAX_SIZE_EXCEEDED`      | The declared decompressed size exceeds `MAX_DECOMPRESSED_SIZE`.                                                   |
| `MODULE_NOT_INITIALIZED` | A synchronous operation was called before its WASM module was ready; await `preload()` from the same entry point. |

The codes are also available with the `Woff2ErrorCode` object.

```typescript
import { decompress, isWoff2Error, Woff2ErrorCode } from 'woff2-encoder';

try {
  await decompress(fontBuffer);
} catch (error) {
  if (isWoff2Error(error) && error.code === Woff2ErrorCode.MAX_SIZE_EXCEEDED) {
    // The font is too large to decompress.
  } else {
    throw error;
  }
}
```

### `MAX_DECOMPRESSED_SIZE`

The maximum decompressed font size in bytes (31,457,280 bytes, i.e. 30 MB), matching
the default limit of the upstream [google/woff2](https://github.com/google/woff2)
library. Fonts whose WOFF2 header declares a larger size are rejected by
`decompress` and `decompressSync` before conversion.

## 💡 Examples

### Compress a TTF font using Node.js

```typescript
import fs from 'node:fs';
import { compress } from 'woff2-encoder';

async function example() {
  const fontFile = fs.readFileSync('./my-font.ttf');
  const output = await compress(fontFile);
}
```

### Decompress a WOFF2 font from a URL

```typescript
import { decompress } from 'woff2-encoder';

async function example() {
  const fontBuffer = await fetch('https://example.com/my-font.woff2').then(
    (res) => res.arrayBuffer()
  );

  const output = await decompress(fontBuffer);
}
```

### Parse a WOFF2 font with [opentype.js](https://github.com/opentypejs/opentype.js)

```typescript
import fs from 'node:fs';
import opentype from 'opentype.js';
import { decompress } from 'woff2-encoder';

async function example() {
  const fontFile = fs.readFileSync('./my-font.woff2');
  const output = await decompress(fontFile);

  // Since opentype.js requires a buffer, we pass
  // in the buffer and not the byte array itself
  const fontData = opentype.parse(output.buffer);
}
```

### Preload the WASM module

This will preload the WASM module to speed up the initialization that happens on
the first compress/decompress call.

```typescript
import fs from 'node:fs';
import { compress, preload } from 'woff2-encoder';

async function startup() {
  // Initialize the WASM module before it's needed.
  await preload();
}

async function example() {
  // The first call no longer pays the initialization cost.
  const fontFile = fs.readFileSync('./my-font.ttf');
  const output = await compress(fontFile);
}
```

### Use synchronous APIs after initialization

Initialize once during startup, then call `compressSync` and `decompressSync`
without awaiting each conversion. These calls return `Uint8Array` directly and
run the conversion on the calling thread.

```typescript
import fs from 'node:fs';
import { compressSync, decompressSync, preload } from 'woff2-encoder';

await preload();

const original = fs.readFileSync('./my-font.ttf');
const woff2 = compressSync(original);
const sfnt = decompressSync(woff2);
```

### Decompress only

If your project requires both compression and decompression, you should only
import from the package root.

However, if your project only needs to decompress fonts, it's highly recommended
to import using the `/decompress` subpath. It uses its own separate WASM file
which is 70% smaller.

```typescript
import fs from 'node:fs';
import opentype from 'opentype.js';
import decompress from 'woff2-encoder/decompress';

async function example() {
  const fontBuffer = await fetch('https://example.com/my-font.woff2').then(
    (res) => res.arrayBuffer()
  );

  const output = await decompress(fontBuffer);
}
```

For synchronous decompression, import the named `decompressSync` export and
await the subpath's own `preload`:

```typescript
import fs from 'node:fs';
import { decompressSync, preload } from 'woff2-encoder/decompress';

await preload();

const fontFile = fs.readFileSync('./my-font.woff2');
const output = decompressSync(fontFile);
```

## ⭐ Acknowledgements

- [google/woff2](https://github.com/google/woff2) - For the C++ implementation
  for encoding WOFF2 files.
- [fontello/wawoff2](https://github.com/fontello/wawoff2) - For the initial
  WebAssembly port of Google's WOFF2 encoder.

## 📃 License

Created by [Kyedo](https://github.com/itskyedo) and licensed under the MIT
License. See [LICENSE](./LICENSE) for more details.
