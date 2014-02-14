var box_dim = 45;
var box_shift = 3;
var expanded_shift = box_dim;
var node_dim = 1.25*box_dim;
var stageHeight = 550;
var labelFontSize = 15;
var dragTimeout = 150;

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
    if (mode != 'select') {
      $("#color-picker").show();
    } else {
      $("#color-picker").hide();
    }
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
    _.bindAll(this, 'render', 'getSketchByDatum', 'handleDataDrop', 'handleDrag', 'handleRelease');

    // Setup the KineticJS stage
    this.stageWidth = $("#stage").width();
    this.stageHeight = stageHeight;
    var stage = new Kinetic.Stage({
        container: 'stage',
        width: this.stageWidth,
        height: this.stageHeight
    });    

    // The background object, and a Group for globals
    var background = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: this.stageWidth,
        height: this.stageHeight,
        fill: '#E8E8E8'
    });
    var backLayer = new Kinetic.Layer();
    backLayer.add(background);
    stage.add(backLayer);

    this.layer = new Kinetic.Layer();
    stage.add(this.layer);
    this.globals = new Kinetic.Group({name: 'globals'});
    this.layer.add(this.globals);
    this.layer.draw();

    // Handle events on the stage
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
    this.container.addEventListener("drop", this.handleDataDrop);

    // When objects are added, re-render the stage
    this.data.on("add", this.render);

    // Dragging data around on the stage
    // Move the data using mousedown/move/up events,
    // instead of making KineticJS objects draggable
    this.dragData = new DragData();
    this.selectStart = {x: 0, y: 0};
    this.selectRect;
    this.selecting = false;
    this.drawing = false;
    this.strokes = [];

    // clicking on the background results in
    // selecting or drawing
    background.on("mousedown", function(event) {
      if (!self.selecting && self.state.selecting()) {
        //TODO: Deselect on click
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

    stage.on("mousemove", function(event) {
      // Dragging an object
      if (self.dragData.get('dragging')) {
        self.handleDrag(event);
      // Rectangular selection
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
      // Drawing a stroke
      } else if (self.drawing) {
        self.stroke.addPoint(event.offsetX, event.offsetY);
        self.layer.draw();
      }
    });

    // Handle mouse-up for
    // - dragging an object (executing the step that has been previewed)
    // - making a selection final
    // - ending a drawn stroke
    $(this.container).on("mouseup", function(event) {
      if (self.dragData.get('dragging')) {
        self.handleRelease(event);
      } else if (self.selecting) {
        self.selectRect.destroy();
        self.selecting = false;
        self.layer.draw();
      } else if (self.drawing) {
        if (self.stroke.getPoints().length < 0)
          self.stroke.destroy();
        else
          self.strokes.push(self.stroke);
        self.drawing = false;
        self.layer.draw();
      }
    });
  },

  // Get the sketch for a particular datum
  getSketchByDatum: function(datum) {
    for (var i = 0; i < this.sketches.length; i++) {
      var sketch = this.sketches[i];
      if (sketch.model.get('name') == datum.get('name'))
        return sketch;
    }
  },

  getNewDatumName: function(type) {
    var name;
    for (var i = 1; i <= 40; i++) {
      name = type+i;
      var datum = this.data.findWhere({name: name});
      if (datum == null)
        return name;
    }
  },

  // Handle dragging of objects
  // - Look for interactions with other objects
  //  - Preview the resulting changes
  // - Otherwise, just move the dragged object (kinetic node)

  /* What's in dragData?
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

    // State of the drag
    exited: false,
    dwelled: false,
    engagedSketch: null,
    engagedBehavior: null,

    // Resulting step
    step: null,
  */
  handleDrag: function(event) {
    var self = this;
    // Get new position of the dragged object
    var offset = this.dragData.get('offset');
    var cursor = {x: event.offsetX, y: event.offsetY};
    var position = {x: cursor.x - offset.x,
                    y: cursor.y - offset.y};
    
    // Get some drag data
    var sketch = this.dragData.get('sketch');
    var kinetic = this.dragData.get('kinetic');
    var model = sketch.model;
    var type = model.get('type');
    var dwelled = this.dragData.get('dwelled');
    var exited = this.dragData.get('exited');

    if (type == 'binary') {
      var nodeOffset = self.dragData.get('nodeOffset');
      var nodePosition = {  x: event.offsetX - nodeOffset.x,
                            y: event.offsetY - nodeOffset.y};

      // look for intersections
      var moveNode = true;
      for (var i = 0; i < self.sketches.length; i++) {
        var s = self.sketches[i];
        var otherModel = s.model;
        if (otherModel.get('type') != 'binary' || 
            otherModel.get('name') == sketch.model.get('name'))
          continue;

        if (s.intersectsNode(nodePosition)) {
          moveNode = false;
          if (s.showComparison(sketch))  {
            var step = new Compare({
              drag: sketch.model,
              against: s.model,
              dragSketch: sketch,
              againstSketch: s
            });
            sketch.model.trigger('step', {step: step});
          }
        // otherwise, check for end-of-pointer intersection
        // this shouldn't come up if there's a node at the end of the pointer (intersectsNode)
        } else if (s.intersectsHead(nodePosition)) {
          moveNode = false;
          s.hideFollow();
          var side = s.intersectsHead(nodePosition);
          // preview the insertion
          if (sketch.showInsertion(s, side)) {
            // trigger the step
            var step = new BinaryNodeInsert({
              parent: s.model,
              side: side,
              child: sketch.model
            });
            self.dragData.set({step: step});
          }
        // lastly, check for pointer intersection
        } else if (s.intersectsPointer(nodePosition)) {
          moveNode = false;
          var side = s.intersectsPointer(nodePosition);
          if (s.showFollow(sketch, side)) {
            var step = new Follow({
              drag: sketch.model,
              from: s.model,
              side: side,
              dragSketch: sketch,
              fromSketch: s
            });
            sketch.model.trigger('step', {step: step});
          }
        // if the dragged node doesn't overlap anything in the candidate node, then hide any changes
        } else {
          s.hideComparison();
          s.hideFollow();
        }
      }
      if (moveNode) {
        // check if the node has parents
        if (sketch.model.get('parent') != null) {
          var parentModel = sketch.parent.model;
          var side = sketch.parent.getChildSide(sketch.model);
          sketch.model.set({'parent': null});
          // trigger the detachment
          var step = new BinaryNodeDetach({
            parent: parentModel, 
            side: side,
            child: sketch.model
          });
          sketch.model.trigger('step', {step: step});
        }
        if (sketch.hideInsertion())
          self.dragData.set({step: null});
        // move the node (should move any subtrees)
        sketch.moveTo(position);
      }
      return;
    }

    // Get the bounding box for the dragged object 
    kinetic.setPosition(position);
    var bounds = getGroupRect(kinetic);

    // Preview interactions with other objects, if any
    var interacting = false;
    for (var i = 0; i < this.sketches.length; i++) {
      var otherSketch = this.sketches[i];
      var otherModel = otherSketch.model;
      if (otherSketch.previewInteraction(sketch, bounds)) {
        interacting = true;
        break;
      } else {
        otherSketch.hideInteractions();
      }
    }

    if (! interacting) {
      kinetic.show();
      this.dragData.set({step: null});
    }
    this.layer.draw();
    return;
    /*
    // TYPE: NODE
    } else if (sketch.model && sketch.model.get('type') == 'edge') {
      // look for intersections
      var moveEdge = true;
      var side = self.dragData.get('side');
      for (var i = 0; i < self.sketches.length; i++) {
        var s = self.sketches[i];
        var otherModel = s.model;
        if (otherModel.get('type') != 'node')
          continue;

        if (s.pointIntersectsNode(position)) {
          moveEdge = false;
          if (sketch.showAttachment(s, side)) {
            var step = new EdgeAttachment({
              parent: s.model,
              side: side,
              child: sketch.model
            });
            self.dragData.set({step: step});
          }
        }
      }
      if (moveEdge) {
        sketch.render();
        sketch.hideAttachment();
      }
    } else if (sketch.model && sketch.model.get('type') == 'num') {
      sketch.moveTo(position);
    }
    */
  },

  handleRelease: function(event) {
    // Get new position of the dragged object
    var offset = this.dragData.get('offset');
    var position = {x: event.offsetX - offset.x,
                    y: event.offsetY - offset.y};
    
    // Get some drag data
    var sketch = this.dragData.get('sketch');
    var kinetic = this.dragData.get('kinetic');
    var model = sketch.model;
    var type = model.get('type');
    
    if (type == 'binary') {
      sketch.hideInsertion(true);
      if (this.dragData.get('step') != null)
        this.steps.trigger('step', {step:this.dragData.get('step')});
      else
        sketch.model.set({position: position});
      this.dragData.set(this.dragData.defaults());
      this.layer.draw();
      return;
    }

    if (type == 'list') {
      sketch.poppedIndex = null;
    }

    // Trigger the previewed step, if it exists
    var step = this.dragData.get('step');
    if (step != null)
      this.steps.trigger('step', {step: step});

    // Otherwise, handle the release onto the background
    // Usually means creating a new datum
    else {
      var name = this.getNewDatumName(type);
      switch (type) {
        case "list":
          // If dropped inside the list
          // and there's no step, it's a no-op
          if (sketch.expanded)
            break;
          var dragExpr = this.dragData.get('expr');
          var dragValues = this.dragData.get('value');
          // Create the new list
          // Should trigger a new step and rendering of a new list
          this.data.add(new List({
            name: name,
            position: position,
            values: dragValues,
            expr: dragExpr
          }));
          break;

        default:
          sketch.model.set({position: position});
          break;
      }
    }

    // Destroy the dragged Kinetic shapes
    kinetic.destroy();
    // Reset the dragData object
    this.dragData.set(this.dragData.defaults());
    // Hide interactions
    for (var i = 0; i < this.sketches.length; i++)
      this.sketches[i].hideInteractions();
    this.layer.draw();
    return;

    if (sketch.model && sketch.model.get('type') == "binary") {
      sketch.hideInsertion(true);
      if (this.dragData.get('step') != null)
        this.steps.trigger('step', {step:this.dragData.get('step')});
      else
        sketch.model.set({position: position});
    } else if (sketch.model && sketch.model.get('type') == "edge") {
      if (this.dragData.get('side') == 'start')
        sketch.model.set({position: position});
    } else if (sketch.model && sketch.model.get('type') == "num") {
      if (this.dragData.get('step') != null)
        this.steps.trigger('step', {step:this.dragData.get('step')});
      else
        sketch.model.set({position: position});
    } else {
      sketch.destroy();
      if (this.dragData.get('step') != null) {
        this.steps.trigger('step', {step:this.dragData.get('step')});
      } else {
        var dragExpr = this.dragData.get('expr');
        var dragValues = this.dragData.get('value');
        if (isArray(dragValues)) {
          this.data.add(new List({
            name: name,
            position: position,
            values: dragValues,
            expr: dragExpr
          }));
        } else {
          var name;
          for (var i = 1; i <= 40; i++) {
            name = 'num'+i;
            var datum = this.data.findWhere({name: name});
            if (datum == null)
              break;
          }
          this.data.add(new Number({
            name: name,
            position: position,
            value: dragValues
          }));
        }
      }
    }
    this.dragData.set(this.dragData.defaults());
    this.layer.draw();
  },

  // Handles drag-and-drop of new data objects from the palette
  // Creates and adds Datum model to Data collection
  handleDataDrop: function(e) {
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
      case "binary":
        this.data.add(new BinaryNode({
          name: name,
          position: position
        }));
        break;
      case "node":
        this.data.add(new Node({
          name: name,
          position: position
        }));
        break;
      case "edge":
        this.data.add(new Edge({
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
      case "binary":
        var sketch = new BinaryNodeSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData, canvas: self});
        self.sketches.push(sketch);
        sketch.render();
        break;
      case "node":
        var sketch = new NodeSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData, canvas: self});
        self.sketches.push(sketch);
        sketch.render();
        break;
      case "edge":
        var sketch = new EdgeSketch({model: datum, layer: self.layer, globals: self.globals, dragData: self.dragData, canvas: self});
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
      } else if (line == 1 && self.steps.isEmpty()) {
        self.activeStep.set(self.activeStep.defaults());
        self.updateDataFromTrace();
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

    this.undo = function() {
      var step = self.steps.remove(self.steps.last());
      // remove the datum if it it was an initialization
      if (step.get('action') == 'assignment' && step.get('isInitialization')) {
        var datum = step.get('variable');
        self.data.remove(datum);
        datum.destroy();
      }
      self.stepBack();
    };
    
    // buttons
    $("#back").click(this.stepBack);
    $("#forward").click(this.stepForward);
    $("#undo").click(this.undo);
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
        case 90: //ctrl+z = undo
          self.undo();
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
    
    var user_script = ClassDefinitions.toCode();
    user_script += this.steps.map(function(step) {return step.toCode();}).join("\n");
    /*
    var scriptLines = user_script.split('\n');
    for (var i = 0; i < scriptLines.length; i++)
      console.log((i+1) + ": " + scriptLines[i]);
    */

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
    var self = this;

    var line = this.activeStep.get('line') + ClassDefinitions.numLines();
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

    //console.log("");
    //console.log("updating from trace");
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

    // clear the pointers nodes, updated through trace
    this.data.each(function(datum) {
      if (datum.get('type') == 'binary')
        datum.set({parent: null, left: null, right: null}, {silent: true});
    });

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
          datum.set({value: value}, {silent: true});
          datum.trigger('change');
        } else if (isPrimitiveType(value) && datum.get('type') == 'bool') {
          var boolVal = value ? "True" : "False";
          datum.set({value: boolVal}, {silent: true});
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
          datum.set({values: values}, {silent: true});
          datum.trigger('change');
        } else if (isArray(value) && datum.get('type') == 'binary') {
          var refNumber = value[1];
          var attrs = heap[refNumber];
          var values = {};
          attrs.map(function(attr) {
            if (! isArray(attr))
              return;
            var attrName = attr[0];
            var attrValue = attr[1];
            if (isArray(attrValue)) {
              // pointer from one node to another
              // attrName should be left or right
              attrValue = heapMap[attrValue[1]];
              values[attrName] = attrValue;
              //console.log("setting parent of " + attrValue.get("name") + " to " + datum.get('name'));
              attrValue.set({parent: datum}, {silent: true});
            } else if (isPrimitiveType(attrValue)) {
              values[attrName] = attrValue;
            }
          });
          //console.log("setting data for " + datum.get("name"));
          datum.set(values, {silent: true});
        }
      }
    }
    this.data.each(function(datum) {
      if (datum.get('type') == 'binary')
        datum.trigger('change');
    });
    // update fill colors
    this.steps.each(function(step, index) {
      if (index <= line-1 && step.get('action') == 'fill') {
        var datum = step.get('list');
        var index = step.get('index');
        var color = step.get('color');
        datum.trigger('fill', {index: index, color: color});
      }
    });

    // update comparisons
    this.steps.each(function(step, index) {
      if (step.get('action') == 'compare' &&
          index != self.activeStep.get('line')-1)
          step.get('against').trigger('hideComparison');
    });
    var step = this.activeStep.get('step');
    if (step.get('action') == 'compare')
      step.get('against').trigger('showComparison', step.get('dragSketch'));
    
    // update follows
    this.steps.each(function(step, index) {
      if (step.get('action') == 'follow' &&
          index != self.activeStep.get('line')-1)
          step.get('from').trigger('hideFollow');
    });
    var step = this.activeStep.get('step');
    if (step.get('action') == 'follow')
      step.get('from').trigger('showFollow', step.get('dragSketch'), step.get('side'));
    
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

