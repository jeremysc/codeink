var ListSketch = DatumSketch.extend({
  model: List,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'remove', 'render', 'fill', 'selectIfIntersects', 'deselect', 'startDrag', 'previewInteraction', 'hideInteractions', 'getInteraction', 'showComparison', 'hideComparison', 'cancelDwell');
    this.timeouts = [];
    this.intervals = [];

    // Standard global variables
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;

    // List-specific properties
    this.sketches = [];
    this.selectLeft = null;
    this.numSelected = 0;
    this.expanded = false;
    this.expansionPoint = null;
    this.previewAction = null;
    this.previewIndex = null;
    this.poppedIndex = null;

    // Prompt user to initialize the list
    if (this.model.get('expr') == null) {
      var valueString = prompt('Enter comma-separated values, or nothing for an empty list');
      var values = (valueString == null) ? [] : JSON.parse("["+valueString.replace(/,$/,'')+"]");
      this.model.set({values: values});
      var step = new Assignment({
        variable: this.model,
        value: this.model.getValue(),
        isInitialization: true
      });
      this.model.trigger('step', {step: step});
    // List is a copy of some other values
    } else {
      var expr = this.model.get('expr');
      var index = expr.get('index');
      if (this.model.get('values').length == 1) {
        expr = new Expr({
          parts: {
            python: ["[", "index", "]"],
            english: ["[", "index", "]"],
          },
          index: expr,
        });
      }
      var step = new Assignment({
        variable: this.model,
        value: expr,
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

    // Bind model change and fill events
    this.model.on('change', this.render);
    this.model.on('destroy', this.remove);
    this.model.on('fill', this.fill);

    this.model.on('showComparison', this.showComparison);
    this.model.on('hideComparison', this.hideComparison);
  },
  
  fill: function(options) {
    var sketch = this.sketches[options.index];
    sketch.getTag().setFill(options.color);
    this.layer.draw();
  },

  cancelDwell: function() {
    this.clearTimeouts();
    this.clearIntervals();
    if (this.dwellCircle && this.dwellCircle != null) {
      this.dwellCircle.remove();
      this.dwellCircle = null;
    }
  },
  
  selectIfIntersects: function(rect) {
    var self = this;
    var selectRect = getRectCorners(rect);
    this.selectLeft = null;
    this.numSelected = 0;
    var groupPos = this.group.getPosition();
    for (var i = 0; i < self.sketches.length; i++) {
      var sketch = this.sketches[i];
      var sketchRect = getRectCorners(sketch);
      sketchRect.left += groupPos.x;
      sketchRect.right += groupPos.x;
      sketchRect.top += groupPos.y;
      sketchRect.bottom += groupPos.y;
      if (intersectRect(selectRect, sketchRect)) {
        sketch.getTag().setStroke('red');
        if (self.selectLeft == null)
          self.selectLeft = i;
        self.numSelected += 1;
      } else {
        sketch.getTag().setStroke('black');
      }
    }
    this.layer.draw();
  },

  deselect: function() {
    this.numSelected = 0;
    this.selectLeft = null;
  },

    /*
      // Show comparison
      - If dragging, exit
      - Set the poppedIndex if necessary
      - set previewAction to compare
      - set previewIndex
      - Expand around the midpoint
    
      Hide comparison
      - If dragging, exit
      - Set everything to null
      - Collapse
    */

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

    var againstExpr = compare.get('against');
    this.previewAction = 'compare';
    this.previewIndex = againstExpr.get('index');
    this.previewValue = value;
    this.expand(this.group.getPosition().x);
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
    this.previewIndex = null;
    this.previewValue = null;
    this.collapse();
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

    // If expanded, draw a container box
    var xpos, shift_by;
    if (this.expanded) {
      var numValues = this.model.get('values').length;
      var localExpansionPoint = this.expansionPoint -
                                this.group.getPosition().x;
      var fixedIndex = Math.floor(localExpansionPoint / 
                                  (box_dim+box_shift));
      var fixedX = fixedIndex * (box_dim+box_shift);
      var left = fixedX - (fixedIndex * (box_dim+expanded_shift));
      this.outline = new Kinetic.Rect({
        x: left - box_dim,
        y: -3,
        width: (numValues*(box_dim+expanded_shift)) + box_dim,
        height: box_dim + 6,
        strokeWidth: 1,
        stroke: 'grey'
      });
      this.group.add(this.outline);
      xpos = left;
      shift_by = expanded_shift;
    } else {
      xpos = 0;
      shift_by = box_shift;
    }
    
    // Preview the insert, if necessary
    if (this.previewAction == 'insert' && this.poppedIndex != this.previewIndex) {
      var x = this.outline.getPosition().x + 
              this.previewIndex*(box_dim+shift_by);
      var sketch = this.renderListValue(x, this.dragData.get('value'), this.previewIndex, true);
      sketch.getTag().setStroke('red');
      sketch.getText().setFill('#46b6ec');
    }

    // Render each list element
    this.sketches = [];
    var values = this.model.get('values');
    for (var index = 0; index < values.length; index++) {
      var value = values[index];
      if (index != this.poppedIndex) {
        if (this.previewAction == 'compare' && this.previewIndex == index) {
          var dragValue = (this.dragData.get('dragging')) ? this.dragData.get('value') : this.previewValue;
          if (isArray(dragValue)) dragValue = dragValue[0];
          this.renderListComparison(xpos, value, dragValue);
        } else {
          var sketch = this.renderListValue(xpos, value, index, false);
          this.sketches.push(sketch);
        }
        xpos += box_dim+shift_by;
      } else if (this.expanded) {
        xpos += box_dim+shift_by;
      }
    }

    // Render the plus box
    this.plus = new Kinetic.Label({
      x: xpos,
      name: 'plus'
    });
    this.plus.add(new Kinetic.Tag({
      strokeWidth: 0
    }));
    this.plus.add(new Kinetic.Text({
      text: "+",
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: box_dim*0.75,
      height: box_dim,
      offsetY: -5,
      align: 'center',
      fill: 'black'
    }));
    this.plus.on("click", function() {
      var value = prompt('Enter new value');
      if (value != null) {
        var values = self.model.get('values');
        values.push(value);
        self.model.set({values: values});
        var step = new Append({list: self.model, value: value});
        self.model.trigger('step', {step: step});
      }
    });
    if (! this.expanded)
      this.group.add(this.plus);
    
    this.layer.add(this.group);
    this.layer.draw();
  },

  renderLabel: function() {
    var self = this;
    var label = new Kinetic.Label({
      x: 0,
      y: -28,
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

  renderListComparison: function(x, value, dragValue) {
    // Draw a box 1.5*box_dim wide,
    // centered where the original value would have been
    var oldMiddle = x + box_dim / 2;
    x = oldMiddle - 0.75*box_dim;
    var sketch = new Kinetic.Label({
      x: x,
    });
    sketch.add(new Kinetic.Tag({
      stroke: 'red',
      strokeWidth: 3
    }));

    var first = (value <= dragValue) ? value : dragValue;
    var second = (value > dragValue) ? value : dragValue;
    var operator = (value == dragValue) ? "=" : "<";
    var isFirst = (value > dragValue);
    
    sketch.add(new Kinetic.Text({
      text: first,
      fontFamily: 'Helvetica',
      fontSize: 30,
      width: box_dim*1.5,
      height: box_dim,
      offsetX: box_dim*0.4,
      offsetY: -7.5,
      align: 'center',
      fill: isFirst ? '#46b6ec' : 'black'
    }));
    sketch.add(new Kinetic.Text({
      text: operator,
      fontFamily: 'Helvetica',
      fontSize: 30,
      width: box_dim*1.5,
      height: box_dim,
      offsetY: -7.5,
      align: 'center',
      fill: 'black'
    }));
    sketch.add(new Kinetic.Text({
      text: second,
      fontFamily: 'Helvetica',
      fontSize: 30,
      width: box_dim*1.5,
      height: box_dim,
      offsetX: -box_dim*0.4,
      offsetY: -7.5,
      align: 'center',
      fill: isFirst ? 'black' : '#46b6ec'
    }));
    this.group.add(sketch);
  },
      
  // Draw a list value
  renderListValue: function(x, value, index, isPreview) {
    var self = this;

    // Draw it using a Kinetic.Label
    var sketch = new Kinetic.Label({
      x: x,
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

    if (!isPreview) {
      // Highlight on hover, if not selected
      sketch.on("mouseover", function() {
        if (self.numSelected == 0) {
          var tag = this.getTag();
          tag.setStroke('red');
          self.layer.draw();
        }
      });
      sketch.on("mouseout", function() {
        if (self.numSelected == 0) {
          var tag = this.getTag();
          tag.setStroke('black');
          self.layer.draw();
        }
      });

      sketch.on("click", function() {
        self.selectLeft = null;
        self.numSelected = 0;
        self.cancelDwell();
        /*
        if (self.state.filling()) {
          var step = new Fill({
            variable: new ListVarExpr({
              list: self.model,
              index: index
            }),
            list: self.model,
            index: index,
            color: self.state.color
          });
          self.model.trigger('step', {step: step});
          return;
        }
        */
      });
      sketch.on("dblclick", function() {
        self.selectLeft = null;
        self.numSelected = 0;
        self.cancelDwell();
        var value = prompt('Enter new value');
        if (value != null) {
          var values = self.model.get('values');
          values[index] = value;
          self.model.set({values: values});
          var step = new Assignment({
            variable: new ListVarExpr({
              list: self.model,
              index: index
            }),
            value: value
          });
          self.model.trigger('step', {step: step});
        }
      });

      sketch.on("mousedown", function(event) {
        if (self.numSelected == 0) {
          self.selectLeft = index;
          self.numSelected = 1;
        }

        // Timer to start the drag
        self.addTimeout(self.startDrag, 150, event);
        // Interval to animate the dwell state
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
        // Timer to flag dwell state
        self.addTimeout(function() {
          // if exited, ignore the dwell
          // shouldn't happen if exit clears the timeout
          if (self.dragData.get('exited'))
            return;
          // modify the expression to be a pop
          var expr = new Pop({list: self.model, index: index});
          self.dragData.set({dwelled: true, expr: expr});
          self.poppedIndex = index;
          self.expand(event.offsetX);
        }, 1000);
      });
    }

    this.group.add(sketch);
    return sketch;
  },

  expand: function(point, silent) {
    this.expanded = true;
    this.expansionPoint = point;
    if (silent == undefined || !silent)
      this.render();
  },

  collapse: function(silent) {
    this.expanded = false;
    this.expansionPoint = null;
    if (silent == undefined || !silent)
      this.render();
  },
    
  startDrag: function(event) {
    var kinetic, expr, value;
    var groupPosition = this.group.getPosition();
    // get grab offset
    var offset = {x: event.offsetX - groupPosition.x,
                  y: event.offsetY - groupPosition.y};

    if (this.numSelected > 0) {
      var left = this.selectLeft;
      var right = this.selectLeft + this.numSelected;
      var indexString = (this.numSelected > 1) ? 
        left + ':' + right : 
        left;
      
      // set the expression and value
      expr = new ListVarExpr({
          list: this.model,
          index: indexString
      });
      value = this.model.get('values').slice(left, right);

      // move selected elems to a new group
      var leftPosition = this.sketches[left].getPosition();
      groupPosition.x += leftPosition.x;
      offset.x -= leftPosition.x;
      groupPosition.y += leftPosition.y;
      offset.y -= leftPosition.y;
      kinetic = new Kinetic.Group();
      kinetic.setPosition(groupPosition);
      for (var i = left, j = 0; i < right; i++, j++) {
        var selectedSketch = this.sketches[i];
        selectedSketch.setPosition({x: j*(box_dim+box_shift), y:0});
        selectedSketch.moveTo(kinetic);
      }
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
    }
  },

  previewInteraction: function(dragSketch, dragBounds) {
    var exitThresh = box_dim*0.75;
    var enterThresh = box_dim/2;
    var dwelled = this.dragData.get('dwelled');
    var exited = this.dragData.get('exited');

    var bounds = getGroupRect(this.group);

    // First: cancel dwell timeout if exiting quickly
    if (dragSketch.model.get('name') == this.model.get('name')) {
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
          this.cancelDwell();

          // Re-render to make a copy
          this.render();
          return true;
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

    // If not expanded, then check if entered
    // and expand if so
    if (!this.expanded) {
      bounds.left   -= enterThresh;
      bounds.right  += enterThresh;
      bounds.top    -= enterThresh;
      bounds.bottom += enterThresh;

      if (intersectRect(dragBounds, bounds)) {
        // Expand the list, if not already expanded
        var dragCenter = dragBounds.left + 
                        (dragBounds.right - dragBounds.left)/2;
        this.expand(dragCenter);
        return true;
      }
    } else {
      bounds.left   -= exitThresh;
      bounds.right  += exitThresh;
      bounds.top    -= exitThresh;
      bounds.bottom += exitThresh;

      if (intersectRect(dragBounds, bounds)) {
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
    }
    return false;
  },

  hideInteractions: function(silent) {
    if (this.previewAction == null &&
        ! this.expanded)
      return;
    this.previewAction = null;
    this.previewIndex = null;
    this.collapse(silent);
  },

  getInteraction: function(bounds) {
    var groupPosition = this.group.getPosition();
    if (bounds.bottom < groupPosition.y ||
        bounds.top > groupPosition.y + box_dim)
      return {action: null, index: null};

    var x = bounds.left + (bounds.right - bounds.left)/2;
    var localX = x - groupPosition.x;
    var left = this.outline.getPosition().x;
    var offset = localX - left;

    var index = Math.floor(offset / box_dim);
    var action = (index % 2 != 0) ? 'compare' : 'insert';
    index = Math.floor(index / 2);
    if (this.poppedIndex != null) {
      if (index == this.poppedIndex ||
          (index == this.poppedIndex + 1 && action == 'insert'))
        return {action: null, index: null};
    }
    if (action == 'compare' && index >= this.model.get('values').length)
      return {action: null, index: null};
    if (index < 0)
      return {action: null, index: null};

    return {action: action, index: index};
  }
});
