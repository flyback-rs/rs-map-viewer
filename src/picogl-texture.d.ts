// PicoGL's Texture class is subclassed in PicoTexture.ts but isn't exported from the package root
declare module "picogl/build/module/texture.js" {
    export const Texture: any;
}
