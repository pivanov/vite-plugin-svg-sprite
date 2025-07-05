# @pivanov/vite-plugin-svg-sprite

A versatile and lightweight Vite plugin for generating SVG sprites from your SVG files, with support for HMR, SVGO optimization, and flexible configuration options.

## Features

- ⚡️ Fast SVG sprite generation
- 🔄 Hot Module Reloading (HMR) support
- 🎨 Preserves important SVG attributes (viewBox, fill, stroke)
- 🛠️ SVGO optimization built-in
- 📁 Multiple icon directory support
- 🔧 Configurable symbol IDs
- 💉 Optional HTML injection
- 📦 File output support
- 👀 Watch mode support

## Install

```bash
npm i -D @pivanov/vite-plugin-svg-sprite
# or
yarn add -D @pivanov/vite-plugin-svg-sprite
# or
pnpm add -D @pivanov/vite-plugin-svg-sprite
```

## Usage

Add the plugin to your `vite.config.ts` (or `vite.config.js`):

```typescript
import path from 'path';
import svgSpritePlugin from '@pivanov/vite-plugin-svg-sprite';

export default {
  plugins: [
    svgSpritePlugin({
      iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      symbolId: '[dir]-[name]',
      svgDomId: 'svg-sprite',
      inject: 'body-last',
    }),
  ],
};
```

### Using SVG Sprites

You can use the generated sprites in two ways:

1. **Direct Import** (when not using inject option):
```typescript
import svgSpriteString from 'virtual:svg-sprite';

const container = document.createElement('div');
const shadow = container.attachShadow({ mode: 'open' });
const sprite = new DOMParser()
  .parseFromString(svgSpriteString, 'image/svg+xml')
  .documentElement;

shadow.appendChild(sprite);
document.body.appendChild(container);
```

2. **Reference in HTML** (works with both methods):
```html
<svg>
  <use href="#icons-home" />
</svg>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `iconDirs` | `string[]` | Required | Directories containing SVG files to be processed into sprites |
| `symbolId` | `string` | `[dir]-[name]` | Format for symbol IDs. Uses placeholders: `[dir]` (directory name) and `[name]` (file name without extension). Example: `[dir]-[name]` for `icons/home.svg` becomes `icons-home` |
| `svgDomId` | `string` | `svg-sprite` | ID attribute for the root SVG sprite element in the DOM |
| `inject` | `'body-last' \| 'body-first'` | `undefined` | Controls where the sprite is injected in the HTML. `body-first` injects at start of body, `body-last` at the end |
| `svgoConfig` | `object` | See SVGO section | Configuration for SVGO optimization. Override default settings for SVG optimization |
| `fileName` | `string` | `undefined` | If provided, saves the sprite to a file instead of injecting it. Example: `sprite.svg` |
| `outputDir` | `string` | `undefined` | Custom output directory for the sprite file. If not specified, uses Vite's `assetsDir` (typically `assets/`) when `fileName` is provided |
| `verbose` | `boolean` | `true` | Enable/disable detailed logging output during plugin operation |

### Default SVGO Configuration

The plugin comes with optimized SVGO defaults:

```typescript
{
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          removeUnknownsAndDefaults: {
            defaultAttrs: false,
          },
          cleanupIds: {
            minify: false,
          },
          mergePaths: false,
        },
      },
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
}
```

## Examples

### Basic Usage with HTML Injection

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  inject: 'body-last'
})
```

### File Output Without Injection

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  fileName: 'sprite.svg'
})
```

### File Output to Assets Directory (Default)

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  fileName: 'sprite.svg'
  // Will output to dist/assets/sprite.svg by default
})
```

### File Output to Custom Directory

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  fileName: 'sprite.svg',
  outputDir: 'static/sprites'
  // Will output to dist/static/sprites/sprite.svg
})
```

### File Output to Root Directory

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  fileName: 'sprite.svg',
  outputDir: '.'
  // Will output to dist/sprite.svg
})
```

### With Custom SVGO Config

```typescript
svgSpritePlugin({
  iconDirs: ['src/icons'],
  symbolId: 'icon-[name]',
  svgoConfig: {
    plugins: [
      {
        name: 'removeAttrs',
        params: { attrs: '(fill|stroke)' }
      }
    ]
  }
})
```

## Generated Sprite Example

The plugin generates a sprite that looks like this:

```html
<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;" id="svg-sprite">
  <defs>
    <!-- Collected definitions from SVGs -->
  </defs>
  <symbol id="icons-home" viewBox="0 0 24 24">
    <!-- SVG content -->
  </symbol>
  <!-- More symbols... -->
</svg>
```

## Author

Created by [pivanov](https://github.com/pivanov)

## License

MIT
