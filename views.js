var box_dim = 45;
var box_shift = 3;
var node_dim = 1.25*box_dim;
var stageWidth = 850;
var stageHeight = 550;

var PaletteView = Backbone.View.extend({
  el: "#palette",

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'setMode');
    this.$el.html(_.template($("#palette-template").html()));
    this.state = options.state;

    $(".add-data").on("dragstart", function(event) {
      event.originalEvent.dataTransfer.setData('text/plain', event.currentTarget.id);
    });

    $("#select").on("click", function() {
      self.setMode('select');
    });
    $("#draw").on("click", function() {
      self.setMode('draw');
    });
    $("#fill").on("click", function() {
      self.setMode('fill');
    });
    $(document).keydown(function(e) {
      switch(e.which) {
        case 83: //s
          self.setMode('select');
          return;
        case 68: //d
          self.setMode('draw');
          return;
        case 70: //f
          self.setMode('fill');
          return;
      }
    });
    $(".color").colorpicker();
    $(".color").colorpicker().on('changeColor', function(ev) {
      self.state.color = ev.color.toHex();
    });
  },

  setMode: function(mode) {
    var selector = "#" + mode;
    this.state.mode = mode;
    $("#tools button").removeClass('active');
    $("#tools button").removeClass('btn-primary');
    $("#tools button").addClass('btn-default');
    $(selector).removeClass('btn-default');
    $(selector).addClass('btn-primary');
    $(selector).addClass('active');
  },
  
  render: function() {
    this.delegateEvents();
  },
});


var ActiveStepView = Backbone.View.extend({
  model: ActiveStep,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'generateLabels', 'generateLabel', 'updateParts');
    this.steps = options.steps;
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.stageWidth = options.stageWidth;
    this.stageHeight = options.stageHeight;
    this.fontSize = 30;

    // the active step's parts
    this.tempStep = new Step(this.model.get('step').toJSON());

    // group for drawing the active step
    this.group = new Kinetic.Group({
      name: 'activeStep'
    });
    this.layer.add(this.group);

    // changes to the active step
    this.model.on('change', this.updateParts);

    // changes to the visible parts
    this.tempStep.on('change', this.render);
  },

  updateParts: function() {
    this.tempStep.set(this.model.get('step').toJSON());
    this.tempStep.trigger('change');
  },

  render: function() {
    this.group.removeChildren();
    var step = this.tempStep;
    
    var x = 0;
    x = this.generateLabels(step, x);
    this.group.setPosition({x: (this.stageWidth - x)/2, y: this.stageHeight-this.fontSize-15});
    this.layer.draw();
  },

  // generates labels for an expression
  // recursively called for subexpressions
  generateLabels: function(expr, x) {
    var parts = expr.get('parts');
    for (var i = 0; i < parts.length; i++) {
      // dynamic part
      if (expr.has(parts[i])) {
        var part = expr.get(parts[i]);
        // primitive value
        if (isPrimitiveType(part)) {
          x = this.generateLabel(part, x, true, expr, parts[i]);
        // subexpression
        } else if (isDatum(part)) {
          x = this.generateLabel(part.getSymbol(), x, true, expr, parts[i]);
        } else {
          x = this.generateLabels(part, x);
        }
      // literal part
      } else {
        x = this.generateLabel(parts[i], x, false);
      }
    }
    return x;
  },
  generateLabel: function(text, x, dropTarget, expr, partName) {
    var self = this;
    var label = new Kinetic.Label({x:x,y:0});
    label.add(new Kinetic.Tag());
    label.add(new Kinetic.Text({
      text: text,
      fontFamily: 'Helvetica',
      fontSize: this.fontSize,
      padding: 5,
      fill: dropTarget ? '#0088cc' : 'black'
    }));
    label.on("dblclick", function() {
      var newExpr = prompt('Modify expression', text);
      if (newExpr != null) {
        expr.set(partName, newExpr);
        var step = self.model.get('step');
        step.set(self.tempStep.toJSON());
        self.model.set({step: step});
        self.model.trigger('change');
      }
    });
    this.group.add(label);
    return x+label.getText().textWidth;
  }
});

var CanvasView = Backbone.View.extend({
  el: "#stage",

  initialize: function(options) {
    var self = this;
    this.data = options.data;
    this.steps = options.steps;
    this.trace = options.trace;
    this.sketches = [];
    this.activeStep = options.activeStep;
    this.state = options.state;
    _.bindAll(this, 'handleDrop', 'render');

    ///////////////////////////////////
    // Setup the KineticJS stage
    ///////////////////////////////////
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    var stage = new Kinetic.Stage({
        container: 'stage',
        width: this.stageWidth,
        height: this.stageHeight
    });    
    this.layer = new Kinetic.Layer();
    stage.add(this.layer);

    // The background object, and a Group for globals
    var background = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: this.stageWidth,
        height: this.stageHeight,
        fill: '#E8E8E8',
        stroke: 'black',
        strokeWidth: 1
    });
    this.globals = new Kinetic.Group({name: 'globals'});
    this.layer.add(background);
    this.layer.add(this.globals);
    this.layer.draw();

    ///////////////////////////////////
    // Handle events on the stage
    ///////////////////////////////////
    // Dropping new data objects on the stage, from the palette
    this.container = stage.getContainer();
    this.container.addEventListener("dragenter", function(e) {
      e.preventDefault();
      return false;
    });
    this.container.addEventListener("dragover", function(e) {
      e.preventDefault();
      return false;
    });
    this.container.addEventListener("drop", this.handleDrop);
    // When objects are added, re-render the stage
    this.data.on("add", this.render);

    // Dragging data around on the stage
    // Move the data using mousedown/move/up events,
    // instead of making KineticJS objects draggable
    this.dragData = new DragData({});
    this.selectStart = {x: 0, y: 0};
    this.selectRect;
    this.selecting = false;
    this.drawing = false;
    this.strokes = [];

    background.on("mousedown", function(event) {
      if (!self.selecting && self.state.selecting()) {
        self.selectStart.x = event.offsetX;
        self.selectStart.y = event.offsetY;
        self.selecting = true;
        self.selectRect = new Kinetic.Rect({
          x: self.selectStart.x,
          y: self.selectStart.y,
          width: 1,
          height: 1,
          stroke: 'orange',
          fill: 'blue',
          opacity: 0.1,
          strokeWidth: 1 
        });
        self.layer.add(self.selectRect);
      } else if (self.state.drawing()) {
        self.drawing = true;
        self.stroke = new Kinetic.Line({
          points: [event.offsetX, event.offsetY],
          stroke: 'grey',
          strokeWidth: 3,
          lineJoin: 'round',
          lineCap: 'round',
          tension:  20
        });
        self.layer.add(self.stroke);
      } else if (self.state.filling()) {
      }
    });
    this.layer.on("mousemove", function(event) {
      if (self.dragData.get('dragging')) {
        var offset = self.dragData.get('offset');
        var sketch = self.dragData.get('sketch');
        var position = {x: event.offsetX - offset.x,
                        y: event.offsetY - offset.y};
        sketch.setPosition(position);
        self.layer.draw();
      } else if (self.selecting) {
        var current = {
          x: event.offsetX,
          y: event.offsetY
        };
        var width = current.x - self.selectStart.x;
        var height = current.y - self.selectStart.y;
        self.selectRect.setWidth(width);
        self.selectRect.setHeight(height);
        self.sketches.map(function(s) {
          s.selectIfIntersects(self.selectRect);
        });
        self.layer.draw();
      } else if (self.drawing) {
        self.stroke.addPoint(event.offsetX, event.offsetY);
        self.layer.draw();
      }
    });
    $(this.container).on("mouseup", function(event) {
      if (self.dragData.get('dragging')) {
        var sketch = self.dragData.get('sketch');
        sketch.destroy();
        var name;
        for (var i = 1; i <= 40; i++) {
          name = 'list'+i;
          var datum = self.data.findWhere({name: name});
          if (datum == null)
            break;
        }
        var offset = self.dragData.get('offset');
        var sketch = self.dragData.get('sketch');
        var position = {x: event.offsetX - offset.x,
                        y: event.offsetY - offset.y};
        if (self.dragData.get('step') != null) {
          self.steps.trigger('step', {step:self.dragData.get('step')});
        } else {
          var dragExpr = self.dragData.get('expr');
          var dragValues = self.dragData.get('value');
          if (dragValues.length <= 1) {
            dragExpr = new NewListExpr({
              value: dragExpr
            });
          }
          self.data.add(new List({
            name: name,
            initialized: true,
            position: position,
            values: dragValues,
            expr: dragExpr
          }));
        }
        self.dragData.set(self.dragData.defaults());
        self.layer.draw();
      } else if (self.selecting) {
        self.selectRect.destroy();
        self.selecting = false;
        self.layer.draw();
      } else if (self.drawing) {
        if (self.stroke.getPoints().length < 0) {
          self.stroke.destroy();
        } else {
          self.strokes.push(self.stroke);
        }
        self.drawing = false;
        self.layer.draw();
      }
    });

    // The active step view on the stage
    this.activeStepView = new ActiveStepView({
      model: this.activeStep,
      steps: this.steps,
      layer: this.layer,
      globals: this.globals,
      dragData: this.dragData,
      stageWidth: this.stageWidth,
      stageHeight: this.stageHeight
    });
  },

  // Handles drag-and-drop of new data objects from the palette
  // Creates and adds Datum model to Data collection
  handleDrop: function(e) {
    var position = {
      x: e.x - $(this.container).offset().left,
      y: e.y - $(this.container).offset().top
    };
    var type = e.dataTransfer.getData("text/plain");
    var name;
    for (var i = 1; i <= 40; i++) {
      name = type+i;
      var datum = this.data.findWhere({name: name});
      if (datum == null)
        break;
    }
    switch (type) {
      case "list":
        this.data.add(new List({
          name: name,
          position: position,
        }));
        break;
      case "num":
        this.data.add(new Number({
          name: name,
          position: position
        }));
        break;
      case "node":
        this.data.add(new BinaryNode({
          name: name,
          position: position
        }));
        break;
      default:
        break;
    }
  },

  // Render a newly added datum on the stage
  render: function(datum) {
    var self = this;
    var type = datum.get('type');
    switch(type) {
      case "list":
        var sketch = new ListSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData, state: self.state});
        self.sketches.push(sketch);
        sketch.render();
        break;
      case "num":
        var sketch = new NumberSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData});
        self.sketches.push(sketch);
        sketch.render();
        break;
      case "node":
        var sketch = new BinaryNodeSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData});
        self.sketches.push(sketch);
        sketch.render();
        break;
      default:
        break;
    }
    this.layer.draw();
  },
});

var StepsView = Backbone.View.extend({
  el: "#steps",

  initialize: function(options) {
    var self = this;
    this.data = options.data;
    this.steps = options.steps;
    this.activeStep = options.activeStep;
    this.trace = options.trace;
    this.language = 'python';

    this.indent = 0;
    
    _.bindAll(this, 'render', 'handleStep', 'updateTrace', 'updateDataFromTrace', 'startPlayback', 'pausePlayback');

    this.$el.html(_.template($("#steps-template").html()));

    this.data.on("step", this.handleStep);       
    this.steps.on("step", this.handleStep);       

    this.data.on("change:name", this.render);

    this.steps.on("add", this.render);
    this.steps.on("add", this.updateTrace);
    
    this.steps.on("change", this.render);

    this.trace.on("reset", this.updateDataFromTrace);

    this.activeStep.on("change", this.render);

    // Lines: 1 to N
    // Steps: 0 to N-1
    this.stepBack = function() {
      var line = self.activeStep.get('line');
      if (line > 1) {
        line -= 1;
        var step = self.steps.at(line-1);
        self.activeStep.set({step: step, line: line});
        self.updateDataFromTrace();
        return true;
      }
      return false;
    };
    this.stepForward = function() {
      var line = self.activeStep.get('line');
      if (line < self.steps.size()) {
        line += 1;
        var step = self.steps.at(line-1);
        self.activeStep.set({step: step, line: line});
        if (!step.animate(self.updateDataFromTrace))
          self.updateDataFromTrace();
        return true;
      }
      return false;
    };
    
    // buttons
    $("#back").click(this.stepBack);
    $("#forward").click(this.stepForward);
    $("#unindent").click(function() {
      self.steps.trigger('step', {indent:-1});
    });
    $(document).keydown(function(e) {
      switch(e.which) {
        case 37:
          self.stepBack();
          return;
        case 39:
          self.stepForward();
          return;
        case 83: //s
        case 68: //d
        case 70: //f
      }
    });

    // language
    $("#language-select").change(function(event) {
      self.language = this.value;
      self.render();
    });
    
    $("#record").click(function() {
      var recording = $(this).html() != "stop recording";
      if (recording) {
        $(this).html("stop recording");
      } else {
        $(this).html("record mic <span class='glyphicon glyphicon-headphones'></span>");
      }
    });
      
    $("#playback").click(function() {
      if (self.playing == undefined || ! self.playing)
        self.startPlayback();
      else
        self.pausePlayback();
    });

    /*
    $("#slider").slider({
      value: 0,
      orientation: 'vertical',
    });
    */

  },

  startPlayback: function() {
    var self = this;
    this.playing = true;
    $("#playback").html("pause <span class='glyphicon glyphicon-pause'></span>");
    this.player = setInterval(function() {
      if (! self.stepForward()) {
        self.pausePlayback();
      }
    }, 750);
  },
  
  pausePlayback: function() {
    var self = this;
    this.playing = false;
    clearInterval(this.player);
    $("#playback").html("play <span class='glyphicon glyphicon-play'></span>");
  },

  // step generated from some sketch interaction
  handleStep: function(event) {
    var indent = event.indent;
    if (indent !== undefined) {
      this.indent += indent;
    }
    var step = event.step;
    if (step !== undefined) {
      step.set({indent: this.indent});
      this.steps.add(step);
    }
  },

  updateTrace: function() {
    var self = this;
    var backend_script = "opt/web_exec.py";
    var options = {cumulative_mode: false,
                   heap_primitives: false,
                   show_only_outputs: false};
    var user_script = BinaryNodeCode.join("\n");
    user_script += this.steps.map(function(step) {return step.toCode();}).join("\n");
    $.get(backend_script,
          {user_script: user_script,
           raw_input_json: '',
           options_json: JSON.stringify(options)},
          function(dataFromBackend) {
            var trace = dataFromBackend.trace;
            // Handle a BDB traceback
            if (trace.length == 1 && trace[0].event == 'uncaught_exception') {
              self.activeStep.set({step: self.steps.last(), line: self.steps.size()});
              console.log("Error: " + trace[0].exception_msg);
            // Otherwise, FF to the end and reset the trace
            } else {
              self.activeStep.set({step: self.steps.last(), line: self.steps.size()});
              self.trace.reset(trace);
            }
          },
          "json");
  },

  updateDataFromTrace: function() {
    var line = this.activeStep.get('line') + BinaryNodeCode.length;
    // find traceStep with line number > line
    // trace steps show state before the trace.line has run. so we need trace.line > currLine.
    var traceStep;
    for (var index = 0; index < this.trace.length; index++) {
      var t = this.trace.at(index);
      if (t.get('line') > line) {
        traceStep = t;
        break;
      }
    }
    if (traceStep == undefined) traceStep = this.trace.last();

    var ordered_globals = traceStep.get('ordered_globals');
    var globals = traceStep.get('globals');
    var heap = traceStep.get('heap');
    // hide uninitialized data
    this.data.each(function(datum) {
      datum.set({visible: datum.getSymbol() in globals});
    });
    // build a map from heap references to data
    var heapMap = {};
    for (var i = 0; i < ordered_globals.length; i++) {
      var name = ordered_globals[i];
      var datum = this.data.findWhere({name: name});
      var value = globals[name];
      if (isArray(value) && value[0] == "REF")
        heapMap[value[1]] = datum;
    }

    // update the data values (should trigger re-rendering)
    for (var i = 0; i < ordered_globals.length; i++) {
      var name = ordered_globals[i];
      if (name in globals) {
        var datum = this.data.findWhere({name: name});
        if (datum == undefined)
          continue;
        var value = globals[name];
        // numbers and lists of numbers only for now
        if (isPrimitiveType(value) && datum.get('type') == 'num') {
          datum.set({value: value});
          datum.trigger('change');
        } else if (isPrimitiveType(value) && datum.get('type') == 'bool') {
          var boolVal = value ? "True" : "False";
          datum.set({value: boolVal});
          datum.trigger('change');
        } else if (isArray(value) && datum.get('type') == 'list') {
          var refNumber = value[1];
          var values = heap[refNumber];
          if (values[0] == "LIST") {
            values.splice(0,1);
          } else if (typeof values[0] == "string") {
            console.log("unrecognized type for " + name + ": " + values[0]);
            console.log(traceStep.toJSON());
            continue;
          }
          datum.set({values: values});
          datum.trigger('change');
        } else if (isArray(value) && datum.get('type') == 'node') {
          var refNumber = value[1];
          var attrs = heap[refNumber];
          var values = {};
          attrs.map(function(attr) {
            if (! isArray(attr))
              return;
            var attrName = attr[0];
            var attrValue = attr[1];
            if (isArray(attrValue)) {
              attrValue = heapMap[attrValue[1]];
              values[attrName] = attrValue;
            } else if (isPrimitiveType(attrValue)) {
              values[attrName] = attrValue;
            }
          });
          datum.set(values);
          datum.trigger('change');
        }
      }
    }
    // update fill colors
    this.steps.each(function(step, index) {
      if (index <= line-1 && step.get('action') == 'fill') {
        var datum = step.get('list');
        var index = step.get('index');
        var color = step.get('color');
        datum.trigger('fill', {index: index, color: color});
      }
    });
  },
  
  // render steps
  render: function() {
    var self = this;
    var activeLine = this.activeStep.get('line');
    this.$("#steps-body").html("");
    this.steps.each(function(step, index) {
      var line = index + 1;
      var view = new StepListView({model: step});
      var el = view.render(self.language).el;
      this.$("#steps-body").append(el);
      if (line == activeLine)
        $(el).find("code").addClass('active');
      $(el).find("a").click(function() {
        self.activeStep.set({step: step, line: line});
        self.updateDataFromTrace();
      });
    });
  }
});

var StepListView = Backbone.View.extend({
  tagName:  "li",

  initialize: function() {
    _.bindAll(this, 'render');
  },

  render: function(lang) {
    var code = this.model.toCode(true, lang);
    var template = _.template($('#step-template').html());
    $(this.el).html(template({code: code}));
    return this;
  }
});

