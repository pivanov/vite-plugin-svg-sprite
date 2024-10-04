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
    svgoConfig = {},
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
      .replace('[dir]', dirName) // Use the subdirectory name (e.g., "icon" or "logo")
      .replace('[name]', name); // Use the SVG file name (without the extension)
  };

  let spriteContent = '';
  const svgCache = new Map<string, string>();

  // Recursively scan directories for SVG files and generate the sprite content
  const scanDirForSvgFiles = (dir: string): string[] => {
    const files = fs.readdirSync(dir);
    let allSvgFiles: string[] = [];

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);

      if (stat.isDirectory()) {
        // Recursively scan subdirectories
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
          const cacheKey = filePath; // Cache based on file path
          if (!svgCache.has(cacheKey)) {
            const optimizedSvg = optimize(svgContent, { ...svgoConfig, multipass: true }).data;

            const $ = cheerio.load(optimizedSvg, { xmlMode: true });
            const $svg = $('svg');
            const viewBox = $svg.attr('viewBox') || '0 0 24 24'; // Ensure viewBox exists
            const $symbol = $('<symbol></symbol>')
              .attr('id', generateSymbolId(filePath))
              .attr('viewBox', viewBox);

            // Append all children of the SVG to the <symbol> tag
            $symbol.append($svg.children());

            svgCache.set(cacheKey, $.html($symbol)); // Store optimized SVG in cache
          }

          svgSymbols += svgCache.get(cacheKey);
        } catch (error) {
          console.error(`Error reading or processing SVG file: ${filePath}`, error);
        }
      }));
    }));

    if (svgSymbols.length > 0) {
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="${svgDomId}">${svgSymbols}</svg>`;
    } else {
      console.warn('No SVG symbols were generated.');
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="${svgDomId}"></svg>`;
    }

    return spriteContent;
  };

  // Write the sprite to the file system
  // Write the sprite to the file system only if content has changed
  const writeSpriteToFile = (publicDir: string, fileName: string, spriteContent: string) => {
    const fullPath = path.join(publicDir, fileName);

    // Ensure a newline at the end of the sprite content
    const finalSpriteContent = spriteContent.trim() + '\n';

    try {
      // Check if the file exists and read its current content
      if (fs.existsSync(fullPath)) {
        const existingContent = fs.readFileSync(fullPath, 'utf-8');

        // Only write the file if the content has changed
        if (existingContent === finalSpriteContent) {
          // console.info(`No changes detected in ${fileName}, skipping file write.`);
          return;
        }
      }

      fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(fullPath, finalSpriteContent);
      // console.info(`SVG sprite written to: ${fullPath}`);
    } catch (error) {
      console.error(`Error writing sprite file: ${fullPath}`, error);
    }
  };

  // Function to watch SVG directories using chokidar and trigger HMR
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
        // console.info(`SVG icon ${eventType}: ${filePath}`);
        svgCache.clear(); // Clear cache on any SVG change
        await generateSvgSprite();
        triggerHMR();

        // Write the sprite file during development mode
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
      await generateSvgSprite(); // Generate sprite when the config is resolved
    },

    configureServer: (server: ViteDevServer) => {
      watchSvgDirs(server); // Watch for changes during dev and trigger HMR
    },

    transformIndexHtml: (html: string) => {
      if (inject) {
        // Load the HTML into Cheerio for DOM manipulation
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
        const publicDir = options.dir || 'public'; // Output to public by default
        writeSpriteToFile(publicDir, fileName, spriteContent);
      }
    },
  };
};

export default svgSpritePlugin;
