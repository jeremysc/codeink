var FingerSketch = DatumSketch.extend({
  model: Node,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'remove', 'render', 'renderEdge', 'renderHandle', 'renderLine', 'renderHead', 'renderWeight', 'fill', 'selectIfIntersects', 'deselect', 'startDrag', 'previewInteraction', 'hideInteractions', 'cancelDwell', 'adjustEdge', 'wasAttachedToNode');
    this.timeouts = [];
    this.intervals = [];

    // Standard global variables
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.canvas = options.canvas;

    // Node-specific properties
    this.selected = false;
    this.start = null; 
    this.end = null; 
    this.previewSide = null;

    this.endPosition = {x: 80, y: 0};

    // Prompt user to initialize the node value
    var step = new Assignment({
      variable: this.model,
      value: edgeExpr,
      isInitialization: true
    });
    this.model.trigger('step', {step: step});

    // Setup the KineticJS group
    var position = this.model.get('position');
    this.group = new Kinetic.Group({
      name: this.model.getSymbol(),
      x: position.x,
      y: position.y
    });
    this.group.on("dragend", function(event) {
      self.model.set({position: this.getPosition()});
    });
    this.group.on("click", function() {
      self.cancelDwell();
    });

    this.model.on('change', this.render);
    this.model.on('destroy', this.remove);
    this.model.on('fill', this.fill);
  },
  
  fill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
  },
  deselect: function(rect) {
  },
  cancelDwell: function() {
    this.clearTimeouts();
    this.clearIntervals();
    if (this.dwellCircle && this.dwellCircle != null) {
      this.dwellCircle.remove();
      this.dwellCircle = null;
    }
  },
  
  // Re-render the sketch
  render: function(event) {
    var self = this;

    // Clear the group from the stage
    this.group.removeChildren();
    this.group.remove();

    // Hide the group if not visible in the trace yet
    if (! this.model.get('visible')) {
      this.layer.draw();
      return;
    }

    // Draw the edge
    this.renderEdge();

    this.layer.add(this.group);
    this.layer.draw();
  },

  // Render the edge
  renderEdge: function() {
    if (this.dragType == null)
      this.updateNeighbors();

    this.setPositions();

    this.renderLine();
    this.renderHandle();
    this.renderHead();
  },

  setPositions: function() {
    // Get the start and end positions
    // based on current attachments
    var startPos, endPos;
    if (this.start != null &&
        this.end != null) {
      startPos = this.start.getGlobalCenter();
      endPos = this.end.getGlobalCenter();
      var edgeNormal = normal(startPos, endPos);
      startPos = {
        x: startPos.x + edgeNormal.x*node_dim/2,
        y: startPos.y + edgeNormal.y*node_dim/2
      };
      endPos = {
        x: endPos.x - edgeNormal.x*node_dim/2,
        y: endPos.y - edgeNormal.y*node_dim/2
      };
    } else if (this.start != null) {
      startPos = this.start.getGlobalCenter();
      endPos = this.getGlobal(this.endPosition);
      var edgeNormal = normal(startPos, endPos);
      startPos = {
        x: startPos.x + edgeNormal.x*node_dim/2,
        y: startPos.y + edgeNormal.y*node_dim/2
      };
    } else if (this.end != null) {
      startPos = this.group.getPosition();
      endPos = this.end.getGlobalCenter();
      var edgeNormal = normal(startPos, endPos);
      endPos = {
        x: endPos.x - edgeNormal.x*node_dim/2,
        y: endPos.y - edgeNormal.y*node_dim/2
      };
    } else {
      return;
    }

    // move the group
    this.group.setPosition(startPos);
    // set the local endpoint
    this.endPosition = this.getLocal(endPos);
  },

  renderHandle: function() {
    var self = this;
    var dragging = this.dragType == 'start';
    var position = {x: 0, y:0};
    this.handle = new Kinetic.Circle({
      x: position.x,
      y: position.y,
      radius: dragging ? 10 : 5,
      fill: dragging ? 'red' : 'black'
    });
    this.handle.on("mouseenter", function() {
      if (self.dragData.get('dragging'))
        return;
      this.setRadius(10);
      this.setFill('red');
      self.layer.draw();
    });
    this.handle.on("mouseleave", function() {
      this.setRadius(5);
      this.setFill('black');
      self.layer.draw();
    });
    this.handle.on("mousedown", function(event) {
      // Timer to start the drag
      self.addTimeout(function(event) {
        self.dragType = 'start';
        self.startDrag(event);
      }, 150, event);
    });
    this.group.add(this.handle);
  },

  renderLine: function() {
    var self = this;
    var start = {x: 0, y:0};
    var end = this.endPosition;
    // draw the pointer
    this.line = new Kinetic.Line({
      points: [
        start.x, start.y,
        end.x, end.y
      ],
      strokeWidth: 3
    });
    this.group.add(this.line);
  },
  
  renderHead: function() {
    var self = this;
    var dragging = this.dragType == 'end';
    var position = this.endPosition;
    var angleDeg = Math.atan2(position.y, position.x) * (180 / Math.PI) + 90;
    this.head = new Kinetic.RegularPolygon({
      x: position.x,
      y: position.y,
      sides: 3,
      radius: 10,
      fill: dragging ? 'red' : 'black',
      stroke: dragging ? 'red' : 'black',
      strokeWidth: 3,
      lineJoin: 'round',
      rotationDeg: angleDeg,
    });
    this.head.on("mouseenter", function() {
      if (self.dragData.get('dragging'))
        return;
      this.setFill('red');
      this.setStroke('red');
      self.layer.draw();
    });
    this.head.on("mouseleave", function() {
      if (self.dragData.get('dragging'))
        return;
      this.setFill('black');
      this.setStroke('black');
      self.layer.draw();
    });
    this.head.on("mousedown", function(event) {
      // Timer to start the drag
      self.addTimeout(function(event) {
        self.dragType = 'end';
        self.startDrag(event);
      }, 150, event);
    });
    this.group.add(this.head);
  },

  startDrag: function(event) {
    var kinetic, expr, value;
    var groupPosition = this.group.getPosition();
    // get grab offset
    var offset = {  x: event.offsetX - groupPosition.x,
                    y: event.offsetY - groupPosition.y};
    offset = { x: 0, y: 0 };

    // set the expression and value
    //expr = new AttrExpr({object: this.model, attr: this.dragType}),
    value = this.model.getValue();

    kinetic = this.group;
    var bounds = getGroupRect(kinetic);
    
    this.dragData.set({
      dragging: true,
      sketch: this,
      kinetic: kinetic,
      originalBounds: bounds,
      expr: null,
      value: value,
      offset: offset,
      step: null,
      exited: false,
      dwelled: false
    });

    this.deselect();
  },

  adjustEdge: function(position) {
    if (this.dragType == 'start') {
      var prevEnd = this.getGlobal(this.endPosition);
      this.group.setPosition(position);
      this.endPosition = this.getLocal(prevEnd);
    } else if (this.dragType == 'end') {
      this.endPosition = this.getLocal(position);
    }
    this.render();
  },

  getLocal: function(position) {
    var groupPos = this.group.getPosition();
    return {  x: position.x - groupPos.x,
              y: position.y - groupPos.y };
  },

  getGlobal: function(position) {
    var groupPos = this.group.getPosition();
    return {  x: position.x + groupPos.x,
              y: position.y + groupPos.y };
  },

  // Returns true if there's interaction with this object
  previewInteraction: function(dragSketch, dragBounds) {
    var self = this;

    var kinetic = this.dragData.get('kinetic');
    var exited = this.dragData.get('exited');
    var isSelf = (dragSketch.model.get('name') == this.model.get('name'));

    // First: wait for the node to exit itself
    if (isSelf) {
      if (this.dragType != 'weight')
        return false;
      if (!exited) {
        var originalBounds = this.dragData.get('originalBounds');
        if (! intersectRect(dragBounds, originalBounds)) {
          this.dragData.set({exited: true});
          this.render();
        } else {
          return true;
        }
      }
    }
    
    // No interactions for sublists
    var value = this.dragData.get('value');
    if (isArray(value) && value.length > 1) {
      return false;
    }
    
    // Ignore attachments from dragging nodes for now
    // Handle numbers being dragged into the weight
    return false;
    
    // Check if intersecting with the weight
    var bounds = getRectCorners(this.weight);
    if (intersectRect(dragBounds, bounds)) {
      // If self, hide kinetic and make it a no-op
      if (isSelf) {
        kinetic.hide();
        this.layer.draw();
        self.dragData.set({step: null});
        return true;
      }
      // TODO: For now, no interactions by dragging into the weights
      return false;
    // Not intersecting, clear timeouts if any
    } else {
      this.cancelDwell();
      return false;
    }
  },

  hideInteractions: function() {
    return false;
    if (this.previewAction == null)
      return;
    this.previewAction = null;
    this.previewValue = null;
    this.render();
  },

  wasAttachedToNode: function(node) {
    var nodeModel = node.model;
    var startModel = this.model.get('start');
    var endModel = this.model.get('end');
    return (
      (startModel != null &&
      startModel.get('name') == nodeModel.get('name')) ||
      (endModel != null &&
      endModel.get('name') == nodeModel.get('name'))
    );
  },

  updateNeighbors: function() {
    var startModel = this.model.get('start');
    var endModel = this.model.get('end');
    this.start = this.canvas.getSketchByDatum(startModel);
    this.end = this.canvas.getSketchByDatum(endModel);
  }
});

