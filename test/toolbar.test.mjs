import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import createToolbar, { BUILT_IN } from '../src/index.js';

/**
 * The toolbar over a modeller that does nothing.
 *
 * What is asserted is what the bar shows and in what order, which is the whole of a configuration, and what
 * a button does when it is pressed. Nothing here needs a diagram: the toolbar asks a modeller for its canvas
 * and for the two zoom calls, and for nothing else until a button is pressed.
 */
function toolbar(options = {}) {
  const { document } = parseHTML('<!doctype html><html><body><div id="canvas"></div></body></html>');

  globalThis.document = document;

  const zoomed = [];
  const canvas = { getContainer: () => document.querySelector('#canvas'), zoom: (...args) => zoomed.push(args) };
  const zoomScroll = { stepZoom: (step) => zoomed.push([ 'step', step ]) };

  const modeler = {
    get: (name) => (name === 'canvas' ? canvas : zoomScroll),
    saveXML: () => Promise.resolve({ xml: '<xml/>' }),
    saveSVG: () => Promise.resolve({ svg: '<svg/>' }),
    importXML: () => Promise.resolve({})
  };

  return { document, zoomed, toolbar: createToolbar(modeler, options) };
}

const shown = (document) =>
  [ ...document.querySelectorAll('.bpmn-toolbar button') ].map((button) => button.getAttribute('data-action'));

test('the bar shows what it brings, in the order it brings it', () => {
  const { document } = toolbar();

  assert.deepEqual(shown(document), BUILT_IN);
  assert.deepEqual(BUILT_IN, [ 'load', 'save', 'export', 'center', 'zoom-in', 'zoom-out' ]);
});

test('a configuration is a list of names, and says the order as well as the membership', () => {
  const { document, toolbar: bar } = toolbar({
    configurations: { view: [ 'zoom-out', 'zoom-in', 'center' ] }
  });

  assert.deepEqual(shown(document), BUILT_IN, 'the default until another is named');

  bar.setConfiguration('view');
  assert.deepEqual(shown(document), [ 'zoom-out', 'zoom-in', 'center' ]);
  assert.equal(bar.getConfiguration(), 'view');

  bar.setConfiguration('default');
  assert.deepEqual(shown(document), BUILT_IN, 'and back again');
});

test('a host may state a configuration after the bar is up, and need never use the default', () => {
  const { document, toolbar: bar } = toolbar();

  bar.addConfiguration('files', [ 'load', 'save' ]);
  bar.setConfiguration('files');

  assert.deepEqual(shown(document), [ 'load', 'save' ]);
});

test('a configuration the bar was never given is a wiring mistake and says so', () => {
  const { toolbar: bar } = toolbar();

  assert.throws(() => bar.setConfiguration('nothing'), /configuration <nothing> does not exist/);
});

test('a configuration may name a button before it exists, and takes it when it arrives', () => {
  const { document, toolbar: bar } = toolbar({ configurations: { run: [ 'center', 'follow', 'zoom-in' ] } });

  bar.setConfiguration('run');
  assert.deepEqual(shown(document), [ 'center', 'zoom-in' ], 'what is there, in the stated order');

  bar.addButton('follow', { icon: '<svg/>', type: 'toggle' });
  assert.deepEqual(shown(document), [ 'center', 'follow', 'zoom-in' ],
    'and the button takes the place its configuration gave it');
});

test('a contributed button is drawn as the toolbar draws its own', () => {
  const { document, toolbar: bar } = toolbar();

  bar.addButton('follow', {
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>',
    title: 'Follow the run'
  });
  bar.addConfiguration('run', [ 'center', 'follow' ]);
  bar.setConfiguration('run');

  assert.deepEqual(shown(document), [ 'center', 'follow' ]);

  const button = document.querySelector('[data-action="follow"]');

  assert.equal(button.tagName, 'BUTTON', 'a button, as the toolbar\'s own are');
  assert.equal(button.title, 'Follow the run');
  assert.ok(button.querySelector('svg'), 'and it holds the glyph it was given');
  assert.equal(button.getAttribute('aria-pressed'), null, 'a normal button has no state to carry');
});

test('a toggle carries its state, and reports a press rather than being told what it now is', () => {
  const { document, toolbar: bar } = toolbar();

  const reported = [];

  bar.addButton('follow', { icon: '<svg/>', type: 'toggle', action: (on) => reported.push(on) });
  bar.addConfiguration('run', [ 'follow' ]);
  bar.setConfiguration('run');

  const button = document.querySelector('[data-action="follow"]');

  assert.equal(button.getAttribute('aria-pressed'), 'false', 'off unless it was asked to begin on');

  button.dispatchEvent(new document.defaultView.Event('click'));
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(reported, [ true ]);

  button.dispatchEvent(new document.defaultView.Event('click'));
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(reported, [ true, false ]);
});

test('a toggle may be set from outside, which is not a press and reports nothing', () => {
  const { toolbar: bar } = toolbar();

  const reported = [];

  bar.addButton('follow', { icon: '<svg/>', type: 'toggle', pressed: true, action: (on) => reported.push(on) });

  assert.equal(bar.isPressed('follow'), true, 'a toggle may be asked to begin on');

  bar.setPressed('follow', false);
  assert.equal(bar.isPressed('follow'), false);
  assert.deepEqual(reported, [], 'the host set it, so the host is not told of it');
});

test('a button kept out of the configuration keeps its state and comes back with it', () => {
  const { toolbar: bar } = toolbar();

  bar.addButton('follow', { icon: '<svg/>', type: 'toggle', pressed: true });
  bar.addConfiguration('run', [ 'follow' ]);
  bar.addConfiguration('model', [ 'load' ]);

  bar.setConfiguration('run');
  assert.equal(bar.isPressed('follow'), true);

  bar.setConfiguration('model');
  bar.setConfiguration('run');
  assert.equal(bar.isPressed('follow'), true, 'the buttons are moved about, not built again');
});

test('the view buttons act on the canvas', () => {
  const { document, zoomed } = toolbar();

  document.querySelector('[data-action="center"]').dispatchEvent(new document.defaultView.Event('click'));
  document.querySelector('[data-action="zoom-in"]').dispatchEvent(new document.defaultView.Event('click'));
  document.querySelector('[data-action="zoom-out"]').dispatchEvent(new document.defaultView.Event('click'));

  assert.deepEqual(zoomed, [ [ 'fit-viewport', 'auto' ], [ 'step', 1 ], [ 'step', -1 ] ]);
});

test('the name a file is offered under is the host\'s to read and to set', () => {
  const { toolbar: bar } = toolbar({ fileName: 'order-process' });

  assert.equal(bar.getFileName(), 'order-process');

  bar.setFileName('shipment');
  assert.equal(bar.getFileName(), 'shipment');
});
