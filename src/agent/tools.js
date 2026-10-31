import {
  addCostume,
  createSprite,
  createVariable,
  deleteSprite,
  exportProject,
  getTargetByName,
  getTargetScripts,
  getVM,
  pushSnapshot,
  redoLastSnapshot,
  renameSprite,
  restoreLastSnapshot,
  runProject,
  setBackdrop,
  setSpriteProps,
  setStageProps,
  setVariableValue,
  stopProject,
  summarizeProject
} from '../vm/api.js';
import { addScripts, clearScripts, deleteBlock, deleteScript, editBlock, insertBlock, moveBlock } from '../vm/builder.js';
import { deleteCostume, deleteSound, deleteVariable, renameCostume, renameSound, renameVariable, reorderCostume, reorderSound } from '../vm/parts.js';
import { deleteCheckpoint, listCheckpoints, loadCheckpoint } from '../vm/checkpoints.js';
import { captureStage, getRuntimeState, waitSeconds, waitUntil } from '../vm/runtime.js';
import { findReferences, searchProject } from '../vm/search.js';
import { CATEGORIES, formatCatalogBlock, searchCatalog } from '../vm/catalog.js';
import { clampNumber } from '../util/format.js';

const objectSchema = (description) => ({
  type: 'object',
  description,
  additionalProperties: true
});

function extensionCatalogEntries() {
  try {
    const runtime = getVM().runtime;
    const categories = Array.isArray(runtime._blockInfo) ? runtime._blockInfo : [];
    const entries = [];
    for (const category of categories) {
      if (!category || !Array.isArray(category.blocks)) continue;
      for (const item of category.blocks) {
        const info = item && item.info;
        if (!info || !info.opcode) continue;
        const inputs = {};
        for (const [name, argument] of Object.entries(info.arguments || {})) {
          inputs[name] = argument && argument.type ? argument.type : 'string';
        }
        entries.push({
          opcode: `${category.id}_${info.opcode}`,
          type: info.blockType || 'command',
          category: category.id,
          inputs,
          fields: {},
          note: info.text || '',
          extension: true,
          arguments: info.arguments || {}
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function searchAllCatalog(query, category, limit) {
  const core = searchCatalog(query, category, limit);
  const q = String(query || '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const extension = extensionCatalogEntries().filter(block => {
    if (category && block.category !== category) return false;
    if (!terms.length) return true;
    const haystack = [block.opcode, block.category, block.note, ...Object.keys(block.inputs)].join(' ').toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
  return [...core, ...extension].slice(0, limit);
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_project',
    description:
      'Read the live TurboWarp project. Use detail="summary" for sprites, variables, costumes, and script counts. Use detail="scripts" (optionally with target) to read readable block scripts and their top-level script ids. Use detail="full" for both. Always inspect before making complex changes.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Optional sprite or Stage name for script details.' },
        detail: { type: 'string', enum: ['summary', 'scripts', 'full'], description: 'How much project data to return. scripts/full include a blocks array with ids, parent/next links, inputs and fields.' },
        max_blocks: { type: 'number', description: 'Maximum blocks to render for script details (20-800).' }
      }
    },
    handler(args) {
      const detail = args.detail || 'summary';
      const maxBlocks = clampNumber(args.max_blocks, 20, 800, 300);
      if (detail === 'scripts') return getTargetScripts(args.target, maxBlocks);
      if (detail === 'full') {
        return {
          summary: summarizeProject(),
          scripts: getTargetScripts(args.target, maxBlocks)
        };
      }
      return summarizeProject();
    }
  },
  {
    name: 'get_block_catalog',
    description:
      'Search the built-in Scratch 3 / TurboWarp block catalog. Returns exact opcodes, input names/types, field names/options, and notes. Call this whenever you are unsure about an opcode, input name, or dropdown field. Search by keyword such as "repeat", "touching", "variable", "costume", or filter by category.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search for in opcodes, inputs, fields, and descriptions.' },
        category: { type: 'string', description: 'Optional block category filter (core category or loaded extension id).' },
        limit: { type: 'number', description: 'Maximum results (1-80).' }
      }
    },
    handler(args) {
      const limit = clampNumber(args.limit, 1, 80, 40);
      const blocks = searchAllCatalog(args.query, args.category, limit);
      const extensionCategories = [...new Set(extensionCatalogEntries().map(block => block.category))];
      return {
        categories: [...CATEGORIES, ...extensionCategories],
        extensions: extensionCategories,
        count: blocks.length,
        blocks: blocks.map(block => (block.extension ? block : formatCatalogBlock(block))),
        hint:
          'Use fields for dropdowns (e.g. KEY_OPTION). Use inputs for values/reporters. Menu inputs accept plain strings; the builder creates the correct menu shadow block. Extension blocks use the full opcode shown here.'
      };
    }
  },
  {
    name: 'get_runtime_state',
    description:
      'Read live runtime state after running the project: running/thread count, FPS, timer, clone counter, stage and sprite variables/lists, sprite position/size/costume/clone counts, visible monitors and active threads. Use this to verify behavior instead of guessing. Pass target to focus on one sprite, or omit for all.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Optional sprite name to limit sprite details.' }
      }
    },
    handler(args) {
      return getRuntimeState(args.target);
    }
  },
  {
    name: 'search_project',
    description:
      'Search the whole project (all sprites and Stage) by text. Matches opcodes, block text, field values, variable/list values, costume names and sound names. Returns block ids and script ids. Works across multiple sprites; pass target to narrow the search.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text, opcode, variable name or value to find.' },
        target: { type: 'string', description: 'Optional sprite/Stage name.' },
        limit: { type: 'number', description: 'Maximum matches (1-200).' }
      },
      required: ['query']
    },
    handler(args) {
      return searchProject(args);
    }
  },
  {
    name: 'find_references',
    description:
      'Find every block that references a variable, list, broadcast, costume, sound or sprite name across all sprites. Use this before renaming/deleting or when you need to know the impact of a change.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable/list/broadcast/costume/sound/sprite name.' },
        type: { type: 'string', enum: ['variable', 'list', 'broadcast', 'costume', 'sound', 'sprite'], description: 'Default variable.' },
        target: { type: 'string', description: 'Optional sprite/Stage filter.' }
      },
      required: ['name']
    },
    handler(args) {
      return findReferences(args);
    }
  },
  {
    name: 'create_sprite',
    description:
      'Create a new sprite with a generated placeholder costume. Returns the final unique name. Use add_costume afterwards to replace or extend its look. Positions use Scratch stage coordinates (-240..240, -180..180).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Desired sprite name.' },
        x: { type: 'number', description: 'Initial x position. Default 0.' },
        y: { type: 'number', description: 'Initial y position. Default 0.' },
        size: { type: 'number', description: 'Initial size percent. Default 100.' },
        direction: { type: 'number', description: 'Initial direction. Default 90.' },
        visible: { type: 'boolean', description: 'Whether the sprite is visible. Default true.' }
      },
      required: ['name']
    },
    mutating: true,
    handler(args) {
      return createSprite(args);
    }
  },
  {
    name: 'delete_sprite',
    description: 'Delete a sprite and all of its clones. Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact sprite name to delete.' }
      },
      required: ['name']
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return deleteSprite(args.name);
    }
  },
  {
    name: 'rename_sprite',
    description: 'Rename a sprite. The VM may adjust the name if it is already used.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Current sprite name.' },
        new_name: { type: 'string', description: 'New sprite name.' }
      },
      required: ['target', 'new_name']
    },
    mutating: true,
    handler(args) {
      return renameSprite(args.target, args.new_name);
    }
  },
  {
    name: 'set_sprite',
    description: 'Change sprite properties: position, direction, size, visibility, draggable, rotation style, current costume, or layer order.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite name. Defaults to the editing target.' },
        x: { type: 'number' },
        y: { type: 'number' },
        direction: { type: 'number' },
        size: { type: 'number' },
        visible: { type: 'boolean' },
        draggable: { type: 'boolean' },
        rotation_style: { type: 'string', enum: ['all around', "don't rotate", 'left-right'] },
        current_costume: { type: ['string', 'number'], description: 'Costume name or zero-based index.' },
        go_to_front: { type: 'boolean' },
        go_to_back: { type: 'boolean' }
      }
    },
    mutating: true,
    handler(args) {
      const { target, ...props } = args;
      return setSpriteProps(target, props);
    }
  },
  {
    name: 'create_variable',
    description:
      'Create a scalar variable or list. scope="global" creates it on the Stage (recommended for multi-sprite games); scope="local" creates it on the target sprite. If the variable already exists it is returned with created=false. Lists accept an array value.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable or list name.' },
        value: { description: 'Initial value. Use an array for lists.' },
        type: { type: 'string', enum: ['variable', 'list', 'broadcast'], description: 'Default variable.' },
        scope: { type: 'string', enum: ['auto', 'global', 'local'], description: 'Default auto (global when created).' },
        target: { type: 'string', description: 'Sprite name for local scope. Defaults to the editing target.' }
      },
      required: ['name']
    },
    mutating: true,
    handler(args) {
      return createVariable(args);
    }
  },
  {
    name: 'set_variable',
    description: 'Set an existing scalar variable or list value. For lists, pass an array.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable or list name.' },
        value: { description: 'New value. Use an array for lists.' },
        type: { type: 'string', enum: ['variable', 'list'], description: 'Default variable.' },
        target: { type: 'string', description: 'Sprite name to resolve local variables. Defaults to the editing target.' }
      },
      required: ['name', 'value']
    },
    mutating: true,
    handler(args) {
      return setVariableValue(args);
    }
  },
  {
    name: 'add_script',
    description:
      'Build Scratch blocks from a compact JSON DSL. Each script is a block object: {"opcode":"event_whenflagclicked","next":[...]} . Stack blocks connect through "next" (array). C-block branches go in "substacks":{"SUBSTACK":[...],"SUBSTACK2":[...]}. Inputs accept literals, {"variable":"score"}, {"list":"items"}, {"broadcast":"start"}, {"color":"#ff0000"}, {"menu":"costume1"}, or a nested reporter {"opcode":"operator_add","inputs":{"NUM1":1,"NUM2":2}}. Fields hold dropdown values, e.g. {"fields":{"KEY_OPTION":"space"}}. Variables referenced in fields or reporters are auto-created globally unless auto_create_variables=false. Use get_block_catalog for exact opcodes and input names.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name. Defaults to the editing target.' },
        scripts: {
          type: 'array',
          description: 'Top-level scripts. Each item is a block object with opcode and optional inputs, fields, substacks, next, mutation, x, y.',
          items: objectSchema('A block object.'),
          minItems: 1
        },
        x: { type: 'number', description: 'Default x for the first top-level script.' },
        y: { type: 'number', description: 'Default y for top-level scripts.' },
        auto_create_variables: { type: 'boolean', description: 'Auto-create missing variables/broadcasts (default true).' }
      },
      required: ['scripts']
    },
    mutating: true,
    handler(args) {
      return addScripts(args);
    }
  },
  {
    name: 'delete_block',
    description:
      'Delete one block by its block id. mode="block" (default) removes the block and its nested branches, then reconnects the following stack. mode="chain" also deletes all following blocks in that stack. mode="script" deletes the whole top-level script containing the block. Get exact ids from get_project detail="scripts" (the blocks array).',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name. Defaults to the editing target.' },
        block_id: { type: 'string', description: 'Block id from get_project.' },
        mode: { type: 'string', enum: ['block', 'chain', 'script'], description: 'How much to delete. Default block.' }
      },
      required: ['block_id']
    },
    mutating: true,
    handler(args) {
      return deleteBlock(args);
    }
  },
  {
    name: 'edit_block',
    description:
      'Modify a block in place. Use fields for dropdowns (e.g. KEY_OPTION, EFFECT, VARIABLE), inputs for values/reporters using the same DSL as add_script, and substacks to replace C-block branches. Set an input to null to remove it. This preserves the block position and surrounding script; prefer it over deleting and rebuilding a whole script. Do not edit hidden shadow/menu blocks directly; edit the parent input instead.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        block_id: { type: 'string', description: 'Block id from get_project.' },
        fields: objectSchema('Dropdown fields to set, e.g. {"KEY_OPTION":"space"} or {"VARIABLE":"score"}.'),
        inputs: objectSchema('Inputs to set, e.g. {"STEPS":20} or {"MESSAGE":{"variable":"score"}}.'),
        substacks: objectSchema('C-block branches to replace, e.g. {"SUBSTACK":[...]} or {"SUBSTACK2":[...]}.'),
        auto_create_variables: { type: 'boolean', description: 'Auto-create missing variables (default true).' }
      },
      required: ['block_id']
    },
    mutating: true,
    handler(args) {
      return editBlock(args);
    }
  },
  {
    name: 'insert_block',
    description:
      'Insert a new block into an existing script. position="after" inserts after anchor_id in the same stack; "before" inserts before anchor_id; "substack" inserts at the start of parent_id input_name (SUBSTACK or SUBSTACK2); "input" plugs a reporter/boolean into parent_id input_name. The block argument uses the same block DSL as add_script, including inputs, fields and substacks.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        block: objectSchema('A block object, e.g. {"opcode":"motion_movesteps","inputs":{"STEPS":10}}.'),
        position: { type: 'string', enum: ['after', 'before', 'substack', 'input'], description: 'Default after.' },
        anchor_id: { type: 'string', description: 'Anchor block id for after/before.' },
        parent_id: { type: 'string', description: 'Parent block id for substack/input.' },
        input_name: { type: 'string', description: 'Input name for substack/input, e.g. SUBSTACK or MESSAGE.' },
        auto_create_variables: { type: 'boolean', description: 'Auto-create missing variables (default true).' }
      },
      required: ['block']
    },
    mutating: true,
    handler(args) {
      return insertBlock(args);
    }
  },
  {
    name: 'move_block',
    description:
      'Move an existing block to a new position. position="after" moves it after anchor_id; "substack" moves it to the start of parent_id input_name; "input" plugs a reporter/boolean into parent_id input_name. By default with_next=true, so the block and everything below it move together; set with_next=false to move only the block. Get ids from get_project. Cannot move top-level scripts or hidden shadow/menu blocks.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        block_id: { type: 'string', description: 'Block id to move.' },
        position: { type: 'string', enum: ['after', 'substack', 'input'], description: 'Default after.' },
        anchor_id: { type: 'string', description: 'Destination anchor for after.' },
        parent_id: { type: 'string', description: 'Destination parent for substack/input.' },
        input_name: { type: 'string', description: 'Destination input name for substack/input.' },
        with_next: { type: 'boolean', description: 'Move the following stack too (default true).' }
      },
      required: ['block_id']
    },
    mutating: true,
    handler(args) {
      return moveBlock(args);
    }
  },
  {
    name: 'rename_variable',
    description: 'Rename a variable, list or broadcast on any sprite or the Stage. Broadcasts live on the Stage. Pass target and type explicitly when working across multiple sprites.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        name: { type: 'string', description: 'Current variable/list/broadcast name.' },
        new_name: { type: 'string', description: 'New name.' },
        type: { type: 'string', enum: ['variable', 'list', 'broadcast'], description: 'Default variable.' }
      },
      required: ['name', 'new_name']
    },
    mutating: true,
    handler(args) {
      return renameVariable(args);
    }
  },
  {
    name: 'delete_variable',
    description: 'Delete a variable, list or broadcast and remove/reconnect blocks that reference it. Works on any sprite or the Stage. Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        name: { type: 'string', description: 'Variable/list/broadcast name.' },
        type: { type: 'string', enum: ['variable', 'list', 'broadcast'], description: 'Default variable.' }
      },
      required: ['name']
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return deleteVariable(args);
    }
  },
  {
    name: 'rename_costume',
    description: 'Rename a costume on any sprite, or a backdrop on the Stage. Block references are updated automatically.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite name, or Stage for a backdrop.' },
        name: { type: 'string', description: 'Current costume/backdrop name.' },
        index: { type: 'number', description: 'Zero-based index (alternative to name).' },
        new_name: { type: 'string', description: 'New costume/backdrop name.' }
      },
      required: ['new_name']
    },
    mutating: true,
    handler(args) {
      return renameCostume(args);
    }
  },
  {
    name: 'delete_costume',
    description: 'Delete a costume from any sprite, or a backdrop from the Stage. Cannot delete the last costume/backdrop. References are redirected to a remaining costume. Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite name, or Stage for a backdrop.' },
        name: { type: 'string', description: 'Costume/backdrop name.' },
        index: { type: 'number', description: 'Zero-based index (alternative to name).' }
      }
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return deleteCostume(args);
    }
  },
  {
    name: 'rename_sound',
    description: 'Rename a sound on any sprite or the Stage. Sound block references are updated automatically.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        name: { type: 'string', description: 'Current sound name.' },
        index: { type: 'number', description: 'Zero-based index (alternative to name).' },
        new_name: { type: 'string', description: 'New sound name.' }
      },
      required: ['new_name']
    },
    mutating: true,
    handler(args) {
      return renameSound(args);
    }
  },
  {
    name: 'delete_sound',
    description: 'Delete a sound from any sprite or the Stage. Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        name: { type: 'string', description: 'Sound name.' },
        index: { type: 'number', description: 'Zero-based index (alternative to name).' }
      }
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return deleteSound(args);
    }
  },
  {
    name: 'delete_script',
    description: 'Delete one top-level script by its script id. Get ids from get_project detail="scripts". Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        script_id: { type: 'string', description: 'Top-level block id returned by get_project.' }
      },
      required: ['script_id']
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return deleteScript(args);
    }
  },
  {
    name: 'clear_scripts',
    description: 'Delete every script on a target. Requires user confirmation when enabled.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' }
      }
    },
    mutating: true,
    destructive: true,
    handler(args) {
      return clearScripts(args);
    }
  },
  {
    name: 'add_costume',
    description:
      'Add a costume to a sprite (or a backdrop to the Stage) from an SVG string or a PNG/JPEG/SVG data URL. SVG is preferred because it is sharp at any size. The new costume becomes the current costume.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite name, or Stage for a backdrop. Defaults to the editing target.' },
        name: { type: 'string', description: 'Costume name.' },
        svg: { type: 'string', description: 'Raw SVG markup.' },
        data_url: { type: 'string', description: 'data:image/... URL.' }
      }
    },
    mutating: true,
    handler(args) {
      return addCostume(args);
    }
  },
  {
    name: 'reorder_costume',
    description: 'Reorder a costume on any sprite, or a backdrop on the Stage. new_index is zero-based and clamped to the available range.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite name, or Stage for a backdrop.' },
        name: { type: 'string', description: 'Costume/backdrop name.' },
        index: { type: 'number', description: 'Current zero-based index (alternative to name).' },
        new_index: { type: 'number', description: 'New zero-based index.' }
      },
      required: ['new_index']
    },
    mutating: true,
    handler(args) {
      return reorderCostume(args);
    }
  },
  {
    name: 'reorder_sound',
    description: 'Reorder a sound on any sprite or the Stage. new_index is zero-based and clamped to the available range.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Sprite or Stage name.' },
        name: { type: 'string', description: 'Sound name.' },
        index: { type: 'number', description: 'Current zero-based index (alternative to name).' },
        new_index: { type: 'number', description: 'New zero-based index.' }
      },
      required: ['new_index']
    },
    mutating: true,
    handler(args) {
      return reorderSound(args);
    }
  },
  {
    name: 'set_backdrop',
    description: 'Switch the Stage backdrop by name or zero-based index.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Backdrop name.' },
        index: { type: 'number', description: 'Zero-based backdrop index.' }
      }
    },
    mutating: true,
    handler(args) {
      return setBackdrop(args);
    }
  },
  {
    name: 'set_stage',
    description: 'Change Stage properties such as tempo, volume, video transparency, or video state.',
    parameters: {
      type: 'object',
      properties: {
        tempo: { type: 'number' },
        volume: { type: 'number' },
        video_transparency: { type: 'number' },
        video_state: { type: 'string', enum: ['on', 'off', 'on-flipped'] },
        text_to_speech_language: { type: 'string' }
      }
    },
    mutating: true,
    handler(args) {
      return setStageProps(args);
    }
  },
  {
    name: 'run_project',
    description: 'Click the green flag and start running the project.',
    parameters: { type: 'object', properties: {} },
    handler() {
      return runProject();
    }
  },
  {
    name: 'stop_project',
    description: 'Stop all running scripts.',
    parameters: { type: 'object', properties: {} },
    handler() {
      return stopProject();
    }
  },
  {
    name: 'export_project',
    description: 'Save the current project as an .sb3 file and download it.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Optional filename.' }
      }
    },
    handler(args) {
      return exportProject(args.filename);
    }
  },
  {
    name: 'wait',
    description: 'Wait a number of seconds without running the project. Useful between run_project and get_runtime_state. Maximum 60 seconds.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Seconds to wait. Default 1.' }
      }
    },
    handler(args, ctx) {
      return waitSeconds(args.seconds, ctx.signal);
    }
  },
  {
    name: 'wait_until',
    description:
      'Poll live runtime state until all conditions are true or a timeout. Conditions support variable/list values, sprite properties, clone counts, active threads and the project timer. Example: [{"type":"variable","target":"Stage","name":"score","op":">=","value":10},{"type":"threads","op":"==","value":0}].',
    parameters: {
      type: 'object',
      properties: {
        conditions: {
          type: 'array',
          description: 'All conditions must become true.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['variable', 'list', 'broadcast', 'sprite', 'clone', 'threads', 'timer'], description: 'Default variable.' },
              target: { type: 'string', description: 'Sprite or Stage name.' },
              name: { type: 'string', description: 'Variable/list name for variable/list/broadcast conditions.' },
              property: { type: 'string', description: 'For sprite: x/y/direction/size/visible/draggable/costume/cloneCount. For list: length/contains.' },
              op: { type: 'string', enum: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'exists', 'truthy'], description: 'Comparison. Default ==.' },
              value: { description: 'Expected value.' }
            },
            additionalProperties: true
          },
          minItems: 1
        },
        timeout: { type: 'number', description: 'Timeout seconds (0-60). Default 5.' },
        interval: { type: 'number', description: 'Poll interval seconds (0.05-2). Default 0.1.' }
      },
      required: ['conditions']
    },
    handler(args, ctx) {
      return waitUntil({
        conditions: args.conditions,
        timeout: args.timeout,
        interval: args.interval,
        signal: ctx.signal
      });
    }
  },
  {
    name: 'verify_project',
    description:
      'Run the project, wait for a number of seconds or until conditions become true, then return live runtime state. Optionally capture a PNG of the stage and stop the project. Use this to verify gameplay, score changes, clones and threads after edits.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Wait seconds, or timeout when conditions are provided. Default 2.' },
        conditions: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Optional wait_until conditions.' },
        screenshot: { type: 'boolean', description: 'Capture the stage as a PNG data URL. Default false.' },
        stop_after: { type: 'boolean', description: 'Stop all scripts after capturing state. Default false.' }
      }
    },
    handler: async (args, ctx) => {
      runProject();
      let waitResult;
      if (Array.isArray(args.conditions) && args.conditions.length) {
        waitResult = await waitUntil({
          conditions: args.conditions,
          timeout: args.seconds ?? 5,
          interval: 0.1,
          signal: ctx.signal
        });
      } else {
        waitResult = await waitSeconds(args.seconds ?? 2, ctx.signal);
      }
      const state = getRuntimeState();
      let screenshot = null;
      if (args.screenshot) screenshot = await captureStage();
      if (args.stop_after) stopProject();
      return { wait: waitResult, state, screenshot, stopped: Boolean(args.stop_after) };
    }
  },
  {
    name: 'capture_stage',
    description: 'Capture the current stage as a PNG data URL. The image is shown in the chat tool card; use get_runtime_state for text-verifiable state.',
    parameters: { type: 'object', properties: {} },
    handler() {
      return captureStage();
    }
  },
  {
    name: 'undo_last_change',
    description: 'Undo the most recent AI edit by restoring the project snapshot taken before that edit.',
    parameters: { type: 'object', properties: {} },
    mutating: true,
    snapshot: false,
    handler() {
      return restoreLastSnapshot();
    }
  },
  {
    name: 'redo_last_change',
    description: 'Redo the most recently undone AI change, restoring the project state that was active before the undo.',
    parameters: { type: 'object', properties: {} },
    mutating: true,
    snapshot: false,
    handler() {
      return redoLastSnapshot();
    }
  },
  {
    name: 'list_checkpoints',
    description: 'List persistent project checkpoints (saved automatically before AI edits, and on demand). Checkpoints survive page reloads via IndexedDB. Returns ids, labels, timestamps and sizes.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ checkpoints: await listCheckpoints() })
  },
  {
    name: 'save_checkpoint',
    description: 'Save a named checkpoint of the current project that survives page reloads. Use before large experiments or as a manual version marker.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Checkpoint label.' }
      }
    },
    handler: async args => {
      const saved = await pushSnapshot(String(args.label || '手动检查点'));
      return { saved: Boolean(saved && saved.ok), label: args.label || '手动检查点', count: saved?.count };
    }
  },
  {
    name: 'restore_checkpoint',
    description: 'Restore a persistent checkpoint by id. The current project is snapshotted first so the restore itself can be undone.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Checkpoint id from list_checkpoints.' }
      },
      required: ['id']
    },
    mutating: true,
    snapshot: false,
    handler: async args => {
      const checkpoint = await loadCheckpoint(args.id);
      if (!checkpoint) throw new Error('找不到该检查点。');
      await pushSnapshot('恢复检查点前');
      const vm = getVM();
      const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
      await vm.loadProject(checkpoint.json);
      if (editingName) {
        const target = getTargetByName(editingName);
        if (target) vm.setEditingTarget(target.id);
      }
      vm.emitWorkspaceUpdate();
      return { restored: true, id: checkpoint.id, label: checkpoint.label, at: checkpoint.at };
    }
  },
  {
    name: 'delete_checkpoint',
    description: 'Delete a persistent checkpoint by id. This only removes the saved checkpoint; it does not modify the project.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Checkpoint id from list_checkpoints.' }
      },
      required: ['id']
    },
    handler: async args => ({ deleted: await deleteCheckpoint(args.id), id: args.id })
  },
  {
    name: 'update_plan',
    description:
      'Update the visible task plan shown to the user. Use this for multi-step work and keep statuses current. This tool does not modify the project.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'] }
            },
            required: ['title']
          }
        }
      },
      required: ['steps']
    },
    handler(args, ctx) {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      ctx.setPlan(steps);
      return { steps };
    }
  }
];

export const TOOL_MAP = new Map(TOOL_DEFINITIONS.map(tool => [tool.name, tool]));

export const TOOL_SCHEMAS = TOOL_DEFINITIONS.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
}));

export async function executeTool(name, args, ctx) {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    return { ok: false, error: `未知工具: ${name}` };
  }
  if (ctx.signal && ctx.signal.aborted) {
    return { ok: false, error: '操作已取消。' };
  }
  if (tool.destructive && ctx.confirmDestructive) {
    const approved = await ctx.confirm({
      title: '确认执行破坏性操作',
      message: `AI 想要执行「${tool.name}」。这会修改或删除当前作品内容，是否继续？`
    });
    if (!approved) {
      return { ok: false, error: '用户拒绝了该操作。' };
    }
  }
  if (tool.mutating && tool.snapshot !== false) {
    await ctx.ensureSnapshot(tool.name);
  }
  try {
    const result = await tool.handler(args || {}, ctx);
    return { ok: true, ...(result && typeof result === 'object' ? result : { result }) };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}
