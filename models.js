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
      dragging: false,
      engaged: false,
      expr: null,
      sketch: null,
      offset: null,
      step: null,
      src: null,
      value: null,
      fromSelect: false
    };
  }
});

var Number = Datum.extend({
  defaults: function() {
    return {
      initialized: false,
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
      initialized: false,
      visible: true,
      name: "list0",
      type: "list",
      values: [1]
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

  defaults: {step: new Step(), line: 0}
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
    value: null
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

