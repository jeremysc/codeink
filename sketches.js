function lineDistance( point1, point2 )
{
  var xs = 0;
  var ys = 0;
 
  xs = point2.x - point1.x;
  xs = xs * xs;
 
  ys = point2.y - point1.y;
  ys = ys * ys;
 
  return Math.sqrt( xs + ys );
}
function normal( point1, point2 )
{
  var distance = lineDistance(point1, point2);
  return {
    x: (point2.x - point1.x)/distance,
    y: (point2.y - point1.y)/distance
  };
}

function midpoint( point1, point2 )
{
  return {
    x: (point1.x + point2.x)/2,
    y: (point1.y + point2.y)/2
  };
}
function intersectRect(r1, r2) {
  return !(r2.left > r1.right || 
           r2.right < r1.left || 
           r2.top > r1.bottom ||
           r2.bottom < r1.top);
}
function getRectCorners(r) {
  var l,r,t,b;
  var position = r.getPosition();
  var width = r.getWidth();
  var height = r.getHeight();
  if (width < 0) {
    l = position.x + width;
    r = position.x;
  } else {
    l = position.x;
    r = position.x + width;
  }
  if (height < 0) {
    t = position.y + height;
    b = position.y;
  } else {
    t = position.y;
    b = position.y + height;
  }
  return {left: l, right: r, top: t, bottom: b};
}
function getGroupRect(group) {
  var avoidNames = ["plus", "label"];
  var groupPosition = group.getPosition();
  var rects = [];
  var children = group.getChildren();
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (avoidNames.indexOf(child.getName()) != -1)
      continue;
    var position = child.getPosition();
    var width = child.getWidth();
    var height = child.getHeight();
    rects.push({
      left: groupPosition.x + position.x,
      right: groupPosition.x + position.x + width,
      top: groupPosition.y + position.y,
      bottom: groupPosition.y + position.y + height
    });
  }
  var groupRect = rects[0];
  for (var i = 1; i < rects.length; i++) {
    var rect = rects[i];
    if (rect.left < groupRect.left)
      groupRect.left = rect.left;
    if (rect.right > groupRect.right)
      groupRect.right = rect.right;
    if (rect.top < groupRect.top)
      groupRect.top = rect.top;
    if (rect.bottom > groupRect.bottom)
      groupRect.bottom = rect.bottom;
  }
  return groupRect;
}

var DatumSketch = Backbone.View.extend({
  drawBoxAndLabel: function(x, y, boxw, boxh, value, index, muted) {
    var text_height = boxh-10;

    var box = new Kinetic.Rect({
      index: index,
      x: x,
      y: y,
      width: boxw,
      height: boxh,
      stroke: muted ? null : 'black',
      strokeWidth: muted ? 0 : 3,
    });

    var label = new Kinetic.Text({
      y: y + (boxh - text_height) / 2.0,
      text: value,
      fontSize: text_height,
      fontFamily: 'Helvetica',
      fill: muted ? 'grey' : 'black',
    });
    var label_x = x + (boxw - label.textWidth)/2.0;
    label.setX(label_x);

    return {box: box, label: label};
  },
  
  addTimeout: function(callback, delay, args) {
    this.timeouts.push(setTimeout(function() {
      callback(args);
    }, delay, this));
  },

  clearTimeouts: function() {
    this.timeouts.map(function(t) {
      clearTimeout(t);
    });
    this.timeouts = [];
  }
});

var NumberSketch = DatumSketch.extend({
  model: Number,

  initialize: function(options) {
    var self = this;

    _.bindAll(this, 'render', 'renderValue', 'selectIfIntersects', 'moveTo', 'hide', 'show');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.sketch = null;
    this.selected = false;

    this.group = new Kinetic.Group({
      name: this.model.getSymbol(),
    });

    if (self.model.getValue() == null) {
      var value = prompt('Enter new value');
      if (value != null) {
        self.model.set({value: value});
        var step = new Assignment({
          variable: self.model,
          value: value
        });
        self.model.trigger('step', {step: step});
      }
    } else {
      var step = new Assignment({
        variable: self.model,
        value: self.model.getValue()
      });
      self.model.trigger('step', {step: step});
    }

    this.model.on('change', this.render);
  },
  
  selectIfIntersects: function(rect) {
    var selectRect = getRectCorners(rect);
    var groupRect = getGroupRect(this.group);
    var isSelected = intersectRect(selectRect, groupRect);
    if (isSelected != this.selected) {
      this.selected = isSelected;
      if (this.selected) {
        this.sketch.getTag().setStroke('red');
      } else {
        this.sketch.getTag().setStroke('black');
      }
      this.layer.draw();
    }
  },

  render: function(event) {
    var self = this;
    this.group.removeChildren();
    this.group.remove();
    if (! this.model.get('visible')) {
      this.layer.draw();
      return;
    }
    var position = this.model.get('position');
    this.group.setPosition(position);

    // draggable label
    var label = new Kinetic.Label({
      x: 0,
      y: -28,
      opacity: 0.75,
      name: 'label'
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
    /*
    label.on("dblclick", function() {
      var name = prompt('Enter new name:');
      if (name != null) {
        self.model.set({name: name});
      }
    });
    */
    this.group.add(label);

    this.sketch = this.renderValue();

    this.layer.add(this.group);
    this.layer.draw();
  },

  renderValue: function() {
    var self = this;

    // draw the number 
    var value = this.model.get('value');
    sketch = new Kinetic.Label({
      x: 0,
      y: 0,
      //draggable: true
    });
    sketch.add(new Kinetic.Tag({
      strokeWidth: 3
    }));
    sketch.add(new Kinetic.Text({
      text: value,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: box_dim,
      height: box_dim,
      offsetY: -5,
      align: 'center',
      fill: 'black'
    }));
    sketch.on("mouseover", function() {
      if (!self.selected) {
        var tag = this.getTag();
        tag.setStroke('red');
        self.layer.draw();
      }
    });
    sketch.on("mouseout", function() {
      if (!self.selected) {
        var tag = this.getTag();
        tag.setStroke('black');
        self.layer.draw();
      }
    });
    sketch.on("click", function() {
      self.mouseup = true;
    });
    sketch.on("dblclick", function() {
      var value = prompt('Enter new value');
      if (value != null) {
        self.model.set({value: value});
        var step = new Assignment({
          variable: self.model,
          value: value
        });
        self.model.trigger('step', {step: step});
      }
    });
    sketch.on("mouseenter", function(event) {
      if (self.dragData.get('dragging') && ! self.dragData.get('engaged') && self.dragData.get('src') != self) {
        self.dragData.set({engaged: true});
        // hide the sketch
        self.dragData.get('sketch').hide();

        self.origValue = self.model.get('value');
        self.dragData.set({step: new Assignment({
          variable: self.model,
          value: self.dragData.get('expr')
        })});
        self.model.set({value: self.dragData.get('value')});
      }
      self.layer.draw();
    });
    sketch.on("mouseleave", function(event) {
      if (self.dragData.get('dragging') && self.dragData.get('engaged')) {
        self.dragData.set({engaged: false, step: null});
        self.dragData.get('sketch').show();
        self.model.set({value: self.origValue});
      }
      self.layer.draw();
    });
    var startDrag = function(event) {
      if (self.mouseup) {
        self.mouseup = false;
        return;
      }

      // move the group to the bottom of siblings, so mouseenter events fire
      console.log("HI");
      self.group.moveToBottom();
      
      // get grab offset
      var position = self.group.getPosition();
      var offset = {x: event.offsetX - position.x,
                    y: event.offsetY - position.y};
      
      self.dragData.set({
        dragging: true,
        expr: self.model,
        sketch: self,
        offset: offset,
        src: self,
        value: self.model.getValue()
      });
      self.layer.draw();
    };

    sketch.on("mousedown", _.debounce(startDrag, dragTimeout));

    this.group.add(sketch);
    return sketch;
  },

  moveTo: function(position, silent) {
    this.group.setPosition(position);

    if (silent != undefined || !silent)
      this.layer.draw();
  },

  hide: function(silent) {
    this.model.set({visible: false});
  },

  show: function(silent) {
    this.model.set({visible: true});
    // move the group to the bottom of siblings, so mouseenter events fire
    this.group.moveToBottom();
  }
});

var BinaryNodeSketch = DatumSketch.extend({
  model: BinaryNode,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'selectIfIntersects', 'setFill', 'intersectsNode', 'showComparison', 'hideComparison', 'intersectsPointer', 'intersectsHead', 'showFollow', 'hideFollow', 'getChildSide', 'getInsertionPoint', 'showInsertion', 'hideInsertion', 'clearTimeouts', 'updateNeighbors');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.canvas = options.canvas;

    this.model.on('change', this.render);
    this.model.on('fill', this.setFill);
    this.model.on('showComparison', this.showComparison);
    this.model.on('hideComparison', this.hideComparison);
    this.model.on('showFollow', this.showFollow);
    this.model.on('hideFollow', this.hideFollow);

    if (this.model.getValue() == null) {
      var value = prompt('Enter new value');
      if (value != null) {
        this.model.set({value: value});
        var step = new Assignment({
          variable: this.model,
          value: new BinaryNodeExpr({value: this.model.getValue()})
        });
        this.model.trigger('step', {step: step});
      }
    } else {
      var step = new Assignment({
        variable: this.model,
        value: new BinaryNodeExpr({value: this.model.getValue()})
      });
      this.model.trigger('step', {step: step});
    }

    this.comparing = false;
    this.following = false;
    this.otherNode = null;
    this.dragNode = null;
    this.timeouts = [];

    this.left = null;
    this.right = null;
    this.parent = null;
    this.previewSide = null;
  },
  
  setFill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
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

    //console.log("insert " + this.model.get('name') + " at " + parentSketch.model.get('name') + " " + side);
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

    //console.log("hide " + this.model.get('name') + " at " + this.parent.model.get('name') + " " + this.previewSide);
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
  
  render: function() {
    var self = this;
    if (this.group) {
      this.group.removeChildren();
      this.group.remove();
    } else {
      this.group = new Kinetic.Group({name: this.model.getSymbol()});
    }
    if (! this.model.get('visible') || (this.comparing && this.otherNode == null) || (this.following && this.dragNode == null)) {
      this.layer.draw();
      return;
    }

    // Update the group's position
    var position;
    if (this.previewSide != null) {
      position = this.parent.getInsertionPoint(this.previewSide); 
    } else {
      this.updateNeighbors();
      position = (this.parent != null) ? this.parent.getInsertionPoint(this.model) : this.model.get('position');
    }

    this.group.setPosition(position);
    
    var label = new Kinetic.Label({
      y: -30,
      opacity: 0.75
    });
    label.add(new Kinetic.Tag({
      fill: 'yellow'
    }));
    label.add(new Kinetic.Text({
      text: this.model.getSymbol(),
      fontFamily: 'Helvetica',
      fontSize: 15,
      padding: 5,
      fill: 'black'
    }));
    this.group.add(label);

    if (!this.comparing) {
      // draw the node and pointers (hidden)
      var value = this.model.get('value');
      this.node = new Kinetic.Circle({
        x: node_dim/2,
        y: node_dim/2,
        radius: node_dim/2,
        stroke: (this.previewSide != null) ? '#46b6ec' : 'black',
        strokeWidth: 3
      });
      this.text = new Kinetic.Text({
        text: value,
        fontFamily: 'Helvetica',
        fontSize: 35,
        width: node_dim,
        height: node_dim,
        offsetY: -10,
        align: 'center',
        fill: 'black'
      });
      this.node.on("dblclick", function() {
        self.clearTimeouts();
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

      var startDrag = function(event) {
        // move current sketch to global
        //this.moveTo(self.globals);
        //this.setPosition(self.group.getPosition());

        // get grab offset
        var position = self.group.getPosition();
        var offset = {x: event.offsetX - position.x,
                      y: event.offsetY - position.y};
        var nodeOffset = {x: offset.x - node_dim/2,
                          y: offset.y - node_dim/2};
        
        self.timeouts.push(setTimeout(function() { 
          self.dragData.set({
            dragging: true,
            sketch: self,
            offset: offset,
            nodeOffset: nodeOffset
          });
        }, 400, this));
      };
      this.node.on("mousedown", startDrag);//_.debounce(startDrag, 500));

      this.group.add(this.text);
      this.group.add(this.node);
    } else if (this.comparing && this.otherNode != null) {
      // group starts out at x = -node_dim/2 from center
      var rect = new Kinetic.Rect({
        x: -node_dim*0.75,
        width: node_dim*2.5,
        height: node_dim,
        strokeWidth: 1,
      });
      var value = this.model.get('value');
      var otherValue = this.otherNode.model.get('value');
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
    }
      
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

    this.layer.add(this.group);
    this.layer.draw();
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

var NodeSketch = DatumSketch.extend({
  model: Node,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'selectIfIntersects', 'setFill', 'intersectsNode', 'showComparison', 'hideComparison', 'clearTimeouts', 'updateNeighbors');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.canvas = options.canvas;

    this.model.on('change', this.render);
    this.model.on('fill', this.setFill);
    this.model.on('showComparison', this.showComparison);
    this.model.on('hideComparison', this.hideComparison);

    var step = new Assignment({
      variable: this.model,
      value: new NodeExpr({value: this.model.getValue()})
    });
    this.model.trigger('step', {step: step});

    this.comparing = false;
    this.otherNode = null;
    this.dragNode = null;
    this.timeouts = [];

    this.edges = [];
    this.inbound = [];
  },
  
  setFill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
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
  
  render: function() {
    var self = this;
    if (this.group) {
      this.group.removeChildren();
      this.group.remove();
    } else {
      this.group = new Kinetic.Group({name: this.model.getSymbol()});
    }
    if (! this.model.get('visible') || (this.comparing && this.otherNode == null)) {
      this.layer.draw();
      return;
    }

    // Update the group's position
    this.updateNeighbors();
    var position = (this.parent != null) ? this.parent.getInsertionPoint(this.model) : this.model.get('position');
    this.group.setPosition(position);
    
    var label = new Kinetic.Label({
      x: 5,
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
    this.group.add(label);

    if (!this.comparing) {
      // draw the node and pointers (hidden)
      var value = this.model.get('value');
      this.node = new Kinetic.Circle({
        x: node_dim/2,
        y: node_dim/2,
        radius: node_dim/2,
        stroke: 'black',
        strokeWidth: 3
      });
      this.text = new Kinetic.Text({
        text: value,
        fontFamily: 'Helvetica',
        fontSize: 35,
        width: node_dim,
        height: node_dim,
        offsetY: -10,
        align: 'center',
        fill: 'black'
      });
      this.node.on("dblclick", function() {
        self.clearTimeouts();
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

      var startDrag = function(event) {
        // move current sketch to global
        //this.moveTo(self.globals);
        //this.setPosition(self.group.getPosition());

        // get grab offset
        var position = self.group.getPosition();
        var offset = {x: event.offsetX - position.x,
                      y: event.offsetY - position.y};
        var nodeOffset = {x: offset.x - node_dim/2,
                          y: offset.y - node_dim/2};
        
        self.timeouts.push(setTimeout(function() { 
          self.dragData.set({
            dragging: true,
            sketch: self,
            offset: offset,
            nodeOffset: nodeOffset
          });
        }, 400, this));
      };
      this.node.on("mousedown", startDrag);//_.debounce(startDrag, 500));

      this.group.add(this.text);
      this.group.add(this.node);
    } else if (this.comparing && this.otherNode != null) {
      // group starts out at x = -node_dim/2 from center
      var rect = new Kinetic.Rect({
        x: -node_dim*0.75,
        width: node_dim*2.5,
        height: node_dim,
        strokeWidth: 1,
      });
      var value = this.model.get('value');
      var otherValue = this.otherNode.model.get('value');
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
        stroke: 'black',
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
    }

    this.layer.add(this.group);
    this.layer.draw();
  },

  moveTo: function(position, silent) {
    this.group.setPosition(position);
    for (var i = 0; i < this.edges.length; i++) {
      var edge = this.edges[i];
      edge.shiftFrom(position, true);
    }
    for (var i = 0; i < this.inbound.length; i++) {
      var inbound = this.inbound[i];
      inbound.shiftTo(position, true);
    }

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

var EdgeSketch = DatumSketch.extend({
  model: Node,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'selectIfIntersects', 'setFill', 'clearTimeouts', 'updateNeighbors', 'showAttachment', 'hideAttachment');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.canvas = options.canvas;

    this.model.on('change', this.render);
    this.model.on('fill', this.setFill);

    var step = new Assignment({
      variable: this.model,
      value: new EdgeExpr({weight: this.model.getValue()})
    });
    this.model.trigger('step', {step: step});

    this.timeouts = [];

    this.start = null; 
    this.end = null; 
    this.previewSide = null;

    this.edgeLength = 150;
    this.startPosition = {x: 0, y: 0};
    this.endPosition = {x: this.edgeLength, y: 0};
  },
  
  setFill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
  },

  showAttachment: function(node, side) {
    if (this.previewSide == side)
      return false;

    if (side == 'start' && this.start == null) {
      this.previewSide = 'start';
      this.start = node;
      this.render();
      return true;
    } else if (side == 'end' && this.end == null) {
      this.previewSide = 'end';
      this.end = node;
      this.render();
      return true;
    } else {
      return false;
    }
  },
  
  hideAttachment: function() {
    if (this.previewSide == 'start') {
      this.previewSide = null;
      this.start = null;
      this.render();
      return true;
    } else if (this.previewSide == 'end') {
      this.previewSide = null;
      this.end = null;
      this.render();
      return true;
    } else {
      return false;
    }
  },

  updateNeighbors: function() {
    var startNode = this.model.get('start');
    this.start = (startNode == null) ? null : this.canvas.getSketchByDatum(startNode);
    var endNode = this.model.get('end');
    this.end = (endNode == null) ? null : this.canvas.getSketchByDatum(endNode);
  },
  
  render: function() {
    var self = this;
    if (this.group) {
      this.group.removeChildren();
      this.group.remove();
    } else {
      this.group = new Kinetic.Group({name: this.model.getSymbol()});
    }
    if (! this.model.get('visible')) {
      this.layer.draw();
      return;
    }

    // Update the group's position
    if (this.previewSide == null)
      this.updateNeighbors();
    var groupPosition;
    if (this.start == null) {
      groupPosition = this.model.get('position');
    } else {
      groupPosition = this.start.group.getPosition();
      groupPosition.x += node_dim/2;
      groupPosition.y += node_dim/2;
    }

    var localEnd;
    if (this.end == null) {
      localEnd = {x: this.edgeLength, y: 0};
    } else {
      var globalEnd = this.end.group.getPosition();
      localEnd = {x: globalEnd.x - groupPosition.x, y: globalEnd.y - groupPosition.y};
    }

    var edgeNormal = normal({x: 0, y:0}, localEnd);
    this.endPosition = {x: localEnd.x - edgeNormal.x * node_dim/2, y: localEnd.y - edgeNormal.y * node_dim/2};
    this.startPosition = {x: edgeNormal.x*node_dim/2, y: edgeNormal.y*node_dim/2};

    this.group.setPosition(groupPosition);

    var label = new Kinetic.Label({
      x: midpoint(this.startPosition, this.endPosition).x,
      y: -30,
      opacity: 0.75
    });
    label.add(new Kinetic.Tag({
    }));
    label.add(new Kinetic.Text({
      text: this.model.getValue(),
      fontFamily: 'Helvetica',
      fontSize: labelFontSize,
      padding: 5,
      fill: 'black'
    }));
    this.group.add(label);

    // draw the pointer
    this.line = new Kinetic.Line({
      points: [
        this.startPosition.x, this.startPosition.y,
        this.endPosition.x, this.endPosition.y
        ],
      strokeWidth: 3
    });
    this.handle = new Kinetic.Circle({
      x: this.startPosition.x,
      y: this.startPosition.y,
      radius: 5,
      fill: 'black'
    });
    this.handle.on("mouseenter", function() {
      this.setRadius(10);
      this.setFill('#46b6ec');
      self.layer.draw();
    });
    this.handle.on("mouseleave", function() {
      this.setRadius(5);
      this.setFill('black');
      self.layer.draw();
    });
    this.handle.on("mousedown", function() {
      self.dragData.set({
        dragging: true,
        sketch: self,
        side: 'start',
        offset: {x: 0, y: 0}
      });
    });
    this.head = new Kinetic.RegularPolygon({
      x: this.endPosition.x,
      y: this.endPosition.y,
      sides: 3,
      radius: 8,
      fill: 'black',
      stroke: 'black',
      strokeWidth: 3,
      lineJoin: 'round',
      rotationDeg: -30,
    });
    this.head.on("mouseenter", function() {
      this.setRadius(10);
      this.setFill('#46b6ec');
      this.setStroke('#46b6ec');
      self.layer.draw();
    });
    this.head.on("mouseleave", function() {
      this.setRadius(5);
      this.setFill('black');
      this.setStroke('black');
      self.layer.draw();
    });
    this.head.on("mousedown", function() {
      self.dragData.set({
        dragging: true,
        sketch: self,
        side: 'end',
        offset: {x: 0, y: 0}
      });
    });
    this.group.add(this.line);
    this.group.add(this.head);
    this.group.add(this.handle);

    this.layer.add(this.group);
    this.layer.draw();
  },

  shiftFrom: function(position, silent) {
    this.render();
  },
  shiftTo: function(position, silent) {
    this.render();
  },

  clearTimeouts: function() {
    this.timeouts.map(function(t) {
      clearTimeout(t);
    });
    this.timeouts = [];
  }
});
