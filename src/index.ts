import fs from 'node:fs';
import path from 'node:path';

import * as cheerio from 'cheerio';
import { watch } from 'chokidar';
import { optimize } from 'svgo';

import type { Plugin } from 'vite';

interface SvgSpritePluginOptions {
  iconDirs: string[];
  symbolId?: string;
  svgDomId?: string;
  inject?: 'body-last' | 'body-first';
  svgoConfig?: object;
  fileName?: string;
  outputDir?: string;
  verbose?: boolean;
}

const VIRTUAL_MODULE_ID = 'virtual:svg-sprite';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

const svgSpritePlugin = (options: SvgSpritePluginOptions): Plugin => {
  const {
    iconDirs,
    symbolId = '[dir]-[name]',
    svgDomId,
    svgoConfig = {
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeUnknownsAndDefaults: {
                defaultAttrs: false,
              },
              // Don't minify IDs to keep them readable
              cleanupIds: {
                minify: false,
              },
              // Don't merge paths to preserve structure
              mergePaths: false,
            },
          },
        },
        // Explicitly disable removeViewBox to preserve viewBox attributes
        {
          name: 'removeViewBox',
          active: false,
        },
        {
          name: 'removeAttributesBySelector',
          params: {
            selectors: [
              {
                selector: '*:not(svg)',
                preserve: ['stroke*', 'fill*'],
              },
            ],
          },
        },
      ],
    },
    inject,
    fileName,
    outputDir,
    verbose = true,
  } = options;

  if (!symbolId.includes('[name]')) {
    throw new Error('SymbolId must contain [name] string!');
  }

  let spriteContent = '';
  const svgCache = new Map<string, string>();
  let collectedDefs = '';
  let watcher: ReturnType<typeof watch> | null = null;
  let hasGeneratedSprite = false;
  let viteConfig: any = null;
  let spriteTimestamp = Date.now();

  const log = {
    info: (msg: string) => verbose && console.log(`\n${msg}`),
    warn: (msg: string) => console.warn('⚠️ ', msg),
    error: (msg: string, error?: unknown) =>
      console.error('❌ ', msg, error || ''),
    success: (msg: string) => verbose && console.log('✅ ', msg),
  };

  const generateSymbolId = (filePath: string): string => {
    const { dir, name } = path.parse(filePath);
    const relativeDir = path.relative(process.cwd(), dir).replace(/\\/g, '/');
    const dirName = relativeDir.split('/').pop() || '';
    return symbolId.replace('[dir]', dirName).replace('[name]', name);
  };

  const scanDirForSvgFiles = (dir: string): string[] => {
    const files = fs.readdirSync(dir);
    let allSvgFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);

      if (stat.isDirectory()) {
        allSvgFiles = allSvgFiles.concat(scanDirForSvgFiles(filePath));
      } else if (file.endsWith('.svg')) {
        allSvgFiles.push(filePath);
      }
    }

    return allSvgFiles;
  };

  const generateSvgSprite = async () => {
    const svgSymbolsArray: string[] = [];

    await Promise.all(
      iconDirs.map(async (dir) => {
        const svgFiles = scanDirForSvgFiles(dir);
        await Promise.all(
          svgFiles.map(async (filePath) => {
            try {
              const svgContent = await fs.promises.readFile(filePath, 'utf-8');
              const cacheKey = filePath;
              if (!svgCache.has(cacheKey)) {
                const optimizedSvg = optimize(svgContent, {
                  ...svgoConfig,
                  multipass: true,
                }).data;

                const $ = cheerio.load(optimizedSvg, { xmlMode: true });
                const $svg = $('svg');
                const viewBox = $svg.attr('viewBox') || '0 0 24 24';

                // Create symbol with all original SVG attributes except width/height
                const $symbol = $('<symbol></symbol>')
                  .attr('id', generateSymbolId(filePath))
                  .attr('viewBox', viewBox);

                // Copy all attributes from SVG except width/height
                const attrs = $svg[0].attribs;
                for (const [key, value] of Object.entries(attrs)) {
                  if (key !== 'width' && key !== 'height') {
                    $symbol.attr(key, value);
                  }
                }

                $symbol.append($svg.children());

                const $defs = $svg.find('defs');
                if ($defs.length > 0) {
                  collectedDefs += $defs.html();
                }

                svgCache.set(cacheKey, $.html($symbol));
              }

              const cacheValue = svgCache.get(cacheKey);
              if (cacheValue) {
                svgSymbolsArray.push(cacheValue)
              }
            } catch (error) {
              log.error(
                `Error reading or processing SVG file: ${filePath}`,
                error,
              );
            }
          }),
        );
      }),
    );

    const style = 'position:absolute;width:0;height:0;';
      if (svgSymbolsArray.length > 0) {
      const svgSymbols = svgSymbolsArray.sort().join('');
      const defsContent = collectedDefs ? `<defs>${collectedDefs}</defs>` : '';
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="${style}"${svgDomId ? ` id="${svgDomId}"` : ''}>${defsContent}${svgSymbols}</svg>`;
    } else {
      log.warn('No SVG symbols were generated.');
      spriteContent = `<svg xmlns="http://www.w3.org/2000/svg" style="${style}"${svgDomId ? ` id="${svgDomId}"` : ''}></svg>`;
    }

    return spriteContent;
  };

  const writeSpriteToFile = (
    publicDir: string,
    fileName: string,
    spriteContent: string,
    assetsDir?: string,
  ) => {
    const targetDir = outputDir
      ? path.resolve(publicDir, outputDir)
      : assetsDir
        ? path.join(publicDir, assetsDir)
        : publicDir;

    const fullPath = path.join(targetDir, fileName);
    const finalSpriteContent = `${spriteContent.trim()}\n`;

    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(fullPath, finalSpriteContent);
      log.info(`💫 SVG sprite saved in ${path.relative(process.cwd(), targetDir)}`);
    } catch (error) {
      log.error(`Error writing sprite file: ${fullPath}`, error);
    }
  };

  const createWatcher = (paths: string[], onChange: (path: string) => void) => {
    return watch(paths, {
      ignored: /(^|[\\])\../,
      persistent: true,
      ignoreInitial: true,
      alwaysStat: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    })
      .on('add', onChange)
      .on('change', onChange)
      .on('unlink', onChange)
      .on('error', (error) => log.error('Watcher error:', error));
  };



  return {
    name: 'vite-plugin-svg-sprite',
    enforce: 'pre',

    configResolved: async (config) => {
      viteConfig = config;

      // Reset the generation flag
      hasGeneratedSprite = false;

      // Generate sprite on initial build
      await generateSvgSprite();
      spriteTimestamp = Date.now();

      const isWatchMode = config.command === 'build' && !!config.build.watch;

      // Set up watcher only in watch mode
      if (!watcher && isWatchMode) {
        const absolutePaths = iconDirs.map((dir) =>
          path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir),
        );

        log.info('👀 SVGs');

        watcher = createWatcher(absolutePaths, async (filePath) => {
          if (!filePath.endsWith('.svg')) return;
          try {
            svgCache.clear();
            collectedDefs = '';
            await generateSvgSprite();
            spriteTimestamp = Date.now(); // Force virtual module update

            if (fileName) {
              const publicDir = config.build.outDir;
              writeSpriteToFile(publicDir, fileName, spriteContent, config.build.assetsDir);
            }
          } catch (error) {
            log.error('❌ Error handling SVG change:', error);
          }
        });
      }
    },

    configureServer(server) {
      // Watch SVG files in dev mode
      for (const dir of iconDirs) {
        const absolutePath = path.isAbsolute(dir)
          ? dir
          : path.resolve(process.cwd(), dir);
        server.watcher.add(path.join(absolutePath, '**/*.svg'));
      }

      let debounceTimer: NodeJS.Timeout;
      const handleDevChange = async () => {
        try {
          svgCache.clear();
          collectedDefs = '';
          await generateSvgSprite();
          spriteTimestamp = Date.now(); // Force virtual module update
          log.info('💫 SVG sprite regenerated');

          // Invalidate virtual module and reload
          const mod = server.moduleGraph.getModuleById(
            RESOLVED_VIRTUAL_MODULE_ID,
          );
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'full-reload' });
            log.info('🔄 Page reload triggered');
          }
        } catch (error) {
          log.error('❌ Error handling SVG change:', error);
        }
      };

      // Handle SVG changes with debouncing
      server.watcher.on('all', (event, file) => {
        if (file.endsWith('.svg')) {
          log.info(`💫 SVG ${event}`);
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(handleDevChange, 100);
        }
      });
    },

    closeBundle() {
      // Only close watcher if we're not in watch mode
      if (watcher && !this.meta.watchMode) {
        watcher.close();
        watcher = null;
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return `
          // Updated at: ${spriteTimestamp}
          const sprite = ${JSON.stringify(spriteContent)};
          export default sprite;
        `;
      }
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
      // Write sprite file during bundle generation
      if (fileName && !hasGeneratedSprite) {
        const publicDir = options.dir || 'public';
        writeSpriteToFile(publicDir, fileName, spriteContent, viteConfig?.build?.assetsDir);
        // Mark that we've generated the sprite to prevent multiple writes
        hasGeneratedSprite = true;
      }
    },
  };
};

export default svgSpritePlugin;
