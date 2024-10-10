import fs from 'fs';
import path from 'path';

import * as cheerio from 'cheerio';
import { watch } from 'chokidar';
import debounce from 'lodash.debounce';
import { optimize } from 'svgo';

import type { Plugin, ViteDevServer } from 'vite';

interface SvgSpritePluginOptions {
  iconDirs: string[];
  symbolId: string;
  svgDomId: string;
  inject?: 'body-last' | 'body-first';
  svgoConfig?: object;
  fileName?: string;
}

const svgSpritePlugin = (options: SvgSpritePluginOptions): Plugin => {
  const {
    iconDirs,
    symbolId = '[dir]-[name]',
    svgDomId = 'svg-sprite',
    svgoConfig = {
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeTitle: false,
              removeViewBox: false,
              cleanupIds: {
                minify: false,
              },
            },
          },
        },
      ],
    },
    inject,
    fileName,
  } = options;

  if (!symbolId.includes('[name]')) {
    throw new Error('SymbolId must contain [name] string!');
  }

  if (!inject && !fileName) {
    throw new Error('Inject or fileName must be provided!');
  }

  const generateSymbolId = (filePath: string): string => {
    const { dir, name } = path.parse(filePath);
    const relativeDir = path.relative(process.cwd(), dir).replace(/\\/g, '/');
    const dirName = relativeDir.split('/').pop() || '';
    return symbolId
      .replace('[dir]', dirName)
      .replace('[name]', name);
  };

  let spriteContent = '';
  const svgCache = new Map<string, string>();
  let collectedDefs = ''; // Store all defs from the SVGs

  // Recursively scan directories for SVG files and generate the sprite content
  const scanDirForSvgFiles = (dir: string): string[] => {
    const files = fs.readdirSync(dir);
    let allSvgFiles: string[] = [];

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);

      if (stat.isDirectory()) {
        allSvgFiles = allSvgFiles.concat(scanDirForSvgFiles(filePath));
      } else if (file.endsWith('.svg')) {
        allSvgFiles.push(filePath);
      }
    });

    return allSvgFiles;
  };

  // Generate the SVG sprite content
  const generateSvgSprite = async () => {
    let svgSymbols = '';

    await Promise.all(iconDirs.map(async (dir) => {
      const svgFiles = scanDirForSvgFiles(dir);
      await Promise.all(svgFiles.map(async (filePath) => {
        try {
          const svgContent = await fs.promises.readFile(filePath, 'utf-8');
          const cacheKey = filePath;
          if (!svgCache.has(cacheKey)) {
            const optimizedSvg = optimize(svgContent, { ...svgoConfig, multipass: true }).data;

            const $ = cheerio.load(optimizedSvg, { xmlMode: true });
            const $svg = $('svg');
            const viewBox = $svg.attr('viewBox') || '0 0 24 24';
            const $symbol = $('<symbol></symbol>')
              .attr('id', generateSymbolId(filePath))
              .attr('viewBox', viewBox);

            // Append all children of the SVG to the <symbol> tag
            $symbol.append($svg.children());

            // Extract and collect all <defs> from the SVG
            const $defs = $svg.find('defs');
            if ($defs.length > 0) {
              collectedDefs += $defs.html(); // Collect inner content of <defs>
            }

            svgCache.set(cacheKey, $.html($symbol)); // Store optimized SVG in cache
          }

          svgSymbols += svgCache.get(cacheKey);
        } catch (error) {
          console.error(`Error reading or processing SVG file: ${filePath}`, error);
        }
      }));
    }));

    const style = 'position:absolute;width:0;height:0;';

    if (svgSymbols.length > 0) {
      // Add collected <defs> at the top of the sprite, before all <symbol> tags
      const defsContent = collectedDefs ? `<defs>${collectedDefs}</defs>` : '';
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="${style}" id="${svgDomId}">${defsContent}${svgSymbols}</svg>`;
    } else {
      console.warn('No SVG symbols were generated.');
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="${style}" id="${svgDomId}"></svg>`;
    }

    return spriteContent;
  };

  // Write the sprite to the file system only if content has changed
  const writeSpriteToFile = (publicDir: string, fileName: string, spriteContent: string) => {
    const fullPath = path.join(publicDir, fileName);

    const finalSpriteContent = spriteContent.trim() + '\n';

    try {
      if (fs.existsSync(fullPath)) {
        const existingContent = fs.readFileSync(fullPath, 'utf-8');
        if (existingContent === finalSpriteContent) {
          return;
        }
      }

      fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(fullPath, finalSpriteContent);
    } catch (error) {
      console.error(`Error writing sprite file: ${fullPath}`, error);
    }
  };

  const watchSvgDirs = (server: ViteDevServer) => {
    const watcher = watch(iconDirs, { ignored: /(^|[\\])\../, persistent: true });

    const triggerHMR = () => {
      server.ws.send({
        type: 'full-reload',
        path: '*',
      });
    };

    const handleSvgChange = debounce(async (filePath: string, eventType: string) => {
      if (filePath.endsWith('.svg')) {
        svgCache.clear(); // Clear cache on any SVG change
        await generateSvgSprite();
        triggerHMR();

        const pivanov = '1982';
        const pivanov2 = '1982';

        const publicDir = server.config.publicDir || 'public';
        if (fileName) {
          writeSpriteToFile(publicDir, fileName, spriteContent);
        }
      }
    }, 300);

    watcher.on('add', (filePath) => handleSvgChange(filePath, 'added'));
    watcher.on('change', (filePath) => handleSvgChange(filePath, 'changed'));
    watcher.on('unlink', (filePath) => handleSvgChange(filePath, 'removed'));
  };

  return {
    name: 'vite-plugin-svg-sprite',
    enforce: 'pre',

    configResolved: async () => {
      await generateSvgSprite();
    },

    configureServer: (server: ViteDevServer) => {
      watchSvgDirs(server);
    },

    transformIndexHtml: (html: string) => {
      if (inject) {
        const $ = cheerio.load(html);

        switch (inject) {
          case 'body-first':
            $('body').prepend(spriteContent);
            break;
          default:
            $('body').append(spriteContent);
        }

        return $.html();
      }

      return html;
    },

    generateBundle(this, options) {
      if (fileName && !inject) {
        const publicDir = options.dir || 'public';
        writeSpriteToFile(publicDir, fileName, spriteContent);
      }
    },
  };
};

export default svgSpritePlugin;
