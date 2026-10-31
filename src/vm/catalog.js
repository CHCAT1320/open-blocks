const b = (opcode, type, category, inputs = {}, fields = {}, note = '') => ({
  opcode,
  type,
  category,
  inputs,
  fields,
  note
});

export const BLOCKS = [
  b('event_whenflagclicked', 'hat', 'events', {}, {}, 'Runs when the green flag is clicked.'),
  b('event_whenkeypressed', 'hat', 'events', {}, { KEY_OPTION: ['space', 'up arrow', 'down arrow', 'right arrow', 'left arrow', 'any', 'a', 'b', 'c', 'd', '1', '2', '3'] }, 'Runs when a key is pressed.'),
  b('event_whenthisspriteclicked', 'hat', 'events', {}, {}, 'Runs when this sprite is clicked.'),
  b('event_whenstageclicked', 'hat', 'events', {}, {}, 'Runs when the stage is clicked.'),
  b('event_whenbackdropswitchesto', 'hat', 'events', {}, { BACKDROP: 'backdrop' }, 'Runs when the backdrop switches to a named backdrop.'),
  b('event_whengreaterthan', 'hat', 'events', { VALUE: 'number' }, { WHENGREATERTHANMENU: ['LOUDNESS', 'TIMER'] }, 'Runs when loudness or timer is greater than VALUE.'),
  b('event_whenbroadcastreceived', 'hat', 'events', {}, { BROADCAST_OPTION: 'broadcast' }, 'Runs when a broadcast message is received.'),
  b('event_broadcast', 'stack', 'events', { BROADCAST_INPUT: 'broadcast' }, {}, 'Sends a broadcast message and continues.'),
  b('event_broadcastandwait', 'stack', 'events', { BROADCAST_INPUT: 'broadcast' }, {}, 'Sends a broadcast and waits for receivers.'),

  b('motion_movesteps', 'stack', 'motion', { STEPS: 'number' }, {}, 'Moves forward by STEPS.'),
  b('motion_turnright', 'stack', 'motion', { DEGREES: 'number' }, {}, 'Turns clockwise by DEGREES.'),
  b('motion_turnleft', 'stack', 'motion', { DEGREES: 'number' }, {}, 'Turns counter-clockwise by DEGREES.'),
  b('motion_goto', 'stack', 'motion', { TO: 'menu' }, {}, 'Goes to a sprite, mouse pointer, or random position.'),
  b('motion_gotoxy', 'stack', 'motion', { X: 'number', Y: 'number' }, {}, 'Goes to X, Y.'),
  b('motion_glideto', 'stack', 'motion', { SECS: 'number', TO: 'menu' }, {}, 'Glides to a target in SECS seconds.'),
  b('motion_glidesecstoxy', 'stack', 'motion', { SECS: 'number', X: 'number', Y: 'number' }, {}, 'Glides to X, Y in SECS seconds.'),
  b('motion_pointindirection', 'stack', 'motion', { DIRECTION: 'number' }, {}, 'Points in a direction (90 is right).'),
  b('motion_pointtowards', 'stack', 'motion', { TOWARDS: 'menu' }, {}, 'Points towards a target.'),
  b('motion_changexby', 'stack', 'motion', { DX: 'number' }, {}, 'Changes x by DX.'),
  b('motion_setx', 'stack', 'motion', { X: 'number' }, {}, 'Sets x to X.'),
  b('motion_changeyby', 'stack', 'motion', { DY: 'number' }, {}, 'Changes y by DY.'),
  b('motion_sety', 'stack', 'motion', { Y: 'number' }, {}, 'Sets y to Y.'),
  b('motion_ifonedgebounce', 'stack', 'motion', {}, {}, 'Bounces if touching the edge.'),
  b('motion_setrotationstyle', 'stack', 'motion', {}, { STYLE: ['left-right', "don't rotate", 'all around'] }, 'Sets the rotation style.'),
  b('motion_xposition', 'reporter', 'motion', {}, {}, 'Returns x position.'),
  b('motion_yposition', 'reporter', 'motion', {}, {}, 'Returns y position.'),
  b('motion_direction', 'reporter', 'motion', {}, {}, 'Returns direction.'),

  b('looks_say', 'stack', 'looks', { MESSAGE: 'string' }, {}, 'Shows a speech bubble.'),
  b('looks_sayforsecs', 'stack', 'looks', { MESSAGE: 'string', SECS: 'number' }, {}, 'Shows a speech bubble for SECS seconds.'),
  b('looks_think', 'stack', 'looks', { MESSAGE: 'string' }, {}, 'Shows a thought bubble.'),
  b('looks_thinkforsecs', 'stack', 'looks', { MESSAGE: 'string', SECS: 'number' }, {}, 'Shows a thought bubble for SECS seconds.'),
  b('looks_show', 'stack', 'looks', {}, {}, 'Shows the sprite.'),
  b('looks_hide', 'stack', 'looks', {}, {}, 'Hides the sprite.'),
  b('looks_switchcostumeto', 'stack', 'looks', { COSTUME: 'menu' }, {}, 'Switches to a costume.'),
  b('looks_nextcostume', 'stack', 'looks', {}, {}, 'Switches to the next costume.'),
  b('looks_switchbackdropto', 'stack', 'looks', { BACKDROP: 'menu' }, {}, 'Switches the backdrop.'),
  b('looks_switchbackdroptoandwait', 'stack', 'looks', { BACKDROP: 'menu' }, {}, 'Switches the backdrop and waits.'),
  b('looks_nextbackdrop', 'stack', 'looks', {}, {}, 'Switches to the next backdrop.'),
  b('looks_changesizeby', 'stack', 'looks', { CHANGE: 'number' }, {}, 'Changes size by CHANGE.'),
  b('looks_setsizeto', 'stack', 'looks', { SIZE: 'number' }, {}, 'Sets size to SIZE percent.'),
  b('looks_changeeffectby', 'stack', 'looks', { CHANGE: 'number' }, { EFFECT: ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'] }, 'Changes a graphic effect.'),
  b('looks_seteffectto', 'stack', 'looks', { VALUE: 'number' }, { EFFECT: ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'] }, 'Sets a graphic effect.'),
  b('looks_cleargraphiceffects', 'stack', 'looks', {}, {}, 'Clears all graphic effects.'),
  b('looks_gotofrontback', 'stack', 'looks', {}, { FRONT_BACK: ['front', 'back'] }, 'Moves to the front or back layer.'),
  b('looks_goforwardbackward', 'stack', 'looks', { NUM: 'number' }, { FORWARD_BACKWARD: ['forward', 'backward'] }, 'Moves a number of layers forward or backward.'),
  b('looks_costumenumbername', 'reporter', 'looks', {}, { NUMBER_NAME: ['number', 'name'] }, 'Returns costume number or name.'),
  b('looks_backdropnumbername', 'reporter', 'looks', {}, { NUMBER_NAME: ['number', 'name'] }, 'Returns backdrop number or name.'),
  b('looks_size', 'reporter', 'looks', {}, {}, 'Returns size percent.'),

  b('sound_play', 'stack', 'sound', { SOUND_MENU: 'menu' }, {}, 'Plays a sound.'),
  b('sound_playuntildone', 'stack', 'sound', { SOUND_MENU: 'menu' }, {}, 'Plays a sound and waits.'),
  b('sound_stopallsounds', 'stack', 'sound', {}, {}, 'Stops all sounds.'),
  b('sound_changeeffectby', 'stack', 'sound', { VALUE: 'number' }, { EFFECT: ['pitch', 'pan'] }, 'Changes a sound effect.'),
  b('sound_seteffectto', 'stack', 'sound', { VALUE: 'number' }, { EFFECT: ['pitch', 'pan'] }, 'Sets a sound effect.'),
  b('sound_cleareffects', 'stack', 'sound', {}, {}, 'Clears sound effects.'),
  b('sound_changevolumeby', 'stack', 'sound', { VOLUME: 'number' }, {}, 'Changes volume by VOLUME.'),
  b('sound_setvolumeto', 'stack', 'sound', { VOLUME: 'number' }, {}, 'Sets volume to VOLUME.'),
  b('sound_volume', 'reporter', 'sound', {}, {}, 'Returns volume.'),

  b('control_wait', 'stack', 'control', { DURATION: 'number' }, {}, 'Waits DURATION seconds.'),
  b('control_repeat', 'stack', 'control', { TIMES: 'number' }, {}, 'Repeats the SUBSTACK TIMES times.'),
  b('control_forever', 'stack', 'control', {}, {}, 'Repeats the SUBSTACK forever.'),
  b('control_if', 'stack', 'control', { CONDITION: 'boolean' }, {}, 'Runs SUBSTACK if CONDITION is true.'),
  b('control_if_else', 'stack', 'control', { CONDITION: 'boolean' }, {}, 'Runs SUBSTACK if true, SUBSTACK2 otherwise.'),
  b('control_wait_until', 'stack', 'control', { CONDITION: 'boolean' }, {}, 'Waits until CONDITION is true.'),
  b('control_repeat_until', 'stack', 'control', { CONDITION: 'boolean' }, {}, 'Repeats SUBSTACK until CONDITION is true.'),
  b('control_while', 'stack', 'control', { CONDITION: 'boolean' }, {}, 'TurboWarp: repeats SUBSTACK while CONDITION is true.'),
  b('control_stop', 'stack', 'control', {}, { STOP_OPTION: ['all', 'this script', 'other scripts in sprite'] }, 'Stops scripts.'),
  b('control_start_as_clone', 'hat', 'control', {}, {}, 'Runs when a clone starts.'),
  b('control_create_clone_of', 'stack', 'control', { CLONE_OPTION: 'menu' }, {}, 'Creates a clone.'),
  b('control_delete_this_clone', 'stack', 'control', {}, {}, 'Deletes this clone.'),

  b('sensing_touchingobject', 'boolean', 'sensing', { TOUCHINGOBJECTMENU: 'menu' }, {}, 'True if touching a target.'),
  b('sensing_touchingcolor', 'boolean', 'sensing', { COLOR: 'color' }, {}, 'True if touching a color.'),
  b('sensing_coloristouchingcolor', 'boolean', 'sensing', { COLOR: 'color', COLOR2: 'color' }, {}, 'True if a color is touching another color.'),
  b('sensing_distanceto', 'reporter', 'sensing', { DISTANCETOMENU: 'menu' }, {}, 'Returns distance to a target.'),
  b('sensing_askandwait', 'stack', 'sensing', { QUESTION: 'string' }, {}, 'Asks a question and waits.'),
  b('sensing_answer', 'reporter', 'sensing', {}, {}, 'Returns the answer.'),
  b('sensing_keypressed', 'boolean', 'sensing', { KEY_OPTION: 'menu' }, {}, 'True if a key is pressed.'),
  b('sensing_mousedown', 'boolean', 'sensing', {}, {}, 'True if the mouse is down.'),
  b('sensing_mousex', 'reporter', 'sensing', {}, {}, 'Returns mouse x.'),
  b('sensing_mousey', 'reporter', 'sensing', {}, {}, 'Returns mouse y.'),
  b('sensing_setdragmode', 'stack', 'sensing', {}, { DRAG_MODE: ['draggable', 'not draggable'] }, 'Sets draggable mode.'),
  b('sensing_loudness', 'reporter', 'sensing', {}, {}, 'Returns loudness.'),
  b('sensing_timer', 'reporter', 'sensing', {}, {}, 'Returns timer.'),
  b('sensing_resettimer', 'stack', 'sensing', {}, {}, 'Resets the timer.'),
  b('sensing_of', 'reporter', 'sensing', { OBJECT: 'menu' }, { PROPERTY: ['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume', 'layer #'] }, 'Returns a property of a target.'),
  b('sensing_current', 'reporter', 'sensing', {}, { CURRENTMENU: ['year', 'month', 'date', 'dayofweek', 'hour', 'minute', 'second'] }, 'Returns current date/time part.'),
  b('sensing_dayssince2000', 'reporter', 'sensing', {}, {}, 'Returns days since 2000.'),
  b('sensing_username', 'reporter', 'sensing', {}, {}, 'Returns username.'),

  b('operator_add', 'reporter', 'operators', { NUM1: 'number', NUM2: 'number' }, {}, 'Adds NUM1 and NUM2.'),
  b('operator_subtract', 'reporter', 'operators', { NUM1: 'number', NUM2: 'number' }, {}, 'Subtracts NUM2 from NUM1.'),
  b('operator_multiply', 'reporter', 'operators', { NUM1: 'number', NUM2: 'number' }, {}, 'Multiplies NUM1 and NUM2.'),
  b('operator_divide', 'reporter', 'operators', { NUM1: 'number', NUM2: 'number' }, {}, 'Divides NUM1 by NUM2.'),
  b('operator_random', 'reporter', 'operators', { FROM: 'number', TO: 'number' }, {}, 'Returns a random number between FROM and TO.'),
  b('operator_gt', 'boolean', 'operators', { OPERAND1: 'any', OPERAND2: 'any' }, {}, 'True if OPERAND1 > OPERAND2.'),
  b('operator_lt', 'boolean', 'operators', { OPERAND1: 'any', OPERAND2: 'any' }, {}, 'True if OPERAND1 < OPERAND2.'),
  b('operator_equals', 'boolean', 'operators', { OPERAND1: 'any', OPERAND2: 'any' }, {}, 'True if OPERAND1 = OPERAND2.'),
  b('operator_and', 'boolean', 'operators', { OPERAND1: 'boolean', OPERAND2: 'boolean' }, {}, 'Logical AND.'),
  b('operator_or', 'boolean', 'operators', { OPERAND1: 'boolean', OPERAND2: 'boolean' }, {}, 'Logical OR.'),
  b('operator_not', 'boolean', 'operators', { OPERAND: 'boolean' }, {}, 'Logical NOT.'),
  b('operator_join', 'reporter', 'operators', { STRING1: 'string', STRING2: 'string' }, {}, 'Joins two strings.'),
  b('operator_letter_of', 'reporter', 'operators', { LETTER: 'number', STRING: 'string' }, {}, 'Returns a letter of a string.'),
  b('operator_length', 'reporter', 'operators', { STRING: 'string' }, {}, 'Returns string length.'),
  b('operator_contains', 'boolean', 'operators', { STRING1: 'string', STRING2: 'string' }, {}, 'True if STRING1 contains STRING2.'),
  b('operator_mod', 'reporter', 'operators', { NUM1: 'number', NUM2: 'number' }, {}, 'Returns NUM1 mod NUM2.'),
  b('operator_round', 'reporter', 'operators', { NUM: 'number' }, {}, 'Rounds NUM.'),
  b('operator_mathop', 'reporter', 'operators', { NUM: 'number' }, { OPERATOR: ['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'] }, 'Applies a math operation.'),

  b('data_variable', 'reporter', 'variables', {}, { VARIABLE: 'variable' }, 'Returns a variable.'),
  b('data_setvariableto', 'stack', 'variables', { VALUE: 'any' }, { VARIABLE: 'variable' }, 'Sets a variable.'),
  b('data_changevariableby', 'stack', 'variables', { VALUE: 'number' }, { VARIABLE: 'variable' }, 'Changes a variable by VALUE.'),
  b('data_showvariable', 'stack', 'variables', {}, { VARIABLE: 'variable' }, 'Shows a variable monitor.'),
  b('data_hidevariable', 'stack', 'variables', {}, { VARIABLE: 'variable' }, 'Hides a variable monitor.'),
  b('data_listcontents', 'reporter', 'variables', {}, { LIST: 'list' }, 'Returns a list.'),
  b('data_addtolist', 'stack', 'variables', { ITEM: 'any' }, { LIST: 'list' }, 'Adds ITEM to a list.'),
  b('data_deleteoflist', 'stack', 'variables', { INDEX: 'number' }, { LIST: 'list' }, 'Deletes an item from a list.'),
  b('data_deletealloflist', 'stack', 'variables', {}, { LIST: 'list' }, 'Deletes all items from a list.'),
  b('data_insertatlist', 'stack', 'variables', { ITEM: 'any', INDEX: 'number' }, { LIST: 'list' }, 'Inserts ITEM at INDEX.'),
  b('data_replaceitemoflist', 'stack', 'variables', { INDEX: 'number', ITEM: 'any' }, { LIST: 'list' }, 'Replaces an item in a list.'),
  b('data_itemoflist', 'reporter', 'variables', { INDEX: 'number' }, { LIST: 'list' }, 'Returns an item of a list.'),
  b('data_itemnumoflist', 'reporter', 'variables', { ITEM: 'any' }, { LIST: 'list' }, 'Returns the index of an item.'),
  b('data_lengthoflist', 'reporter', 'variables', {}, { LIST: 'list' }, 'Returns list length.'),
  b('data_listcontainsitem', 'boolean', 'variables', { ITEM: 'any' }, { LIST: 'list' }, 'True if a list contains ITEM.'),
  b('data_showlist', 'stack', 'variables', {}, { LIST: 'list' }, 'Shows a list monitor.'),
  b('data_hidelist', 'stack', 'variables', {}, { LIST: 'list' }, 'Hides a list monitor.')
];

export const CATEGORIES = [...new Set(BLOCKS.map(block => block.category))];

export const BLOCK_BY_OPCODE = new Map(BLOCKS.map(block => [block.opcode, block]));

export function searchCatalog(query, category, limit = 40) {
  const q = String(query || '').trim().toLowerCase();
  let results = BLOCKS;
  if (category) {
    results = results.filter(block => block.category === String(category).toLowerCase());
  }
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    results = results.filter(block => {
      const haystack = [
        block.opcode,
        block.category,
        block.type,
        block.note,
        ...Object.keys(block.inputs || {}),
        ...Object.keys(block.fields || {})
      ]
        .join(' ')
        .toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  }
  return results.slice(0, limit);
}

export function formatCatalogBlock(block) {
  return {
    opcode: block.opcode,
    type: block.type,
    category: block.category,
    inputs: block.inputs,
    fields: block.fields,
    note: block.note
  };
}
