import {
  LOAD_ICON, SAVE_ICON, EXPORT_ICON, CENTER_ICON, ZOOM_IN_ICON, ZOOM_OUT_ICON
} from './icons.js';

export {
  LOAD_ICON, SAVE_ICON, EXPORT_ICON, CENTER_ICON, ZOOM_IN_ICON, ZOOM_OUT_ICON
} from './icons.js';

/**
 * The buttons the toolbar brings, each under the name a configuration calls it by.
 *
 * `load`, `save` and `export` are about the model, and `center`, `zoom-in` and `zoom-out` are about
 * looking at it. The distinction is the host's to use and the toolbar takes no view of it: a configuration
 * is a list of names, and which names belong together is what the host decides.
 */
export const BUILT_IN = [ 'load', 'save', 'export', 'center', 'zoom-in', 'zoom-out' ];

/** The configuration shown when a host names none: everything the toolbar brings, in that order. */
export const DEFAULT_CONFIGURATION = BUILT_IN.slice();

/**
 * An on-canvas toolbar for a bpmn-js modeller.
 *
 * It draws the file and view controls every host would otherwise hand-roll in HTML, CSS and wiring, and it
 * takes buttons it did not build. A contributed button is an icon, a type and an action; the toolbar builds
 * it, so it stands in the bar's own shape and a `toggle` carries the bar's pressed state without its
 * contributor knowing how that is drawn.
 *
 * What the bar shows is a configuration: a named list of button names, the toolbar's own and contributed
 * ones alike, in the order they are to stand. A host may state as many as it likes and switch between them
 * at any time, and it need not use the default at all. The toolbar neither knows nor asks why a
 * configuration changes.
 *
 * The stylesheet is not imported here, so that the package is plain ESM a bundler need not be taught about:
 *
 *     import 'bpmn-js-toolbar/assets/toolbar.css';
 *     import createToolbar from 'bpmn-js-toolbar';
 *
 *     const toolbar = createToolbar(modeler);
 *
 * @param {Object} modeler  a bpmn-js modeller: `saveXML`, `saveSVG`, `importXML` and `get`
 * @param {Object} [options]
 * @param {Element|string} [options.container]  where to mount, the canvas container by default
 * @param {string} [options.fileName='diagram']  the base name a saved file is offered under
 * @param {Object} [options.buttons]  buttons to add, by name, each as `addButton` takes them
 * @param {Object} [options.configurations]  named lists of button names, beside `default`
 * @param {string} [options.configuration='default']  the one to show
 * @return {{ element: Element, addButton: Function, removeButton: Function, setConfiguration: Function,
 *          getConfiguration: Function, addConfiguration: Function, setPressed: Function,
 *          isPressed: Function, getFileName: Function, setFileName: Function }}
 */
export default function createToolbar(modeler, options = {}) {
  const canvas = modeler.get('canvas');
  const container = resolveContainer(options.container) || canvas.getContainer();

  let fileName = options.fileName || 'diagram';

  // A shared picker id lets the browser remember the last-used folder across load and save, and across
  // sessions. The SVG export keeps its own, so that images and models are offered where each was last put.
  const BPMN_PICKER_ID = 'bpmn-toolbar';
  const SVG_PICKER_ID = 'bpmn-toolbar-svg';
  const BPMN_TYPES = [ { description: 'BPMN diagram', accept: { 'application/xml': [ '.bpmn', '.xml' ] } } ];
  const SVG_TYPES = [ { description: 'SVG image', accept: { 'image/svg+xml': [ '.svg' ] } } ];
  const hasLoadPicker = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
  const hasSavePicker = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

  const element = el('div', 'bpmn-toolbar');
  const list = el('ul', null);

  element.appendChild(list);
  container.appendChild(element);

  // Every button the toolbar knows, drawn once and held under its name. A configuration decides which of
  // them stand in the bar and in what order, so switching one moves elements about rather than building
  // them: a button keeps its pressed state, and a host keeps whatever it holds of it.
  const buttons = new Map();

  const configurations = new Map([ [ 'default', DEFAULT_CONFIGURATION ] ]);

  Object.entries(options.configurations || {}).forEach(([ name, names ]) => {
    configurations.set(name, names.slice());
  });

  let configuration = options.configuration || 'default';

  addButton('load', { icon: LOAD_ICON, title: 'Load BPMN diagram', action: load });
  addButton('save', { icon: SAVE_ICON, title: 'Save BPMN diagram', action: save });
  addButton('export', { icon: EXPORT_ICON, title: 'Export as SVG image', action: exportSVG });
  addButton('center', {
    icon: CENTER_ICON, title: 'Center', action: () => canvas.zoom('fit-viewport', 'auto')
  });
  addButton('zoom-in', {
    icon: ZOOM_IN_ICON, title: 'Zoom in', action: () => modeler.get('zoomScroll').stepZoom(1)
  });
  addButton('zoom-out', {
    icon: ZOOM_OUT_ICON, title: 'Zoom out', action: () => modeler.get('zoomScroll').stepZoom(-1)
  });

  Object.entries(options.buttons || {}).forEach(([ name, button ]) => addButton(name, button));

  // The fallback for a browser without the File System Access API: an input that is never shown, so that
  // its native "No file selected" tooltip never appears, and which is emptied after every read so that the
  // same file may be loaded twice.
  let loadInput = null;

  if (!hasLoadPicker) {
    loadInput = el('input', null);
    loadInput.type = 'file';
    loadInput.accept = '.bpmn,.xml';
    loadInput.style.display = 'none';
    element.appendChild(loadInput);
    loadInput.addEventListener('change', (event) => {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        fileName = baseName(file.name);
        modeler.importXML(reader.result);
      };
      reader.readAsText(file);
      loadInput.value = '';
    });
  }

  apply();

  /**
   * Add a button, or replace one of the same name.
   *
   * @param {string} name  what a configuration calls it by
   * @param {Object} button
   * @param {string|Element} button.icon  inline SVG, drawn at the bar's size and in its colour
   * @param {'normal'|'toggle'} [button.type='normal']  a toggle carries a pressed state
   * @param {string} [button.title]  what it says when pointed at
   * @param {Function} [button.action]  called on a press, a toggle's with its new state
   * @param {boolean} [button.pressed=false]  what a toggle is to begin as
   * @return {{ element: Element, setPressed: Function, isPressed: Function, remove: Function }}
   */
  function addButton(name, button) {
    if (buttons.has(name)) {
      removeButton(name);
    }

    const { icon, type = 'normal', title, action, pressed = false } = button;

    const item = el('li', null);
    const control = el('button', null);

    control.type = 'button';
    control.setAttribute('data-action', name);

    if (title) {
      control.title = title;
    }

    if (typeof icon === 'string') {
      control.innerHTML = icon;
    } else if (icon) {
      control.appendChild(icon);
    }

    // A toggle's state is the toolbar's own: it is what the button draws, so a press writes it and reports
    // it, and whoever asked for the button sets it rather than redrawing from outside.
    if (type === 'toggle') {
      control.setAttribute('aria-pressed', String(!!pressed));
    }

    control.addEventListener('click', (event) => {
      event.preventDefault();

      if (type === 'toggle') {
        const next = control.getAttribute('aria-pressed') !== 'true';

        control.setAttribute('aria-pressed', String(next));
        action && action(next);

        return;
      }

      action && action();
    });

    item.appendChild(control);

    const handle = {
      element: control,
      setPressed: (on) => setPressed(name, on),
      isPressed: () => isPressed(name),
      remove: () => removeButton(name)
    };

    buttons.set(name, { item, control, type, handle });
    apply();

    return handle;
  }

  function removeButton(name) {
    const button = buttons.get(name);

    if (!button) {
      return;
    }

    remove(button.item);
    buttons.delete(name);
  }

  /** State a configuration, or restate one, without showing it. */
  function addConfiguration(name, names) {
    configurations.set(name, names.slice());

    if (name === configuration) {
      apply();
    }
  }

  /** Show a configuration. A name the toolbar was never given is a wiring mistake and says so. */
  function setConfiguration(name) {
    if (!configurations.has(name)) {
      throw new Error('configuration <' + name + '> does not exist');
    }

    configuration = name;
    apply();
  }

  function getConfiguration() {
    return configuration;
  }

  function setPressed(name, on) {
    const button = buttons.get(name);

    if (button && button.type === 'toggle') {
      button.control.setAttribute('aria-pressed', String(on !== false));
    }
  }

  function isPressed(name) {
    const button = buttons.get(name);

    return !!button && button.control.getAttribute('aria-pressed') === 'true';
  }

  /**
   * Put the current configuration in the bar: the buttons it names that the bar holds, in the order it
   * names them, and nothing else. Appending an element that is already there moves it, which is the whole
   * of the reorder.
   *
   * A name the bar does not hold is passed over rather than refused, so that a configuration may be stated
   * before the buttons it names are contributed and a host may declare its whole bar in one place. The
   * button appears when it arrives, in the position its configuration gives it.
   */
  function apply() {
    const names = configurations.get(configuration) || [];

    buttons.forEach((button) => remove(button.item));

    names.forEach((name) => {
      const button = buttons.get(name);

      if (button) {
        list.appendChild(button.item);
      }
    });
  }

  function load() {
    if (hasLoadPicker) {
      loadWithPicker().catch(ignoreAbort);

      return;
    }

    loadInput.click();
  }

  async function loadWithPicker() {
    const [ handle ] = await window.showOpenFilePicker({ id: BPMN_PICKER_ID, types: BPMN_TYPES });
    const file = await handle.getFile();

    fileName = baseName(file.name);
    modeler.importXML(await file.text());
  }

  function save() {
    return modeler.saveXML({ format: true }).then(({ xml }) =>
      saveFile(BPMN_PICKER_ID, fileName + '.bpmn', BPMN_TYPES, xml, 'text/xml'));
  }

  function exportSVG() {
    return modeler.saveSVG({ format: true }).then(({ svg }) =>
      saveFile(SVG_PICKER_ID, fileName + '.svg', SVG_TYPES, svg, 'image/svg+xml'));
  }

  async function saveFile(id, suggestedName, types, text, mimeType) {
    if (hasSavePicker) {
      try {
        const handle = await window.showSaveFilePicker({ id, suggestedName, types });
        const writable = await handle.createWritable();

        await writable.write(text);
        await writable.close();
      } catch (err) {
        ignoreAbort(err);
      }

      return;
    }

    downloadText(suggestedName, text, mimeType);
  }

  return {
    element,
    addButton,
    removeButton,
    addConfiguration,
    setConfiguration,
    getConfiguration,
    setPressed,
    isPressed,
    getFileName: () => fileName,
    setFileName: (name) => { fileName = name; }
  };
}

function el(tag, className) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  return node;
}

function remove(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

function resolveContainer(container) {
  if (!container) {
    return null;
  }

  return typeof container === 'string' ? document.querySelector(container) : container;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

function ignoreAbort(err) {
  if (err && err.name !== 'AbortError') {
    console.warn(err);
  }
}

function downloadText(filename, text, mimeType) {
  const anchor = document.createElement('a');

  anchor.setAttribute('href', 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(text));
  anchor.setAttribute('download', filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
