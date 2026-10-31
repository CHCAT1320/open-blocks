# 积木 DSL 参考

`add_script` 工具把 JSON 积木描述转换成 TurboWarp / Scratch 3 的真实积木。本文档说明 DSL 结构、输入类型、菜单映射和常见写法。

## 顶层参数

```js
add_script({
  target: "角色1",          // 省略时使用当前编辑角色
  x: 48,                   // 第一个顶层脚本位置
  y: 48,
  auto_create_variables: true,
  scripts: [ /* 顶层脚本数组 */ ]
})
```

每个顶层脚本是一个积木对象：

```json
{
  "opcode": "event_whenflagclicked",
  "x": 48,
  "y": 48,
  "next": []
}
```

## 积木对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `opcode` | string | 必填，Scratch 积木 opcode，例如 `motion_movesteps` |
| `inputs` | object | 输入值，键名必须是积木定义的输入名 |
| `fields` | object | 下拉字段，例如 `KEY_OPTION`、`VARIABLE`、`EFFECT` |
| `next` | array | 垂直堆叠的后续积木 |
| `substacks` | object | C 型积木分支，例如 `{ "SUBSTACK": [...] }` |
| `mutation` | object | 高级：自定义积木或扩展积木的 mutation |
| `x` / `y` | number | 仅顶层脚本使用 |

## 输入类型

### 字面量

```json
{ "opcode": "motion_movesteps", "inputs": { "STEPS": 10 } }
```

```json
{ "opcode": "looks_say", "inputs": { "MESSAGE": "你好" } }
```

- 数字会生成 `math_number` 隐藏积木。
- 字符串会生成 `text` 隐藏积木。
- 颜色输入可以使用 `{ "color": "#ff0000" }`。

### 变量和列表

```json
{
  "opcode": "data_setvariableto",
  "fields": { "VARIABLE": "score" },
  "inputs": { "VALUE": 0 }
}
```

```json
{
  "opcode": "looks_say",
  "inputs": {
    "MESSAGE": { "variable": "score" }
  }
}
```

```json
{
  "opcode": "data_addtolist",
  "fields": { "LIST": "items" },
  "inputs": { "ITEM": "apple" }
}
```

```json
{
  "opcode": "looks_say",
  "inputs": {
    "MESSAGE": { "list": "items" }
  }
}
```

- `fields.VARIABLE` 和 `{"variable": "..."}` 解析为标量变量。
- `fields.LIST` 和 `{"list": "..."}` 解析为列表。
- 缺失时默认在舞台上创建全局变量 / 列表。
- 需要局部变量时，先调用 `create_variable` 并指定 `scope: "local"`。

### 广播

```json
{
  "opcode": "event_broadcast",
  "inputs": { "BROADCAST_INPUT": { "broadcast": "start" } }
}
```

```json
{
  "opcode": "event_whenbroadcastreceived",
  "fields": { "BROADCAST_OPTION": "start" },
  "next": []
}
```

广播字段会自动解析广播变量 ID；缺失时自动创建。

### 菜单

菜单输入直接传字符串，构建器会创建正确的隐藏菜单积木：

```json
{ "opcode": "looks_switchcostumeto", "inputs": { "COSTUME": "costume1" } }
```

```json
{ "opcode": "control_create_clone_of", "inputs": { "CLONE_OPTION": "_myself_" } }
```

```json
{
  "opcode": "sensing_touchingobject",
  "inputs": { "TOUCHINGOBJECTMENU": "_mouse_" }
}
```

常见菜单值：

| 输入 | 常见值 |
| --- | --- |
| `COSTUME` | 造型名 |
| `BACKDROP` | 背景名 |
| `SOUND_MENU` | 声音名 |
| `TO` / `TOWARDS` | `_random_`、`_mouse_`、角色名 |
| `TOUCHINGOBJECTMENU` | `_mouse_`、`_edge_`、角色名 |
| `CLONE_OPTION` | `_myself_`、角色名 |
| `KEY_OPTION` | `space`、`up arrow`、`a`、`any` |
| `OBJECT` | `_stage_`、角色名 |

### 嵌套 reporter

```json
{
  "opcode": "looks_say",
  "inputs": {
    "MESSAGE": {
      "opcode": "operator_join",
      "inputs": {
        "STRING1": "得分: ",
        "STRING2": { "variable": "score" }
      }
    }
  }
}
```

布尔输入必须放 boolean reporter：

```json
{
  "opcode": "control_if",
  "inputs": {
    "CONDITION": {
      "opcode": "operator_gt",
      "inputs": { "OPERAND1": { "variable": "score" }, "OPERAND2": 10 }
    }
  },
  "substacks": {
    "SUBSTACK": [
      { "opcode": "looks_say", "inputs": { "MESSAGE": "胜利！" } }
    ]
  }
}
```

## C 型积木

```json
{
  "opcode": "control_repeat",
  "inputs": { "TIMES": 10 },
  "substacks": {
    "SUBSTACK": [
      { "opcode": "motion_movesteps", "inputs": { "STEPS": 10 } },
      { "opcode": "motion_turnright", "inputs": { "DEGREES": 15 } }
    ]
  }
}
```

`control_if_else` 使用两个分支：

```json
{
  "opcode": "control_if_else",
  "inputs": {
    "CONDITION": { "opcode": "sensing_keypressed", "inputs": { "KEY_OPTION": "space" } }
  },
  "substacks": {
    "SUBSTACK": [ { "opcode": "looks_say", "inputs": { "MESSAGE": "按下" } } ],
    "SUBSTACK2": [ { "opcode": "looks_say", "inputs": { "MESSAGE": "未按" } } ]
  }
}
```

也可以在 `inputs` 里直接放数组：

```json
{
  "opcode": "control_forever",
  "inputs": {
    "SUBSTACK": [
      { "opcode": "motion_movesteps", "inputs": { "STEPS": 1 } }
    ]
  }
}
```

## 常见 opcode 速查

### 事件

| opcode | 输入 / 字段 |
| --- | --- |
| `event_whenflagclicked` | 无 |
| `event_whenkeypressed` | `fields.KEY_OPTION` |
| `event_whenbroadcastreceived` | `fields.BROADCAST_OPTION` |
| `event_whenthisspriteclicked` | 无 |
| `event_whenstageclicked` | 无 |
| `event_broadcast` | `inputs.BROADCAST_INPUT` |
| `event_broadcastandwait` | `inputs.BROADCAST_INPUT` |

### 控制

| opcode | 输入 / 字段 |
| --- | --- |
| `control_wait` | `DURATION` |
| `control_repeat` | `TIMES`, `SUBSTACK` |
| `control_forever` | `SUBSTACK` |
| `control_if` | `CONDITION`, `SUBSTACK` |
| `control_if_else` | `CONDITION`, `SUBSTACK`, `SUBSTACK2` |
| `control_wait_until` | `CONDITION` |
| `control_repeat_until` | `CONDITION`, `SUBSTACK` |
| `control_while` | `CONDITION`, `SUBSTACK`（TurboWarp） |
| `control_stop` | `fields.STOP_OPTION` |
| `control_start_as_clone` | 无 |
| `control_create_clone_of` | `CLONE_OPTION` |
| `control_delete_this_clone` | 无 |

### 运动

| opcode | 输入 / 字段 |
| --- | --- |
| `motion_movesteps` | `STEPS` |
| `motion_turnright` / `motion_turnleft` | `DEGREES` |
| `motion_gotoxy` | `X`, `Y` |
| `motion_goto` | `TO` |
| `motion_glidesecstoxy` | `SECS`, `X`, `Y` |
| `motion_glideto` | `SECS`, `TO` |
| `motion_pointindirection` | `DIRECTION` |
| `motion_pointtowards` | `TOWARDS` |
| `motion_changexby` / `motion_setx` | `DX` / `X` |
| `motion_changeyby` / `motion_sety` | `DY` / `Y` |
| `motion_ifonedgebounce` | 无 |
| `motion_xposition` / `motion_yposition` / `motion_direction` | reporter |

### 外观

| opcode | 输入 / 字段 |
| --- | --- |
| `looks_say` / `looks_think` | `MESSAGE` |
| `looks_sayforsecs` / `looks_thinkforsecs` | `MESSAGE`, `SECS` |
| `looks_show` / `looks_hide` | 无 |
| `looks_switchcostumeto` | `COSTUME` |
| `looks_nextcostume` | 无 |
| `looks_switchbackdropto` | `BACKDROP` |
| `looks_setsizeto` / `looks_changesizeby` | `SIZE` / `CHANGE` |
| `looks_seteffectto` / `looks_changeeffectby` | `VALUE` / `CHANGE`, `fields.EFFECT` |
| `looks_gotofrontback` | `fields.FRONT_BACK` |
| `looks_goforwardbackward` | `NUM`, `fields.FORWARD_BACKWARD` |
| `looks_size` | reporter |

### 侦测

| opcode | 输入 / 字段 |
| --- | --- |
| `sensing_touchingobject` | `TOUCHINGOBJECTMENU` |
| `sensing_touchingcolor` | `COLOR` |
| `sensing_coloristouchingcolor` | `COLOR`, `COLOR2` |
| `sensing_distanceto` | `DISTANCETOMENU` |
| `sensing_askandwait` | `QUESTION` |
| `sensing_answer` | reporter |
| `sensing_keypressed` | `KEY_OPTION` |
| `sensing_mousedown` | boolean |
| `sensing_mousex` / `sensing_mousey` | reporter |
| `sensing_timer` / `sensing_resettimer` | reporter / command |
| `sensing_of` | `OBJECT`, `fields.PROPERTY` |
| `sensing_current` | `fields.CURRENTMENU` |
| `sensing_dayssince2000` / `sensing_username` | reporter |

### 运算

| opcode | 输入 / 字段 |
| --- | --- |
| `operator_add` / `operator_subtract` / `operator_multiply` / `operator_divide` | `NUM1`, `NUM2` |
| `operator_random` | `FROM`, `TO` |
| `operator_gt` / `operator_lt` / `operator_equals` | `OPERAND1`, `OPERAND2` |
| `operator_and` / `operator_or` | `OPERAND1`, `OPERAND2` |
| `operator_not` | `OPERAND` |
| `operator_join` | `STRING1`, `STRING2` |
| `operator_letter_of` | `LETTER`, `STRING` |
| `operator_length` | `STRING` |
| `operator_contains` | `STRING1`, `STRING2` |
| `operator_mod` | `NUM1`, `NUM2` |
| `operator_round` | `NUM` |
| `operator_mathop` | `NUM`, `fields.OPERATOR` |

### 变量和列表

| opcode | 输入 / 字段 |
| --- | --- |
| `data_variable` | `fields.VARIABLE` |
| `data_setvariableto` | `VALUE`, `fields.VARIABLE` |
| `data_changevariableby` | `VALUE`, `fields.VARIABLE` |
| `data_listcontents` | `fields.LIST` |
| `data_addtolist` | `ITEM`, `fields.LIST` |
| `data_deleteoflist` | `INDEX`, `fields.LIST` |
| `data_deletealloflist` | `fields.LIST` |
| `data_insertatlist` | `ITEM`, `INDEX`, `fields.LIST` |
| `data_replaceitemoflist` | `INDEX`, `ITEM`, `fields.LIST` |
| `data_itemoflist` | `INDEX`, `fields.LIST` |
| `data_itemnumoflist` | `ITEM`, `fields.LIST` |
| `data_lengthoflist` | `fields.LIST` |
| `data_listcontainsitem` | `ITEM`, `fields.LIST` |

## 完整示例：绿旗动画 + 空格计分

```json
{
  "target": "角色1",
  "scripts": [
    {
      "opcode": "event_whenflagclicked",
      "next": [
        {
          "opcode": "looks_switchcostumeto",
          "inputs": { "COSTUME": "costume1" }
        },
        {
          "opcode": "looks_sayforsecs",
          "inputs": { "MESSAGE": "你好！我是 OpenBlocks。", "SECS": 2 }
        },
        {
          "opcode": "control_repeat",
          "inputs": { "TIMES": 10 },
          "substacks": {
            "SUBSTACK": [
              { "opcode": "motion_movesteps", "inputs": { "STEPS": 12 } },
              { "opcode": "motion_turnright", "inputs": { "DEGREES": 18 } },
              { "opcode": "motion_ifonedgebounce" }
            ]
          }
        },
        {
          "opcode": "looks_say",
          "inputs": { "MESSAGE": "按空格键加分！" }
        }
      ]
    },
    {
      "opcode": "event_whenkeypressed",
      "fields": { "KEY_OPTION": "space" },
      "next": [
        {
          "opcode": "data_changevariableby",
          "fields": { "VARIABLE": "score" },
          "inputs": { "VALUE": 1 }
        },
        {
          "opcode": "looks_say",
          "inputs": {
            "MESSAGE": {
              "opcode": "operator_join",
              "inputs": {
                "STRING1": "得分: ",
                "STRING2": { "variable": "score" }
              }
            }
          }
        }
      ]
    }
  ]
}
```

## 常见错误

- **输入名大小写错误**：Scratch 输入名是区分大小写的，例如 `STEPS`、`MESSAGE`、`CONDITION`。不确定时调用 `get_block_catalog`。
- **把下拉值放进 inputs**：`KEY_OPTION`、`EFFECT`、`STOP_OPTION`、`FRONT_BACK` 等是字段，应放在 `fields`。
- **布尔输入传字面量**：`CONDITION` 需要 boolean reporter，不能直接写 `true`。
- **C 型积木分支放进 `next`**：分支应放在 `substacks` 或 `inputs.SUBSTACK`。
- **自定义积木 mutation 不完整**：优先使用普通脚本；需要自定义积木时传入完整的 `mutation`（`proccode`、`argumentids`、`argumentnames`、`argumentdefaults`、`warp`）。
- **变量被错误重映射**：确保 `fields.VARIABLE` 使用字段名 `VARIABLE`，不要把它写成变量名；`add_script` 会自动处理。

## 块级编辑工具

先用 `get_project detail="scripts" target="角色名"` 读取脚本。返回的 `blocks` 数组包含每个积木的 `id`、`opcode`、`parent`、`next`、`inputs` 和 `fields`，这些 id 可以直接用于块级编辑。所有工具都接受 `target`，可以操作任意角色或舞台。

### 修改一个积木

```js
edit_block({
  target: "角色1",
  block_id: "b63tjHSdmdBt7Y4z4RYrr",
  inputs: { MESSAGE: "新的台词", SECS: 5 }
})
```

`fields` 用于下拉字段，`inputs` 使用与 `add_script` 相同的 DSL，`substacks` 可以替换 C 型积木分支。把 input 设为 `null` 可以删除该输入。

### 删除一个积木

```js
delete_block({
  target: "角色1",
  block_id: "bjgpLh0Ror13u1OBSwSEk",
  mode: "block"
})
```

- `mode="block"`：只删除该积木和它的分支，后续积木自动接上。
- `mode="chain"`：删除该积木及下面整条链。
- `mode="script"`：删除包含它的整个顶层脚本。

### 插入新积木

```js
insert_block({
  target: "角色1",
  position: "after",
  anchor_id: "b63tjHSdmdBt7Y4z4RYrr",
  block: { opcode: "motion_movesteps", inputs: { STEPS: 20 } }
})
```

`position` 支持：

- `after` / `before`：在 `anchor_id` 前后插入。
- `substack`：插入到 `parent_id` 的 `input_name`（如 `SUBSTACK`）开头。
- `input`：把 reporter 插入到 `parent_id` 的输入框。

### 移动已有积木

```js
move_block({
  target: "角色1",
  block_id: "bDBelDPyl9WUZxazP7QyC",
  position: "substack",
  parent_id: "bnUzOf4b8He0taNIRBCi6",
  input_name: "SUBSTACK",
  with_next: false
})
```

`with_next` 默认 `true`，会连同下面的积木一起移动；设为 `false` 只移动当前积木。

### 注意事项

- 不要直接编辑隐藏的 shadow/menu 积木；修改父积木的 input 即可。
- 目标位置不能位于被移动积木自己的子树中，否则会形成循环，工具会报错。
- 块级修改后建议调用 `get_project detail="scripts"` 检查 `parent` / `next` 关系。
- 多角色项目要显式传 `target`，不要假设当前编辑角色。
