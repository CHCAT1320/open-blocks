import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_BY_OPCODE, CATEGORIES, searchCatalog } from '../src/vm/catalog.js';

test('core catalog contains common blocks and input metadata', () => {
  const repeat = BLOCK_BY_OPCODE.get('control_repeat');
  assert.ok(repeat);
  assert.equal(repeat.type, 'stack');
  assert.equal(repeat.inputs.TIMES, 'number');
  assert.ok(CATEGORIES.includes('control'));
  assert.ok(CATEGORIES.includes('variables'));
});

test('search finds blocks by opcode, input and field', () => {
  assert.ok(searchCatalog('movesteps', null, 20).some(block => block.opcode === 'motion_movesteps'));
  assert.ok(searchCatalog('KEY_OPTION', null, 20).some(block => block.opcode === 'event_whenkeypressed'));
  assert.ok(searchCatalog('variable', 'variables', 20).length > 0);
  assert.equal(searchCatalog('definitely-not-a-block', null, 20).length, 0);
});
