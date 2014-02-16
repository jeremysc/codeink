// App state
var State = Backbone.Model.extend({
  initialize: function() {
    _.bindAll(this, 'selecting', 'drawing', 'filling');
    this.mode = 'select';
    this.color = '#79c2f7';
  },

  selecting: function() {
    return this.mode == 'select';
  },
  drawing: function() {
    return this.mode == 'draw';
  },
  filling: function() {
    return this.mode == 'fill';
  },
});

// ---------------
// TRACE 
// ---------------
var TraceStep = Backbone.Model.extend({});
var Trace = Backbone.Collection.extend({model: TraceStep});
// ---------------
// DATA
// ---------------
var Data = Backbone.Collection.extend({});

var Datum = Backbone.Model.extend({
  defaults: function() {
    return {
      name: "noname",
      position: {x: 0, y: 0},
      type: "none",
      visible: true,
      parts: null
    };
  },
  getSymbol: function() {
    return this.get('name');
  }
});

var DragData = Datum.extend({
  defaults: function() {
    return {
      // Dragging state and offset
      dragging: false,
      offset: null,
      nodeOffset: null,

      // Dragged expression and value
      expr: null,
      value: null,

      // Views of the dragged object
      sketch: null,
      kinetic: null,
      originalBounds: null,

      // State of the drag
      exited: false,
      dwelled: false,
      engagedSketch: null,
      engagedBehavior: null,

      // Resulting step
      step: null,
    };
  }
});

var Number = Datum.extend({
  defaults: function() {
    return {
      visible: true,
      name: "num0",
      type: "num",
      value: null
    };
  },

  getValue: function() {
    return this.get('value');
  }
});

var List = Datum.extend({
  defaults: function() {
    return {
      visible: true,
      name: "list0",
      type: "list",
      values: []
    };
  },

  length: function() {
    return this.get('values').length;
  },

  insert: function(index, value) {
    var values = this.get('values');
    values.splice(index, 0, value);
    this.set({values: values});
    this.trigger('change');
  },

  pop: function(index) {
    var values = this.get('values');
    values.splice(index, 1);
    this.set({values: values});
    this.trigger('change');
  },

  getValue: function() {
    return "[" + this.get('values').toString() + "]";
  }
});

var BinaryNode = Datum.extend({
  defaults: function() {
    return {
      visible: true,
      name: "binaryA",
      type: "binary",
      value: null,
      left: null,
      right: null,
      parent: null
    };
  },

  getValue: function() {
    return this.get('value');
  },

  getChildSide: function(child) {
    var leftNode = this.get('left');
    var rightNode = this.get('right');
    if (leftNode != null && child.get('name') == leftNode.get('name'))
      return 'left';
    else if (rightNode != null && child.get('name') == rightNode.get('name'))
      return 'right';
    return null;
  }
});

var Node = Datum.extend({
  defaults: function() {
    return {
      visible: true,
      name: "nodeA",
      type: "node",
      value: null
    };
  },

  getValue: function() {
    return this.get('value');
  },
});

var Edge = Datum.extend({
  defaults: function() {
    return {
      visible: true,
      name: "edgeA",
      type: "edge",
      weight: null,
      start: null,
      end: null
    };
  },

  getValue: function() {
    return this.get('weight');
  },
});

var ClassDefinitionsModel = Backbone.Model.extend({
  initialize: function() {
    this.definitions = [
      [
      "class BinaryNode:",
      "  def __init__(self, value, left=None):",
      "    self.value = value",
      "    self.left = left",
      "    self.right = None",
      "",
      "class Node:",
      "  def __init__(self, value):",
      "    self.value = value",
      "",
      "class Edge:",
      "  def __init__(self, weight):",
      "    self.weight = weight",
      "    self.start = None",
      "    self.end = None"
      ]
    ];
  },

  toCode: function() {
    var script = "";
    for (var i = 0; i < this.definitions.length; i++) {
      var def = this.definitions[i];
      script += def.join("\n") + "\n\n";
    }
    return script;
  },

  numLines: function() {
    var num = 0;
    for (var i = 0; i < this.definitions.length; i++) {
      num += this.definitions[i].length;
      num += 1;
    }
    return num;
  }
});

var ClassDefinitions = new ClassDefinitionsModel;

// ---------------
// EXPRESSIONS 
// composed of  literal strings (']'),
//              subexpressions
//              primitive values
// latter two can be replaced in the active step
// ---------------
var Expr = Backbone.Model.extend({
  dragChange: function(partName, expr) {
    this.oldValue = this.get(partName);
    this.set(partName, expr);
  },
  dragReset: function(partName) {
    this.set(partName, this.oldValue);
  },
  toCode: function(lang) {
    if (lang == undefined)
      lang = 'python';
    var code = "";
    var parts = this.get('parts')[lang];
    for (var i = 0; i < parts.length; i++) {
      // dynamic part
      if (this.has(parts[i])) {
        var part = this.get(parts[i]);
        // primitive value
        if (isPrimitiveType(part)) {
          code += part;
        // subexpression
        } else if (isDatum(part)) {
          code += part.getSymbol();
        } else {
          code += part.toCode(lang);
        }
      // literal part
      } else {
        code += parts[i];
      }
    }
    return code;
  }
});
var NewListExpr = Expr.extend({
  defaults: function() {
    return {
      value: "0",
      parts: {
        'python': ['[','value',']'],
        'english': ['a new list: ','[','value',']']
      }
    };
  },
});
var ListVarExpr = Expr.extend({
  defaults: function() {
    return {
      list: "list",
      index: "0",
      parts: {
        'python': ['list','[','index',']'],
        'english': ['list','[','index',']']
      }
    };
  },
});
var BinaryNodeExpr = Expr.extend({
  defaults: function() {
    return {
      value: "0",
      parts: {
        'python': ['BinaryNode(','value',')'],
        'english': ['new binary node with value ','value']
      }
    };
  },
});
var NodeExpr = Expr.extend({
  defaults: function() {
    return {
      value: "0",
      parts: {
        'python': ['Node(','value',')'],
        'english': ['new node with value ','value']
      }
    };
  },
});
var EdgeExpr = Expr.extend({
  defaults: function() {
    return {
      weight: "0",
      parts: {
        'python': ['Edge(','weight',')'],
        'english': ['new edge with weight ','weight']
      }
    };
  },
});

var AttrExpr = Expr.extend({
  defaults: function() {
    return {
      object: "node",
      attr: "value",
      parts: {
        'python': ['object','.','attr'],
        'english': ['object','.','attr']
      }
    };
  },
});

var InfinityExpr = Expr.extend({
  defaults: function() {
    return {
      parts: {
        'python': ['float("inf")'],
        'english': ['infinity']
      },
      type: "inf"
    };
  },
});

// ---------------
// STEPS
// an extended expression with indentation
// steps are gathered in a collection
// ---------------
var Step = Expr.extend({
  toCode: function(toHTML, lang) {
    var code = "";
    for (var ind = 0; ind < this.get('indent'); ind++) {
      if (toHTML)
        code += "&nbsp;&nbsp;";
      else
        code += "  ";
    }
    return code + Expr.prototype.toCode.call(this, lang);
  },
  animate: function(callback) {
    var animation = this.get('animation');
    if (animation != undefined) {
      animation(this, callback);
      return true;
    } else {
      return false;
    }
  }
});

var ActiveStep = Backbone.Model.extend({
  // N lines
  // G trace steps

  // Line numbers: 1 to N
  // Index in Steps collection: 0 to N-1
  // Index in Trace collection: 0 to G-1
  // each TraceStep has trace.line between 1 and N

  defaults: function() {
    return {
      step: new Step(),
      line: 0
    };
  }
});

var Steps = Backbone.Collection.extend({
  model:Step,
});

var Assignment = Step.extend({
  defaults: {
    action: 'assignment',
    indent: 0,
    parts: {
      'python': ['variable', ' = ', 'value'],
      'english': ['set ', 'variable', ' to ', 'value']
    },
    variable: null,
    value: null,
    isInitialization: false,
    position: {x: 0, y: 0}
  }
});

var Pop = Step.extend({
  defaults: {
    action: 'pop',
    indent: 0,
    parts: {
      'python': ['list', '.pop(', 'index', ')'],
      'english': ['pop out ', 'index', ' from ', 'list'],
    },
    list: null,
    index: null
  }
});

var Insert = Step.extend({
  defaults: {
    action: 'insert',
    indent: 0,
    parts: {
      'python': ['list', '.insert(', 'index', ',', 'value', ')'],
      'english': ['insert ', 'value', ' into ', 'list', ' at position ', 'index']
    },
    list: null,
    index: null,
    value: null
  }
});

var Append = Step.extend({
  defaults: {
    action: 'append',
    indent: 0,
    parts: {
      'python': ['list', '.append(', 'value', ')'],
      'english': ['add ', 'value', ' to ', 'list']
    },
    list: null,
    value: null
  }
});

var Rearrange = Step.extend({
  defaults: {
    action: 'rearrange',
    indent: 0,
    parts: {
      'python': ['list', '.insert(', 'toIndex', ',', 'list', '.pop(', 'fromIndex', '))'],
      'english': ['move ', 'list', ' position ', 'fromIndex', ' to ', 'toIndex']
    },
    list: null,
    fromIndex: null,
    toIndex: null
  }
});

var Fill = Step.extend({
  defaults: {
    action: 'fill',
    indent: 0,
    parts: {
      'python': ['# fill ', 'variable', ' with color ', 'color'],
      'english': ['# fill ', 'variable', ' with color ', 'color'],
    },
    variable: null,
    list: null,
    index: null,
    color: null
  }
});

var Compare = Step.extend({
  defaults: {
    action: 'compare',
    indent: 0,
    parts: {
      'python': ['# compare ', 'drag', ' with ', 'against'],
      'english': ['# compare ', 'drag', ' with ', 'against'],
    },
    drag: null,
    against: null,
    dragSketch: null,
    againstSketch: null,
  }
});

var Follow = Step.extend({
  defaults: {
    action: 'follow',
    indent: 0,
    parts: {
      'python': ['# follow ', 'from', ' to ', 'side'],
      'english': ['# follow ', 'from', ' to ', 'side'],
    },
    drag: null,
    from: null,
    side: false,
    dragSketch: null,
    fromSketch: null,
  }
});

var BinaryNodeInsert = Step.extend({
  defaults: {
    action: 'binaryNodeInsert',
    indent: 0,
    parts: {
      'python': ['parent', '.', 'side', ' = ', 'child'],
      'english': ['insert ', 'child', ' at ', 'parent', '.', 'side']
    },
    parent: null,
    side: "left",
    child: null,
  }
});

var BinaryNodeDetach = Step.extend({
  defaults: {
    action: 'binaryNodeDetach',
    indent: 0,
    parts: {
      'python': ['parent', '.', 'side', ' = None'],
      'english': ['detach ', 'child', ' from ', 'parent']
    },
    parent: null,
    side: "left",
    child: null,
  }
});

var EdgeAttach = Step.extend({
  defaults: {
    action: 'edgeAttach',
    indent: 0,
    parts: {
      'python': ['edge', '.', 'side', ' = ', 'node'],
      'english': ['attach ', 'node', ' to ', 'edge', ' ' , 'side']
    },
    edge: null,
    side: "start",
    node: null,
  }
});

var EdgeDetach = Step.extend({
  defaults: {
    action: 'nodeDetach',
    indent: 0,
    parts: {
      'python': ['edge', '.', 'side', ' = None'],
      'english': ['detach ', 'edge', ' ', 'side']
    },
    edge: null,
    side: "start",
  }
});

