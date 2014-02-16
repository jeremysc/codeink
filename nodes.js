var NodeSketch = DatumSketch.extend({
  model: Node,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'remove', 'render', 'renderValue', 'renderComparison', 'fill', 'selectIfIntersects', 'deselect', 'startDrag', 'previewInteraction', 'hideInteractions', 'showComparison', 'hideComparison', 'cancelDwell');
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
    this.edges = [];
    this.inbound = [];

    // Prompt user to initialize the node value
    if (this.model.getValue() == null) {
      var value = prompt('Enter new value');
      if (value != null) {
        var valExpr = value;
        if (value == 'inf') {
          value = Infinity;
          valExpr = new InfinityExpr();
        }
        this.model.set({value: value});
        var step = new Assignment({
          variable: this.model,
          value: new NodeExpr({value: valExpr}),
          isInitialization: true
        });
        this.model.trigger('step', {step: step});
      }
    } else {
      var step = new Assignment({
        variable: this.model,
        value: new NodeExpr({value: this.model.getValue()}),
        isInitialization: true
      });
      this.model.trigger('step', {step: step});
    }

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

    this.model.on('change', this.render);
    this.model.on('destroy', this.remove);
    this.model.on('fill', this.fill);
    this.model.on('showComparison', this.showComparison);
    this.model.on('hideComparison', this.hideComparison);
  },
  
  fill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
  },

  deselect: function() {
  },
  
  cancelDwell: function() {
    this.clearTimeouts();
    this.clearIntervals();
    if (this.dwellCircle && this.dwellCircle != null) {
      this.dwellCircle.remove();
      this.dwellCircle = null;
    }
  },
  
  pointIntersectsNode: function(dragPosition) {
    var groupPosition = this.group.getPosition();
    var nodePosition = this.node.getPosition();
    nodePosition.x += groupPosition.x;
    nodePosition.y += groupPosition.y;
    var distance = lineDistance(dragPosition, nodePosition);
    return distance < node_dim/2;
  },

  // check if the dragged node intersects with this one
  intersectsNode: function(dragPosition) {
    var groupPosition = this.group.getPosition();
    var nodePosition = this.node.getPosition();
    nodePosition.x += groupPosition.x;
    nodePosition.y += groupPosition.y;
    var distance = lineDistance(dragPosition, nodePosition);
    return distance < node_dim;
  },
  
  updateNeighbors: function() {
    this.edges = [];
    var edges = this.model.get('edges');
    for (var i = 0; i < edges.length; i++) {
      this.edges.push(this.canvas.getSketchByDatum(edges[i]));
    }
    this.inbound = [];
    var inbound = this.model.get('inbound');
    for (var i = 0; i < inbound.length; i++) {
      this.inbound.push(this.canvas.getSketchByDatum(inbound[i]));
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

    // Render the draggable label
    this.renderLabel();

    // Draw the node and pointers (hidden)
    if (this.previewAction == 'compare')
      this.renderComparison();
    else
      this.renderValue();

    this.layer.add(this.group);
    this.layer.draw();
  },

  // Render just the node's value
  renderValue: function() {
    var self = this;
    var previewAssign = (this.previewAction == 'assign');
    var value = (previewAssign) ? this.previewValue : this.model.get('value');
    var textValue = (value == Infinity) ? '∞' : value;

    this.node = new Kinetic.Circle({
      name: 'circle',
      x: node_dim/2,
      y: node_dim/2,
      radius: node_dim/2,
      stroke: (previewAssign) ? '#46b6ec' : 'black',
      strokeWidth: 3
    });
    this.text = new Kinetic.Text({
      text: textValue,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: node_dim,
      height: node_dim,
      offsetY: -10,
      align: 'center',
      fill: 'black'
    });
    this.node.on("click", function() {
      self.cancelDwell();
    });
    this.node.on("dblclick", function() {
      self.cancelDwell();
      var value = prompt('Enter new value');
      if (value != null) {
        self.model.set({value: value});
        var step = new Assignment({
          variable: new AttrExpr({object: self.model, attr: "value", value: value}),
          value: value
        });
        self.model.trigger('step', {step: step});
      }
      return false;
    });

    // Highlight on hover, if not selected
    this.node.on("mouseover", function() {
      if (!self.selected) {
        this.setStroke('red');
        self.layer.draw();
      }
    });
    this.node.on("mouseout", function() {
      if (!self.selected) {
        this.setStroke('black');
        self.layer.draw();
      }
    });

    this.node.on("mousedown", function(event) {
      // Timer to start the drag
      self.addTimeout(self.startDrag, 150, event);
      // Interval to animate the dwell state
      /*
      self.addInterval(function() {
        if (!self.dwellCircle || self.dwellCircle == null) {
          self.dwellCircle = new Kinetic.Wedge({
            x: event.offsetX,
            y: event.offsetY - 50,
            radius: 10,
            angle: 0,
            fill: '#46b6ec',
            stroke: null,
          });
          self.dwellAngle = 0;
          self.layer.add(self.dwellCircle);
          self.layer.draw();
        } else if (self.dwellAngle >= 2*Math.PI) {
          self.clearIntervals();

          self.dwellCircle.remove();
          self.dwellCircle = null;
          self.layer.draw();
        } else {
          self.dwellAngle += 2*Math.PI / 20;
          self.dwellCircle.setAngle(self.dwellAngle);
          self.dwellCircle.moveToTop();
          self.layer.draw();
        }
      }, 42);
      */
      // Timer to flag dwell state
      self.addTimeout(function() {
        // if exited, ignore the dwell
        // shouldn't happen if exit clears the timeout
        if (self.dragData.get('exited'))
          return;
        // modify the expression
        self.dragData.set({dwelled: true});//, expr: expr});
        console.log('dwelled');
      }, 1000);
    });

    this.group.add(this.text);
    this.group.add(this.node);
  },

  // Show the comparison
  renderComparison: function() {
    // The enclosing rect
    // group starts out at x = -node_dim/2 from center
    var rect = new Kinetic.Rect({
      x: -node_dim*0.75,
      width: node_dim*2.5,
      height: node_dim,
      strokeWidth: 1,
      fill: backgroundColor
    });

    // The value of this node
    var value = this.model.get('value');
    var otherValue = this.previewValue;
    var thisPosition, otherPosition, operator;
    if (value < otherValue) {
      thisPosition = {x: -node_dim/4, y: node_dim/2};
      otherPosition = {x: node_dim*1.25, y: node_dim/2};
      operator = "<";
    } else {
      otherPosition = {x: -node_dim/4, y: node_dim/2};
      thisPosition = {x: node_dim*1.25, y: node_dim/2};
      operator = "<";
    }
    if (value == otherValue)
      operator = "=";
    if (value == Infinity)
      value = '∞';
    if (otherValue == Infinity)
      otherValue = '∞';

    var node = new Kinetic.Circle({
      x: thisPosition.x,
      y: thisPosition.y,
      radius: node_dim/2,
      stroke: 'black',
      strokeWidth: 3
    });
    var text = new Kinetic.Text({
      x: thisPosition.x - node_dim/2,
      text: value,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: node_dim,
      height: node_dim,
      offsetY: -10,
      align: 'center',
      fill: 'black'
    });

    var nodeOther = new Kinetic.Circle({
      x: otherPosition.x,
      y: otherPosition.y,
      radius: node_dim/2,
      stroke: '#46b6ec',
      strokeWidth: 3
    });
    var textOther = new Kinetic.Text({
      x: otherPosition.x - node_dim/2,
      text: otherValue,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: node_dim,
      height: node_dim,
      offsetY: -10,
      align: 'center',
      fill: 'black'
    });

    var textOperator = new Kinetic.Text({
      text: operator,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: node_dim,
      height: node_dim,
      offsetY: -10,
      align: 'center',
      fill: 'black'
    });
    this.group.add(rect);
    this.group.add(node);
    this.group.add(text);
    this.group.add(nodeOther);
    this.group.add(textOther);
    this.group.add(textOperator);
  },

  renderLabel: function() {
    var self = this;
    var label = new Kinetic.Label({
      x: 4,
      y: -30,
      opacity: 0.75
    });
    label.add(new Kinetic.Tag({
      fill: 'yellow'
    }));
    label.add(new Kinetic.Text({
      text: this.model.getSymbol(),
      fontFamily: 'Helvetica',
      fontSize: labelFontSize,
      padding: 5,
      fill: 'black'
    }));
    label.on("mouseover", function() {
      self.group.setDraggable(true);
      var tag = this.getTag();
      tag.setStroke('black');
      self.layer.draw();
    });
    label.on("mouseout", function() {
      self.group.setDraggable(false);
      var tag = this.getTag();
      tag.setStroke('');
      self.layer.draw();
    });
    this.group.add(label);
  },

  startDrag: function(event) {
    var kinetic, expr, value;
    var groupPosition = this.group.getPosition();
    // get grab offset
    var offset = {x: event.offsetX - groupPosition.x,
                  y: event.offsetY - groupPosition.y};

    // set the expression and value
    expr = new AttrExpr({object: this.model}),
    value = this.model.getValue();

    // move selected elems to a new group
    kinetic = new Kinetic.Group();
    kinetic.setPosition(groupPosition);
    this.node.moveTo(kinetic);
    this.text.moveTo(kinetic);
    this.layer.add(kinetic);

    var bounds = getGroupRect(kinetic);
    
    this.dragData.set({
      dragging: true,
      sketch: this,
      kinetic: kinetic,
      originalBounds: bounds,
      expr: expr,
      value: value,
      offset: offset,
      step: null,
      exited: false,
      dwelled: false
    });

    this.deselect();
  },

  // Returns true if there's interaction with this object
  previewInteraction: function(dragSketch, dragBounds, cursorPosition) {
    var self = this;

    var bounds = getGroupRect(this.group);
    var kinetic = this.dragData.get('kinetic');
    var exited = this.dragData.get('exited');
    var isSelf = (dragSketch.model.get('name') == this.model.get('name'));

    // First: wait for the node to exit itself
    if (isSelf) {
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


    // Handle interactions with edges
    if (dragSketch.model.get('type') == 'edge' &&
        dragSketch.dragType != 'weight') {
      var edge = dragSketch;
      
      // Instead of using the edge endpoint we care about: start or end
      // just use the mouse position
      var edgeBounds = {
        left: cursorPosition.x,
        right: cursorPosition.x,
        top: cursorPosition.y,
        bottom: cursorPosition.y
      };
      // If intersecting this node, preview the attachment
      if (intersectRect(edgeBounds, bounds)) {
        edge[edge.dragType] = this;
        // Ignore re-attachments
        if (! edge.wasAttachedToNode(this)) {
          var step = new EdgeAttach({
            edge: edge.model,
            side: edge.dragType,
            node: this.model
          });
          self.dragData.set({step: step});
        }
        edge.render();
        return true;
      // If not intersecting, disconnect the edge if it was previously connected
      } else {
        var edgeNeighbor = edge[edge.dragType];
        if (edgeNeighbor != null &&
            edgeNeighbor.model.get('name') == this.model.get('name')) {
          edge[edge.dragType] = null;
          edge.render();
        }
      }
      return false;
    // Check if intersecting
    } else if (intersectRect(dragBounds, bounds)) {
      // If self, hide kinetic and make it a no-op
      if (isSelf) {
        kinetic.hide();
        this.layer.draw();
        self.dragData.set({step: null});
        return true;
      }
      // If not previewing, start the comparison
      if (this.previewAction == null) {
        this.previewValue = this.dragData.get('value');
        this.previewAction = 'compare';
        kinetic.hide();
        // ? this.layer.draw();

        // Commit the comparison
        var step = new Compare({
          drag: this.dragData.get('expr'),
          against: new AttrExpr({object: this.model}),
          dragSketch: dragSketch,
          againstSketch: this,
          value: this.dragData.get('value')
        });
        this.model.trigger('step', {step: step});

        // Start a timeout to switch to assignment
        this.addTimeout(function() {
          self.previewAction = 'assign';
          var step = new Assignment({
            variable: new AttrExpr({object: self.model}),
            value: self.dragData.get('expr')
          });
          self.dragData.set({step: step});
          self.render();
        }, 2000);
      }
      this.render();
      return true;
    // Not intersecting, clear timeouts if any
    } else {
      this.cancelDwell();
      return false;
    }
  },

  hideInteractions: function() {
    if (this.previewAction == null)
      return;
    this.previewAction = null;
    this.previewValue = null;
    this.render();
  },

  showComparison: function(compare) {
    if (this.dragData.get('dragging'))
      return;
   
    var dragSketch = compare.get('dragSketch');
    var dragExpr = compare.get('drag');
    var value = compare.get('value');
    
    if (dragExpr.get('action') == 'pop') {
      var popFrom = dragExpr.get('list');
      var popIndex = dragExpr.get('index');
      dragSketch.poppedIndex = popIndex;
      if (popFrom.getSymbol() != this.model.getSymbol())
        dragSketch.render();
    }

    this.previewAction = 'compare';
    this.previewValue = value;
    this.render();
  },
  
  hideComparison: function(compare) {
    if (this.dragData.get('dragging'))
      return;
   
    var dragSketch = compare.get('dragSketch');
    var dragExpr = compare.get('drag');
    
    if (dragExpr.get('action') == 'pop') {
      var popFrom = dragExpr.get('list');
      dragSketch.poppedIndex = null;
      if (popFrom.getSymbol() != this.model.getSymbol())
        dragSketch.render();
    }

    this.previewAction = null;
    this.previewValue = null;
    this.render();
  },

  getGlobalCenter: function() {
    var groupPos = this.group.getPosition();
    return {
      x: groupPos.x + node_dim/2,
      y: groupPos.y + node_dim/2
    };
  },
});

