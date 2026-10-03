/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'open-location-code' {
  export class OpenLocationCode {
    encode(latitude: number, longitude: number, codeLength?: number): string
    shorten(code: string, latitude: number, longitude: number): string
  }
}
/// <reference types="vite-plugin-pwa/client" />
