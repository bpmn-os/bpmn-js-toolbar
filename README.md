# bpmn-js-toolbar

An on-canvas toolbar for [bpmn-js](https://github.com/bpmn-io/bpmn-js): load, save, export, centre and zoom,
plus buttons a host contributes and named configurations it switches between.

## Install

```sh
npm install bpmn-js-toolbar
```

## Use

```js
import 'bpmn-js-toolbar/assets/toolbar.css';
import createToolbar from 'bpmn-js-toolbar';

const toolbar = createToolbar(modeler);
```

## Buttons

```js
toolbar.addButton('autoFocus', {
  icon: '<svg viewBox="0 0 24 24">…</svg>',
  type: 'toggle',
  title: 'Auto-focus',
  action: (on) => autoFocus(on)
});
```

The icon is inline SVG, markup or element, stating no size, stroke or colour; the stylesheet states all
three, so a contributed glyph is drawn as the toolbar's own. A `normal` button calls its action on a press. A
`toggle` carries `aria-pressed`: a press writes the state and calls the action with it, `setPressed` writes
it without calling.

The toolbar brings `load`, `save`, `export`, `center`, `zoom-in` and `zoom-out`. Loading and saving use the
File System Access API where the browser has it and fall back to a hidden input and a download where it does
not.

## Configurations

```js
const toolbar = createToolbar(modeler, {
  configurations: {
    model: [ 'load', 'save', 'export', 'center', 'zoom-in', 'zoom-out' ],
    run: [ 'autoFocus', 'center', 'zoom-in', 'zoom-out' ]
  },
  configuration: 'model'
});

toolbar.setConfiguration('run');
```

A configuration is a list of button names and states their order. `default` is the six above and a host need
not use it. A name whose button does not exist yet is passed over and takes its place when it arrives.
Switching moves buttons, so a toggle returns with the state it had. Switching is the host's to call: the
toolbar subscribes to nothing.

## API

`createToolbar(modeler, options)`, with `container` (element or selector, the canvas container by default),
`fileName`, `buttons`, `configurations` and `configuration`. It returns:

- `element`
- `addButton(name, { icon, type, title, action, pressed })` → `{ element, setPressed, isPressed, remove }`
- `removeButton(name)`
- `addConfiguration(name, names)`
- `setConfiguration(name)`, `getConfiguration()` — an unknown name throws
- `setPressed(name, on)`, `isPressed(name)`
- `getFileName()`, `setFileName(name)`

## Theming

`--bpmn-toolbar-bg`, `--bpmn-toolbar-border`, `--bpmn-toolbar-icon`, `--bpmn-toolbar-accent` (hover),
`--bpmn-toolbar-accent-strong` (a toggle that is on), `--bpmn-toolbar-disabled`.

## Development

```sh
npm install
npm test
```

## License

MIT - see [LICENSE](LICENSE).
