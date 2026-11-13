import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('Garmin properties.xml, settings.xml, and strings.xml stay in sync', () => {
  const propertiesXml = readText('resources/settings/properties.xml');
  const settingsXml = readText('resources/settings/settings.xml');
  const stringsXml = readText('resources/strings/strings.xml');

  const propIds = [...propertiesXml.matchAll(/<property\s+id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(propIds.length >= 9, `Expected >= 9 properties, found ${propIds.length}`);

  const settingPropKeys = [...settingsXml.matchAll(/propertyKey="@Properties\.([^"]+)"/g)].map(
    (m) => m[1]
  );
  for (const id of propIds) {
    assert.ok(
      settingPropKeys.includes(id),
      `Property "${id}" in properties.xml is missing from settings.xml`
    );
  }
  for (const key of settingPropKeys) {
    assert.ok(
      propIds.includes(key),
      `Setting "@Properties.${key}" in settings.xml is missing from properties.xml`
    );
  }

  const stringIds = new Set(
    [...stringsXml.matchAll(/<string\s+id="([^"]+)"/g)].map((m) => m[1])
  );
  const referencedStrings = [...settingsXml.matchAll(/@Strings\.([A-Za-z0-9_]+)/g)].map(
    (m) => m[1]
  );
  assert.ok(referencedStrings.length > 0);
  for (const strId of referencedStrings) {
    assert.ok(
      stringIds.has(strId),
      `Referenced "@Strings.${strId}" in settings.xml is missing from strings.xml`
    );
  }
});

test('RouteDataField.mc Properties.getValue keys match properties.xml', () => {
  const propertiesXml = readText('resources/settings/properties.xml');
  const dataFieldMc = readText('source/RouteDataField.mc');

  const propIds = new Set(
    [...propertiesXml.matchAll(/<property\s+id="([^"]+)"/g)].map((m) => m[1])
  );
  const usedKeys = [...dataFieldMc.matchAll(/Properties\.getValue\("([^"]+)"\)/g)].map(
    (m) => m[1]
  );
  assert.ok(usedKeys.length > 0);
  for (const key of usedKeys) {
    assert.ok(
      propIds.has(key),
      `Properties.getValue("${key}") in RouteDataField.mc is not defined in properties.xml`
    );
  }
});

test('web/index.html simulator exposes all watch setting toggles and speed presets', () => {
  const indexHtml = readText('web/index.html');
  const expectedIds = [
    'simSpeedSelect',
    'simRangeSlider',
    'toggleDirection',
    'toggleDim',
    'toggleAnchors',
    'toggleTurnCue',
    'toggleProgress',
    'toggleVibration',
    'simLayoutSelect',
  ];
  for (const id of expectedIds) {
    assert.ok(
      indexHtml.includes(`id="${id}"`),
      `web/index.html is missing expected control id="${id}"`
    );
  }
});
