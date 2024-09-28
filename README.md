# vite-plugin-svg-sprite

A versatile and lightweight Vite plugin for generating SVG sprites from your SVG files, enabling efficient use of SVG symbols in your application.

## install
Install the plugin as a development dependency:

```bash
npm install vite-plugin-svg-sprite --save-dev
```

or with yarn:

```bash
yarn add vite-plugin-svg-sprite --dev
```

or with pnpm:

```bash
pnpm add vite-plugin-svg-sprite --dev
```

## Usage

To use the plugin, add it to your `vite.config.js` (or `vite.config.ts` for TypeScript projects):

> [!NOTE]
> Note that one of inject or fileName must be provided.

```typescript
import path from 'path';
import svgSpritePlugin from 'vite-plugin-svg-sprite';

export default {
  plugins: [
    svgSpritePlugin({
      /**
       * Specify directories containing SVG files
       * @type {string[]}
       */
      iconDirs: [path.resolve(process.cwd(), 'src/assets/svgs/icons')],

      /**
       * Format for generating unique symbol IDs for each SVG.
       * The default format is [dir]-[name], where:
       * - [dir]: directory name where the SVG resides
       * - [name]: SVG file name (without the extension)
       *
       * Example: "icons-home" for `src/assets/svgs/icons/home.svg`
       * @default '[dir]-[name]'
       */
      symbolId: '[dir]-[name]',

      /**
       * Custom DOM ID to use for the <svg> sprite container.
       * @default 'svg-sprite'
       */
      customDomId: 'svg-sprite',

      /**
       * SVGO configuration object for optimizing SVGs.
       * @default {}
       */
      svgoConfig: {},

      /**
       * Where to inject the generated <svg> sprite in the HTML:
       * - 'body-first': Insert at the beginning of the <body>.
       * - 'body-last': Insert at the end of the <body>.
       * @default 'body-last'
       */
      inject: 'body-last',

      /**
       * Custom file name for the generated SVG sprite file (if not inlined).
       */
      fileName: 'svg-sprite.svg',
    }),
  ],
};
```

### Using the SVG Sprite in Your Application

Once the plugin generates the SVG sprite, you can reference individual icons by their `symbolId` in your application code:

```jsx
// React or Vue component
export const App = () => {
  return (
    <svg>
      <use xlinkHref="#icons-home" />
    </svg>
  );
};
```

You can also manage the `width` and `height` attributes of the SVG by specifying them directly or by using a `size` object for convenience:

```jsx
// React or Vue component
export const App = () => {
  const size = { width: 24, height: 24 }; // Custom size
  return (
    <svg {...size}>
      <use xlinkHref="#icons-home" />
    </svg>
  );
};
```

### Example of Injected SVG

The plugin will inject the following content into your HTML:

```html
<body>
  <svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="svg-sprite">
    <symbol id="icons-home" viewBox="0 0 24 24">
      <!-- SVG path data here -->
    </symbol>
    <!-- Additional symbols for other icons -->
  </svg>
</body>
```

## Configuration Options

| Option         | Type       | Default          | Description                                                                  |
| :------------- | :--------- | :--------------- | :--------------------------------------------------------------------------- |
| `iconDirs`     | `string[]` | `[]`             | Directories where your SVG icons are located.                                |
| `symbolId`     | `string`   | `[dir]-[name]`   | Format for the `symbol` ID. Use `[dir]` and `[name]` as placeholders.        |
| `customDomId`  | `string`   | `svg-sprite`     | ID of the `<svg>` element containing all the symbols.                        |
| `svgoConfig`   | `object`   | `{}`             | Configuration options for [SVGO](https://github.com/svg/svgo) optimization.  |
| `inject`       | `string`   | `'body-last'`    | Where to inject the SVG sprite in the HTML: `'body-first'` or `'body-last'`. |
| `fileName`     | `string`   | `svg-sprite.svg` | Custom file name for the generated sprite file.                              |

## Author

Created by [pivanov](https://github.com/pivanov).

## License

MIT
