import initModule from '../build/woff2-decompress-wasm.js';
import { Woff2Error, Woff2ErrorCode } from './errors.ts';
import { assertDecompressedSizeWithinLimit } from './limits.ts';

export { isWoff2Error, Woff2ErrorCode } from './errors.ts';
export type { Woff2Error } from './errors.ts';
export { MAX_DECOMPRESSED_SIZE } from './limits.ts';

type Encoder = Awaited<ReturnType<typeof initModule>>;

let modulePromise: ReturnType<typeof initModule> | undefined;
let moduleInstance: Encoder | undefined;

/**
 * Asynchronously loads the WOFF2 module. The module is initialized on first
 * call and shared by all subsequent calls. If initialization fails, the error
 * propagates to the caller and the next call retries instead of reusing the
 * failed attempt.
 *
 * @returns A promise resolving to the WOFF2 module.
 * @internal
 */
function loadModule(): ReturnType<typeof initModule> {
  modulePromise ??= initModule()
    .then((encoder) => {
      moduleInstance = encoder;
      return encoder;
    })
    .catch((error: unknown) => {
      modulePromise = undefined;
      moduleInstance = undefined;
      throw error;
    });

  return modulePromise;
}

/**
 * Runs a call against the loaded WOFF2 module. If the call crashes the WASM
 * runtime, the cached module is discarded so the next call re-initializes a
 * fresh instance instead of reusing the dead one.
 *
 * @param callback - The operation to run against the module.
 * @returns The result of the operation.
 * @internal
 */
async function withModule<T>(callback: (encoder: Encoder) => T): Promise<T> {
  return runWithModule(await loadModule(), callback);
}

/**
 * Runs an operation against an initialized module and discards the cached
 * instance if the WASM runtime crashes.
 *
 * @param encoder - The initialized module, if available.
 * @param callback - The operation to run against the module.
 * @returns The result of the operation.
 * @internal
 */
function runWithModule<T>(
  encoder: Encoder | undefined,
  callback: (encoder: Encoder) => T
): T {
  if (!encoder) {
    throw new Woff2Error(Woff2ErrorCode.MODULE_NOT_INITIALIZED);
  }

  try {
    return callback(encoder);
  } catch (error) {
    if (
      error instanceof WebAssembly.RuntimeError &&
      moduleInstance === encoder
    ) {
      modulePromise = undefined;
      moduleInstance = undefined;
    }

    throw error;
  }
}

/**
 * Eagerly initializes the decompression-only WOFF2 module so the first call
 * to `decompress` does not pay the one-time WASM instantiation cost. Calling
 * this is optional for asynchronous operations, which initialize automatically.
 * Await this before calling the synchronous APIs.
 *
 * @returns A promise that resolves once the WOFF2 module is ready.
 */
export async function preload(): Promise<void> {
  await loadModule();
}

/**
 * Decompresses WOFF2 font data back to SFNT (TrueType/OpenType) font data.
 *
 * @param buffer - The WOFF2 font data.
 * @returns A promise resolving to the SFNT font data.
 */
export default async function decompress(
  buffer: ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  assertDecompressedSizeWithinLimit(buffer);

  const result = await withModule((encoder) => encoder.decompress(buffer));
  if (!result) {
    throw new Woff2Error(Woff2ErrorCode.DECOMPRESS_FAILED);
  }

  return result;
}

/**
 * Decompresses WOFF2 font data back to SFNT (TrueType/OpenType) font data.
 *
 * Call and await `preload` before using this function.
 *
 * @throws `Woff2ErrorCode.MODULE_NOT_INITIALIZED` if the module is not ready.
 * @param buffer - The WOFF2 font data.
 * @returns The SFNT font data.
 */
export function decompressSync(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  const result = runWithModule(moduleInstance, (encoder) => {
    assertDecompressedSizeWithinLimit(buffer);
    return encoder.decompress(buffer);
  });
  if (!result) {
    throw new Woff2Error(Woff2ErrorCode.DECOMPRESS_FAILED);
  }

  return result;
}
