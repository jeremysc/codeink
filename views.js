var box_dim = 45;
var box_shift = 3;
var stageWidth = 850;
var stageHeight = 550;

var PaletteView = Backbone.View.extend({
  el: "#palette",

  initialize: function(options) {
    var self = this;
    this.$el.html(_.template($("#palette-template").html()));
    this.state = options.state;

    $(".add-data").on("dragstart", function(event) {
      event.originalEvent.dataTransfer.setData('text/plain', event.currentTarget.id);
    });

    $("#draw").on("click", function() {
      self.state.mode = 'draw';
      $("#tools button").removeClass('active');
      $("#tools button").removeClass('btn-primary');
      $("#tools button").addClass('btn-default');
      $(this).removeClass('btn-default');
      $(this).addClass('active');
      $(this).toggleClass('btn-primary');
    });
    $("#select").on("click", function() {
      self.state.mode = 'select';
      $("#tools button").removeClass('active');
      $("#tools button").removeClass('btn-primary');
      $("#tools button").addClass('btn-default');
      $(this).removeClass('btn-default');
      $(this).addClass('active');
      $(this).toggleClass('btn-primary');
    });
    $("#fill").on("click", function() {
      self.state.mode = 'fill';
      $("#tools button").removeClass('active');
      $("#tools button").removeClass('btn-primary');
      $("#tools button").addClass('btn-default');
      $(this).removeClass('btn-default');
      $(this).addClass('active');
      $(this).toggleClass('btn-primary');
    });
    $(".color").colorpicker();
    $(".color").colorpicker().on('changeColor', function(ev) {
      self.state.color = ev.color.toHex();
    });
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
    if (dropTarget) {
      label.on("mouseover", function() {
        var tag = this.getTag();
        tag.setStroke('black');
        self.layer.draw();
      });
      label.on("mouseout", function() {
        var tag = this.getTag();
        tag.setStroke('');
        self.layer.draw();
      });
      // handle dragging of variables in
      label.on("mouseenter", function(event) {
        if (self.dragData.get('dragging') && ! self.dragData.get('engaged')) {
          self.dragData.set({engaged: true});
          // hide the dragged data
          self.dragData.get('sketch').hide();
          // set the part 
          expr.dragChange(partName, self.dragData.get('expr'));
          self.tempStep.trigger('change');
        }
      });
      label.on("mouseleave", function(event) {
        if (self.dragData.get('dragging') && self.dragData.get('engaged')) {
          self.dragData.set({engaged: false});
          // reset the text
          expr.dragReset(partName);
          self.tempStep.trigger('change');
          // show the sketch
          self.dragData.get('sketch').show();
        }
      });
      label.on("mouseup", function(event) {
        //TODO fix flickering for dragging list items into step
        if (self.dragData.get('dragging') && self.dragData.get('engaged')) {
          var step = self.model.get('step');
          step.set(self.tempStep.toJSON());
          self.model.set({step: step});
          self.model.trigger('change');
          self.dragData.get('sketch').destroy();
          self.dragData.set(self.dragData.defaults());
          //self.layer.draw();
        }
      });
    }
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
          opacity: 0.05,
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
    
    _.bindAll(this, 'render', 'handleStep', 'handleScrub', 'updateTrace_add', 'updateTrace_change', 'updateDataFromTrace');

    this.$el.html(_.template($("#steps-template").html()));

    this.data.on("step", this.handleStep);       
    this.steps.on("step", this.handleStep);       

    this.data.on("change:name", this.render);

    this.steps.on("add", this.render);
    this.steps.on("add", this.updateTrace_add);
    
    this.steps.on("change", this.render);
    this.steps.on("change", this.updateTrace_change);

    this.trace.on("reset", this.updateDataFromTrace);

    this.activeStep.on("change", this.render);
    this.activeStep.on("scrub", this.handleScrub);

    var stepBack = function() {
      var id = self.activeStep.get('id');
      if (id > 1) {
        id -= 1;
        var traceStep = self.trace.at(id-1);
        var line = traceStep.get('line'); 
        self.activeStep.set({step: self.steps.at(line-1), line: line, id: id});
        self.updateDataFromTrace();
      }
    };
    var stepForward = function() {
      var id = self.activeStep.get('id');
      if (id < self.trace.size()-1) {
        id += 1;
        var traceStep = self.trace.at(id-1);
        var line = traceStep.get('line');
        var step = self.steps.at(line-1);
        self.activeStep.set({step: self.steps.at(line-1), line: line, id: id});
        if (!step.animate(self.updateDataFromTrace))
          self.updateDataFromTrace();
      }
    };

    // buttons
    $("#back").click(stepBack);
    $("#forward").click(stepForward);
    $("#unindent").click(function() {
      self.steps.trigger('step', {indent:-1});
    });
    $(document).keydown(function(e) {
      switch(e.which) {
        case 37:
          stepBack();
          return;
        case 39:
          stepForward();
          return;
      }
    });

    // language
    $("#language-select").change(function(event) {
      self.language = this.value;
      self.render();
    });

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

  handleScrub: function(event) {
    var line = event.line;
    var id = event.id;
    this.activeStep.set({step: this.steps.at(line-1), line: line, id: id});
    this.updateDataFromTrace();
  },

  updateTrace_add: function() {
    var self = this;
    var backend_script = "opt/web_exec.py";
    var options = {cumulative_mode: false,
                   heap_primitives: false,
                   show_only_outputs: false};
    var user_script = this.steps.map(function(step) {return step.toCode();}).join("\n");
    $.get(backend_script,
          {user_script: user_script,
           raw_input_json: '',
           options_json: JSON.stringify(options)},
          function(dataFromBackend) {
            var trace = dataFromBackend.trace;
            if (trace.length == 1 && trace[0].event == 'uncaught_exception') {
              self.activeStep.set({step: self.steps.last(), line: self.steps.size(), id: self.activeStep.get('id')+1});
              console.log("Error: " + trace[0].exception_msg);
            } else {
              self.activeStep.set({step: self.steps.last(), line: self.steps.size(), id: self.activeStep.get('id')+1});
              var id = self.activeStep.get('id')+1;
              var step = self.steps.last();
              var line = self.steps.size();
              for (var i = 0; i < trace.length; i++) {
                if (trace[i].line == line) {
                  id = i+1;
                  break;
                }
              }
              self.activeStep.set({step: step, line: line, id: id});
              self.trace.reset(trace);
            }
          },
          "json");
  },
  updateTrace_change: function() {
    var self = this;
    var backend_script = "opt/web_exec.py";
    var options = {cumulative_mode: false,
                   heap_primitives: false,
                   show_only_outputs: false};
    var user_script = this.steps.map(function(step) {return step.toCode();}).join("\n");
    $.get(backend_script,
          {user_script: user_script,
           raw_input_json: '',
           options_json: JSON.stringify(options)},
          function(dataFromBackend) {
            var trace = dataFromBackend.trace;
            if (trace.length == 1 && trace[0].event == 'uncaught_exception') {
              console.log("Error: " + trace[0].exception_msg);
            } else {
              // find first instance of line, if it exists and update the step
              var id = self.activeStep.get('id');
              var line = self.activeStep.get('line');
              for (var i = 0; i < trace.length; i++) {
                if (trace[i].line == line) {
                  self.activeStep.set({id: i+1});
                  break;
                }
              }
              self.trace.reset(trace);
            }
          },
          "json");
  },

  updateDataFromTrace: function() {
    var id = this.activeStep.get('id');
    if (this.trace.size() <= id) {
      return;
    }
    var traceStep = this.trace.at(id);

    var ordered_globals = traceStep.get('ordered_globals');
    var globals = traceStep.get('globals');
    var heap = traceStep.get('heap');
    // hide uninitialized data
    this.data.each(function(datum) {
      datum.set({visible: datum.getSymbol() in globals});
    });
    for (var i = 0; i < ordered_globals.length; i++) {
      var name = ordered_globals[i];
      if (name in globals) {
        var datum = this.data.findWhere({name: name});
        var value = globals[name];
        // numbers and lists of numbers only for now
        if (isPrimitiveType(value) && datum.get('type') == 'num') {
          datum.set({value: value});
        } else if (isPrimitiveType(value) && datum.get('type') == 'bool') {
          var boolVal = value ? "True" : "False";
          datum.set({value: boolVal});
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
        }
      }
    }
  },
  
  render: function() {
    var self = this;
    var activeLine = this.activeStep.get('line');
    this.$("#steps-body").html("");
    this.steps.each(function(step, line) {
      line += 1;
      var view = new StepListView({model: step});
      var el = view.render(self.language).el;
      this.$("#steps-body").append(el);
      if (line == activeLine)
        $(el).find("code").addClass('active');
      $(el).find("a").click(function() {
        var traceStep = self.trace.findWhere({line: line});
        var id = self.trace.indexOf(traceStep)+1;
        self.activeStep.set({step: step, line: line, id: id});
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

