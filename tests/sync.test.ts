import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type initDecoder from '../build/woff2-decompress-wasm.js';
import type initEncoder from '../build/woff2-wasm.js';

const ttf = fs.readFileSync(path.join(__dirname, 'fixtures/og.ttf'));
const woff2 = fs.readFileSync(path.join(__dirname, 'fixtures/og.woff2'));

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../build/woff2-wasm.js');
  vi.doUnmock('../build/woff2-decompress-wasm.js');
});

describe('compressSync', () => {
  it('requires initialization and waits for preload to finish', async () => {
    const api = await import('../src/index.ts');

    const notInitialized = expect.objectContaining({
      code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
    });
    expect(() => api.compressSync(ttf)).toThrow(notInitialized);
    const pending = api.preload();
    expect(() => api.compressSync(ttf)).toThrow(notInitialized);
    await pending;

    expect(api.compressSync(ttf)).toBeInstanceOf(Uint8Array);
  });

  for (const asArrayBuffer of [false, true]) {
    const inputType = asArrayBuffer ? 'ArrayBuffer' : 'Uint8Array';

    it.each([
      ['og.ttf', 'enc-ttf.woff2'],
      ['og.otf', 'enc-otf.woff2'],
      ['og-var.ttf', 'enc-var-ttf.woff2'],
    ])(
      `compresses %s from ${inputType} after preload`,
      async (inputName, expectedName) => {
        const api = await import('../src/index.ts');
        const input = fs.readFileSync(
          path.join(__dirname, 'fixtures', inputName)
        );
        const expected = fs.readFileSync(
          path.join(__dirname, 'fixtures', expectedName)
        );
        await api.preload();

        const output = api.compressSync(
          asArrayBuffer ? toArrayBuffer(input) : input
        );
        expect(Buffer.compare(output, expected)).toBe(0);
      }
    );
  }

  it('works after asynchronous initialization and invalid input', async () => {
    const api = await import('../src/index.ts');
    const expected = await api.compress(ttf);

    expect(() => api.compressSync(new Uint8Array([1, 2, 3, 4]))).toThrow(
      expect.objectContaining({ code: api.Woff2ErrorCode.COMPRESS_FAILED })
    );
    expect(api.compressSync(ttf)).toEqual(expected);
  });

  it('respects Uint8Array view boundaries', async () => {
    const api = await import('../src/index.ts');
    const expected = fs.readFileSync(
      path.join(__dirname, 'fixtures/enc-ttf.woff2')
    );
    const padded = new Uint8Array(ttf.length + 16).fill(0xff);
    padded.set(ttf, 8);
    const input = padded.subarray(8, 8 + ttf.length);
    await api.preload();

    expect(Buffer.compare(api.compressSync(input), expected)).toBe(0);
    expect(Buffer.compare(input, ttf)).toBe(0);
  });

  it('retries compression after initialization fails', async () => {
    const error = new Error('Initialization failed');
    const output = new Uint8Array([42]);
    const init = vi
      .fn<typeof initEncoder>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        compress: () => output,
        decompress: () => output,
      });
    vi.doMock('../build/woff2-wasm.js', () => ({ default: init }));
    const api = await import('../src/index.ts');

    await expect(api.preload()).rejects.toBe(error);
    expect(() => api.compressSync(ttf)).toThrow(
      expect.objectContaining({
        code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
      })
    );
    await api.preload();

    expect(api.compressSync(ttf)).toBe(output);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it.each(['compressSync', 'compress'] as const)(
    'discards the shared module after a runtime crash in %s',
    async (method) => {
      const error = new WebAssembly.RuntimeError('WASM crashed');
      const output = new Uint8Array([42]);
      const init = vi
        .fn<typeof initEncoder>()
        .mockResolvedValueOnce({
          compress: () => {
            throw error;
          },
          decompress: () => output,
        })
        .mockResolvedValueOnce({
          compress: () => output,
          decompress: () => output,
        });
      vi.doMock('../build/woff2-wasm.js', () => ({ default: init }));
      const api = await import('../src/index.ts');
      await api.preload();

      const call = async () => api[method](ttf);
      await expect(call()).rejects.toBe(error);
      expect(() => api.compressSync(ttf)).toThrow(
        expect.objectContaining({
          code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
        })
      );
      expect(() => api.decompressSync(woff2)).toThrow(
        expect.objectContaining({
          code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
        })
      );
      await api.preload();

      expect(api.compressSync(ttf)).toBe(output);
      expect(api.decompressSync(woff2)).toBe(output);
      expect(init).toHaveBeenCalledTimes(2);
    }
  );
});

describe.each([
  {
    name: 'root',
    wasmPath: '../build/woff2-wasm.js',
    load: () => import('../src/index.ts'),
  },
  {
    name: 'decompress-only',
    wasmPath: '../build/woff2-decompress-wasm.js',
    load: async () => {
      const api = await import('../src/decompress.ts');
      return { ...api, decompress: api.default };
    },
  },
])('$name synchronous decompression', ({ wasmPath, load }) => {
  it('requires initialization and waits for preload to finish', async () => {
    const api = await load();
    const notInitialized = expect.objectContaining({
      code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
    });

    expect(() => api.decompressSync(woff2)).toThrow(notInitialized);
    const pending = api.preload();
    expect(() => api.decompressSync(woff2)).toThrow(notInitialized);
    await pending;

    expect(api.decompressSync(woff2)).toBeInstanceOf(Uint8Array);
  });

  it.each([
    ['og.woff2', 'dec-woff2.ttf'],
    ['enc-ttf.woff2', 'dec-enc-ttf.ttf'],
    ['enc-otf.woff2', 'dec-enc-otf.otf'],
    ['enc-var-ttf.woff2', 'dec-enc-var-ttf.ttf'],
  ])('decompresses %s after preload', async (inputName, expectedName) => {
    const api = await load();
    const input = fs.readFileSync(path.join(__dirname, 'fixtures', inputName));
    const expected = fs.readFileSync(
      path.join(__dirname, 'fixtures', expectedName)
    );
    await api.preload();

    expect(Buffer.compare(api.decompressSync(input), expected)).toBe(0);
    expect(
      Buffer.compare(api.decompressSync(toArrayBuffer(input)), expected)
    ).toBe(0);
  });

  it('works after asynchronous initialization and invalid input', async () => {
    const api = await load();
    const expected = await api.decompress(woff2);

    expect(() => api.decompressSync(new Uint8Array([1, 2, 3, 4]))).toThrow(
      expect.objectContaining({ code: api.Woff2ErrorCode.DECOMPRESS_FAILED })
    );
    expect(api.decompressSync(woff2)).toEqual(expected);
  });

  it('respects Uint8Array view boundaries', async () => {
    const api = await load();
    const expected = fs.readFileSync(
      path.join(__dirname, 'fixtures/dec-woff2.ttf')
    );
    const padded = new Uint8Array(woff2.length + 16).fill(0xff);
    padded.set(woff2, 8);
    const input = padded.subarray(8, 8 + woff2.length);
    await api.preload();

    expect(Buffer.compare(api.decompressSync(input), expected)).toBe(0);
    expect(Buffer.compare(input, woff2)).toBe(0);
  });

  it('enforces the decompressed size limit', async () => {
    const api = await load();
    const oversized = Buffer.from(woff2);
    oversized.writeUInt32BE(api.MAX_DECOMPRESSED_SIZE + 1, 16);
    await api.preload();

    expect(() => api.decompressSync(oversized)).toThrow(
      expect.objectContaining({ code: api.Woff2ErrorCode.MAX_SIZE_EXCEEDED })
    );
    expect(api.decompressSync(woff2)).toBeInstanceOf(Uint8Array);
  });

  it('retries after initialization fails', async () => {
    const error = new Error('Initialization failed');
    const output = new Uint8Array([42]);
    const init = vi
      .fn<typeof initDecoder>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ decompress: () => output });
    vi.doMock(wasmPath, () => ({ default: init }));
    const api = await load();

    await expect(api.preload()).rejects.toBe(error);
    expect(() => api.decompressSync(woff2)).toThrow(
      expect.objectContaining({
        code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
      })
    );
    await api.preload();

    expect(api.decompressSync(woff2)).toBe(output);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it.each(['decompressSync', 'decompress'] as const)(
    'discards a module after a runtime crash in %s',
    async (method) => {
      const error = new WebAssembly.RuntimeError('WASM crashed');
      const output = new Uint8Array([42]);
      const init = vi
        .fn<typeof initDecoder>()
        .mockResolvedValueOnce({
          decompress: () => {
            throw error;
          },
        })
        .mockResolvedValueOnce({ decompress: () => output });
      vi.doMock(wasmPath, () => ({ default: init }));
      const api = await load();
      await api.preload();

      const call = async () => api[method](woff2);
      await expect(call()).rejects.toBe(error);
      expect(() => api.decompressSync(woff2)).toThrow(
        expect.objectContaining({
          code: api.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
        })
      );
      await api.preload();

      expect(api.decompressSync(woff2)).toBe(output);
      expect(init).toHaveBeenCalledTimes(2);
    }
  );
});

describe('entry point initialization', () => {
  it.each(['root', 'decompress-only'])(
    'preloading %s leaves the other entry point uninitialized',
    async (entryPoint) => {
      const rootApi = await import('../src/index.ts');
      const subpathApi = await import('../src/decompress.ts');
      const [initialized, other] =
        entryPoint === 'root' ? [rootApi, subpathApi] : [subpathApi, rootApi];
      await initialized.preload();

      expect(initialized.decompressSync(woff2)).toBeInstanceOf(Uint8Array);
      expect(() => other.decompressSync(woff2)).toThrow(
        expect.objectContaining({
          code: other.Woff2ErrorCode.MODULE_NOT_INITIALIZED,
        })
      );
      await other.preload();

      expect(other.decompressSync(woff2)).toEqual(
        initialized.decompressSync(woff2)
      );
    }
  );
});
