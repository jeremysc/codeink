var BinaryNodeSketch = DatumSketch.extend({
  model: BinaryNode,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'remove', 'render', 'selectIfIntersects', 'setFill', 'intersectsNode', 'startDrag', 'showComparison', 'hideComparison', 'intersectsPointer', 'intersectsHead', 'showFollow', 'hideFollow', 'getChildSide', 'getInsertionPoint', 'showInsertion', 'hideInsertion', 'updateNeighbors');
    this.timeouts = [];
    this.intervals = [];

    // Standard global variables
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.canvas = options.canvas;

    // List-specific properties
    this.sketches = [];
    this.selected = false;
    this.previewAction = null;
    this.previewSide = null;
    this.previewNode = null;

    this.comparing = false;
    this.following = false;
    this.otherNode = null;
    this.dragNode = null;

    // ?
    this.left = null;
    this.right = null;
    this.parent = null;

    // Prompt user to initialize the node
    if (this.model.getValue() == null) {
      var value = prompt('Enter new value');
      if (value != null) {
        this.model.set({value: value});
        var step = new Assignment({
          variable: this.model,
          value: new BinaryNodeExpr({value: this.model.getValue()}),
          isInitialization: true
        });
        this.model.trigger('step', {step: step});
      }
    } else {
      var step = new Assignment({
        variable: this.model,
        value: new BinaryNodeExpr({value: this.model.getValue()}),
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
    /*
    this.model.on('showComparison', this.showComparison);
    this.model.on('hideComparison', this.hideComparison);
    this.model.on('showFollow', this.showFollow);
    this.model.on('hideFollow', this.hideFollow);
    */
  },
  
  fill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
  },
  
  deselect: function() {
    this.selected = false;
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

    this.renderPointers();

    this.layer.add(this.group);
    this.layer.draw();
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

  // Render just the node's value
  renderValue: function() {
    var self = this;
    var previewAssign = (this.previewAction == 'assign');
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
      if (self.state.filling()) {
        self.node.setFill(self.state.color);
        self.node.moveToBottom();
        self.layer.draw();
      }
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
  
  // Re-render the binary node
  render: function() {
    // (this.comparing && this.otherNode == null) ||
    // (this.following && this.dragNode == null)) 

    // Update the group's position
    var position;
    if (this.previewSide != null) {
      position = this.parent.getInsertionPoint(this.previewSide); 
    } else {
      this.updateNeighbors();
      position = (this.parent != null) 
                  ? this.parent.getInsertionPoint(this.model)
                  : this.model.get('position');
    }
    this.group.setPosition(position);
  },

  getPointerHead: function(side) {
    if (side == 'left') {
      return this.leftLine.getPoints()[1];
    } else {
      return this.rightLine.getPoints()[1];
    }
  },

  renderPointers: function() {
    // draw the pointers
    var pointerRoot = {
      x: node_dim/2,
      y: node_dim
    };
    var pointerHeight = 80;
    var pointerWidth = pointerHeight*0.75;
    this.leftLine = new Kinetic.Line({
      points: [
        pointerRoot.x, pointerRoot.y,
        pointerRoot.x - pointerWidth, pointerRoot.y + pointerHeight
        ],
      strokeWidth: (this.following && this.followSide == "left") ? 6 : 3,
      stroke: (this.following && this.followSide == "left") ? '#46b6ec' : 'black'
    });
    this.leftHead = new Kinetic.RegularPolygon({
      x: pointerRoot.x - pointerWidth,
      y: pointerRoot.y + pointerHeight,
      sides: 3,
      radius: 8,
      fill: 'black',
      stroke: 'black',
      strokeWidth: 3,
      lineJoin: 'round',
      rotationDeg: -30,
    });
    this.rightLine = new Kinetic.Line({
      points: [
        pointerRoot.x, pointerRoot.y,
        pointerRoot.x + pointerWidth, pointerRoot.y +pointerHeight 
        ],
      strokeWidth: (this.following && this.followSide == "right") ? 6 : 3,
      stroke: (this.following && this.followSide == "right") ? '#46b6ec' : 'black'
    });
    this.rightHead = new Kinetic.RegularPolygon({
      x: pointerRoot.x + pointerWidth,
      y: pointerRoot.y + pointerHeight,
      sides: 3,
      radius: 8,
      fill: 'black',
      stroke: 'black',
      strokeWidth: 3,
      lineJoin: 'round',
      rotationDeg: -90,
    });
    this.group.add(this.leftLine);
    this.group.add(this.leftHead);
    this.group.add(this.rightLine);
    this.group.add(this.rightHead);
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

    var nodeBounds = getGlobalRect(this.group, this.node);
    var leftPoint = getPointerHead('left');
    leftPoint = getGlobalPoint(this.group, leftPoint);
    var rightPoint = getPointerHead('right');
    rightPoint = getGlobalPoint(this.group, rightPoint);
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
    if (dragSketch.model.get('type') == 'edge')
      return false;

    if (intersectRect(dragBounds, nodeBounds)) {
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
      }
      this.render();
      return true;
    // Not intersecting, clear timeouts if any
    } else if (intersectRect(dragBounds, leftPoint) {

    }
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

  // check if the dragged node intersects with this one
  intersectsNode: function(dragPosition) {
    var groupPosition = this.group.getPosition();
    var nodePosition = this.node.getPosition();
    nodePosition.x += groupPosition.x;
    nodePosition.y += groupPosition.y;
    var distance = lineDistance(dragPosition, nodePosition);
    return distance < node_dim;
  },
  
  showComparison: function(dragSketch) {
    if (this.comparing)
      return false;
    this.comparing = true;
    this.otherNode = dragSketch;
    this.otherNode.comparing = true;
    this.otherNode.otherNode = null;
    this.render();
    this.otherNode.render();
    return true;
  },
  
  hideComparison: function(silent) {
    if (!this.comparing)
      return false;
    this.comparing = false;
    this.otherNode.comparing = false;
    this.otherNode.otherNode = null;
    if (silent != undefined || !silent) {
      this.render();
      this.otherNode.render();
    }
    this.otherNode = null;
    return true;
  },
  
  intersectsPointer: function(dragPosition) {
    var groupPosition = this.group.getPosition();
    var points = this.leftLine.getPoints();
    var startPoint = {
      x: points[0].x + groupPosition.x,
      y: points[0].y + groupPosition.y
    };
    var endPoint = {
      x: points[1].x + groupPosition.x,
      y: points[1].y + groupPosition.y
    };
    var leftIntersects = (dragPosition.x <= startPoint.x - node_dim/5 && dragPosition.x >= endPoint.x
                  &&  dragPosition.y <= endPoint.y && dragPosition.y > startPoint.y + node_dim/5);
    if (leftIntersects)
      return "left";
    
    points = this.rightLine.getPoints();
    startPoint = {
      x: points[0].x + groupPosition.x,
      y: points[0].y + groupPosition.y
    };
    endPoint = {
      x: points[1].x + groupPosition.x,
      y: points[1].y + groupPosition.y
    };
    var rightIntersects = (dragPosition.x >= startPoint.x + node_dim/5 && dragPosition.x <= endPoint.x
                  &&  dragPosition.y <= endPoint.y && dragPosition.y > startPoint.y + node_dim/5);
    if (rightIntersects)
      return "right";
    
    return false;
  },

  showFollow: function(dragSketch, side) {
    if (this.following)
      return false;
    this.following = true;
    this.followSide = side;
    this.dragNode = dragSketch;
    this.dragNode.following = true;
    this.render();
    this.dragNode.render();
    return true;
  },
  
  hideFollow: function(silent) {
    if (!this.following)
      return false;
    this.following = false;
    this.followSide = null;
    this.dragNode.following = false;
    if (silent != undefined || !silent) {
      this.render();
      this.dragNode.render();
    }
    this.dragNode = null;
    return true;
  },
 
  intersectsHead: function(dragPosition) {
    var points, xDist, inY, head;
    var groupPosition = this.group.getPosition();
    var points = this.leftLine.getPoints();
    head = {
      x: points[1].x + groupPosition.x,
      y: points[1].y + groupPosition.y
    }
    xDist = Math.abs(dragPosition.x - head.x);
    inY = (dragPosition.y > head.y - node_dim/4) && (dragPosition.y < head.y + node_dim*1.25);
    if (xDist < node_dim*0.75 && inY)
      return "left";
    
    var rightPoints = this.rightLine.getPoints();
    head = {
      x: rightPoints[1].x + groupPosition.x,
      y: rightPoints[1].y + groupPosition.y
    }
    xDist = Math.abs(dragPosition.x - head.x);
    inY = (dragPosition.y > head.y - node_dim/4) && (dragPosition.y < head.y + node_dim*1.25);
    if (xDist < node_dim*0.75 && inY)
      return "right";
    
    return false;
  },

  getChildSide: function(datum) {
    return this.model.getChildSide(datum);
  },
  
  getInsertionPoint: function(side) {
    if (! isPrimitiveType(side))
      side = this.getChildSide(side);
    var groupPosition = this.group.getPosition();
    var head = (side == 'left') ? this.leftHead : this.rightHead;
    var adjust = (side == 'left') ? -node_dim/2 - 15 : -5;
    var headPosition = head.getPosition();
    return {
      x: groupPosition.x + headPosition.x + adjust,
      y: groupPosition.y + headPosition.y + 5
    };
  },
  
  showInsertion: function(parentSketch, side) {
    if (this.parent != null)
      return false;

    var childSketch = (side == 'left') ? parentSketch.left : parentSketch.right;
    if (childSketch != null)
      return false;

    this.parent = parentSketch;
    this.previewSide = side;
    if (side == 'left')
      this.parent.left = this;
    else
      this.parent.right = this;
    this.render();
    return true;
  },
  
  hideInsertion: function(silent) {
    if (this.parent == null || this.previewSide == null)
      return false;
    var childSketch = (this.previewSide == 'left') ? this.parent.left : this.parent.right;
    if (childSketch == null)
      return false;

    if (this.previewSide == 'left')
      this.parent.left = null;
    else
      this.parent.right = null;
    this.parent = null;
    this.previewSide = null;

    if (silent == null || !silent)
      this.render();
    return true;
  },

  updateNeighbors: function() {
    if (this.model.get('left') != null) {
      this.left = this.canvas.getSketchByDatum(this.model.get('left'));
    } else {
      this.left = null;
    }
    if (this.model.get('right') != null) {
      this.right = this.canvas.getSketchByDatum(this.model.get('right'));
    } else {
      this.right = null;
    }
    if (this.model.get('parent') != null) {
      this.parent = this.canvas.getSketchByDatum(this.model.get('parent'));
    } else {
      this.parent = null;
    }
  },
  
  previewInteraction: function(dragSketch, dragBounds) {
    var dwelled = this.dragData.get('dwelled');
    var exited = this.dragData.get('exited');

    var bounds = getGroupRect(this.group);
    var sameSketch = dragSketch.model.get('name') == this.model.get('name');
    if (dragSketch.model.get('type') == 'node' &&
        dragSketch.dragType != 'value')
      return false;

    // First: cancel dwell timeout if exiting quickly
    if (sameSketch) {
      if (!dwelled && !exited) {
        var originalBounds = this.dragData.get('originalBounds');
        var bounds = {
          left: originalBounds.left,
          right: originalBounds.right,
          top: originalBounds.top - exitThresh,
          bottom: originalBounds.bottom + exitThresh
        };

        // If exited, then update dragData and make the copy
        if (!intersectRect(dragBounds, bounds)) {
          this.dragData.set({exited: true});
          this.clearTimeouts();

          // Re-render to make a copy
          this.render();
        // Haven't dwelled or exited yet
        } else {
          return true;
        }
      }
    }

    // No interactions for sublists
    var values = this.dragData.get('value');
    if (isArray(values) && values.length > 1) {
      return false;
    }

    // Setup the entrance bounds
    if (!this.expanded) {
      bounds.left   -= enterThresh;
      bounds.right  += enterThresh;
      bounds.top    -= enterThresh;
      bounds.bottom += enterThresh;
    }

    if (intersectRect(dragBounds, bounds)) {
      // Expand the list, if not already expanded
      if (!this.expanded) {
        var dragCenter = dragBounds.left + 
                        (dragBounds.right - dragBounds.left)/2;
        this.expand(dragCenter);
      }

      // Preview any comparisons or insertions
      var interaction = this.getInteraction(dragBounds);
      var action = interaction.action;
      var actionIndex = interaction.index;
      // Only allow re-rendering if there's a change in the preview state
      if (this.previewAction != action || this.previewIndex != actionIndex) {
        this.previewAction = action;
        this.previewIndex = actionIndex;
        var kinetic = this.dragData.get('kinetic');

        // If no preview required, then make it a no-op
        // and show the original Kinetic shape
        if (this.previewAction == null) {
          kinetic.show();
          this.dragData.set({step: null});
        // Preview an insert
        // Have to adjust the index if doing a re-arrangement
        } else if (this.previewAction == 'insert') {
          var index = (this.poppedIndex != null
            && this.poppedIndex < this.previewIndex) ? 
            this.previewIndex - 1 : this.previewIndex;
          this.dragData.set({
            step: new Insert({
              list: this.model,
              index: index,
              value: this.dragData.get('expr'),
            })
          });
          kinetic.hide();
        // Preview and commit a comparison
        } else if (this.previewAction == 'compare') {
          var step = new Compare({
            drag: this.dragData.get('expr'),
            against: new ListVarExpr({
              list: this.model,
              index: this.previewIndex
            }),
            dragSketch: dragSketch,
            againstSketch: this,
            value: this.dragData.get('value')
          });
          this.model.trigger('step', {step: step});
          kinetic.hide();
        }
        this.render();
      }
      return true;
    }
    return false;
  },

  startDrag = function(event) {
    var kinetic, expr, value;
    var groupPosition = this.group.getPosition();
    // get grab offset
    var offset = {x: event.offsetX - groupPosition.x,
                  y: event.offsetY - groupPosition.y};

    // set the expression and value
    expr = new AttrExpr({object: this.model, attr: 'value'});
    value = this.model.getValue();

    // move just the node to a new group
    kinetic = new Kinetic.Group();
    kinetic.setPosition(groupPosition);
    this.node.moveTo(kinetic);
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

    /*
    this.deselect();
    var nodeOffset = {x: offset.x - node_dim/2,
                      y: offset.y - node_dim/2};
                    */
  },

  
  moveTo: function(position, silent) {
    this.group.setPosition(position);
    if (this.left != null)
      this.left.moveTo(this.getInsertionPoint('left'), true);
    if (this.right != null)
      this.right.moveTo(this.getInsertionPoint('right'), true);

    if (silent != undefined || !silent)
      this.layer.draw();
  },

  clearTimeouts: function() {
    this.timeouts.map(function(t) {
      clearTimeout(t);
    });
    this.timeouts = [];
  }
});


