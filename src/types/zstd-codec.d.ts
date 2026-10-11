declare module "zstd-codec/lib/zstd-codec.js" {
  interface ZstdSimple {
    compress(data: Uint8Array, level?: number): Uint8Array
    decompress(data: Uint8Array): Uint8Array
  }
  
  interface ZstdGeneric {
    compressBound(content_bytes: Uint8Array): number
    contentSize(compressed_bytes: Uint8Array): number | null
  }
  
  interface ZstdStreaming {
    compress(content_bytes: Uint8Array, compression_level?: number): Uint8Array
    compressChunks(chunks: Uint8Array[], size_hint?: number, compression_level?: number): Uint8Array
    compressUsingDict(content_bytes: Uint8Array, cdict: any): Uint8Array
    compressChunksUsingDict(chunks: Uint8Array[], size_hint: number, cdict: any): Uint8Array
    decompress(compressed_bytes: Uint8Array, size_hint?: number): Uint8Array
    decompressChunks(chunks: Uint8Array[], size_hint?: number): Uint8Array
    decompressUsingDict(compressed_bytes: Uint8Array, size_hint: number, ddict: any): Uint8Array
    decompressChunksUsingDict(chunks: Uint8Array[], size_hint: number, ddict: any): Uint8Array
  }
  
  interface ZstdDict {
    Compression: new (dict_bytes: Uint8Array, compression_level: number) => { get(): any; close(): void; delete(): void }
    Decompression: new (dict_bytes: Uint8Array) => { get(): any; close(): void; delete(): void }
  }
  
  interface Zstd {
    Simple: new () => ZstdSimple
    Generic: new () => ZstdGeneric
    Streaming: new () => ZstdStreaming
    Dict: {
      Compression: new (dict_bytes: Uint8Array, compression_level: number) => { get(): any; close(): void; delete(): void }
      Decompression: new (dict_bytes: Uint8Array) => { get(): any; close(): void; delete(): void }
    }
  }
  
  export function run(callback: (zstd: Zstd) => void): void
}