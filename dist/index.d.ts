import type { Plugin } from 'vite';
interface SvgSpritePluginOptions {
    iconDirs: string[];
    symbolId: string;
    svgDomId: string;
    inject?: 'body-last' | 'body-first';
    svgoConfig?: object;
    fileName?: string;
}
declare const svgSpritePlugin: (options: SvgSpritePluginOptions) => Plugin;
export default svgSpritePlugin;
