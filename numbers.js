var NumberSketch = DatumSketch.extend({
  model: Number,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'remove', 'render', 'renderValue', 'selectIfIntersects', 'deselect', 'startDrag', 'previewInteraction', 'hideInteractions');
    this.timeouts = [];
    this.intervals = [];

    // Standard global variables
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;

    // Number-specific properties
    this.sketch = null;
    this.selected = false;
    this.previewValue = null;

    // Prompt user to initialize the number
    if (self.model.getValue() == null) {
      var value = prompt('Enter new value');
      if (value != null) {
        self.model.set({value: value});
        var step = new Assignment({
          variable: self.model,
          value: value,
          isInitialization: true
        });
        self.model.trigger('step', {step: step});
      }
    // Number already has a value
    } else {
      var step = new Assignment({
        variable: self.model,
        value: self.model.getValue(),
        isInitialization: true
      });
      self.model.trigger('step', {step: step});
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
    this.model.on('fill', this.fill);
    this.model.on('destroy', this.remove);
  },
  
  fill: function(options) {
    var sketch = this.sketches[options.index];
    sketch.getTag().setFill(options.color);
    this.layer.draw();
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

  deselect: function() {
    this.selected = false;
  },
  
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

    if (this.previewAction == 'compare') {
      this.sketch = this.renderComparison(this.previewValue);
    } else {
      this.sketch = this.renderValue();
    }

    this.layer.add(this.group);
    this.layer.draw();
  },

  renderValue: function() {
    var self = this;
    var value = this.model.get('value');

    // Draw it using a Kinetic.Label
    var sketch = new Kinetic.Label({
    });
    sketch.add(new Kinetic.Tag({
      strokeWidth: 3
    }));
    sketch.add(new Kinetic.Text({
      text: (this.previewAction == 'assign') ? this.previewValue : value,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: box_dim,
      height: box_dim,
      offsetY: -5,
      align: 'center',
      fill: (this.previewAction == 'assign') ? '#46b6ec' : 'black'
    }));

    if (this.previewAction == null) {
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
        self.selectLeft = null;
        self.numSelected = 0;
        self.clearTimeouts();
      });
      sketch.on("dblclick", function() {
        self.selected = false;
        self.clearTimeouts();
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

      sketch.on("mousedown", function(event) {
        self.selected = true;
        self.addTimeout(self.startDrag, 150, event);
        // No dwell timers for numbers
      });
    }

    this.group.add(sketch);
    return sketch;
  },
  
  renderComparison: function(dragValue) {
    var self = this;
    var value = this.model.get('value');

    var oldMiddle = box_dim / 2;
    var x = oldMiddle - 0.75*box_dim;
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

  startDrag: function(event) {
    var kinetic, expr, value;
    var groupPosition = this.group.getPosition();
    // get grab offset
    var offset = {x: event.offsetX - groupPosition.x,
                  y: event.offsetY - groupPosition.y};

    // set the expression and value
    expr = this.model;
    value = this.model.getValue();

    // move selected elems to a new group
    kinetic = new Kinetic.Group();
    kinetic.setPosition(groupPosition);
    this.sketch.moveTo(kinetic);
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
  previewInteraction: function(dragSketch, dragBounds) {
    var self = this;

    var bounds = getGroupRect(this.group);
    var kinetic = this.dragData.get('kinetic');
    var exited = this.dragData.get('exited');

    if (dragSketch.model.get('type') == 'node' &&
        dragSketch.dragType != 'value')
      return false;

    // First: wait for the number to exit itself
    if (dragSketch.model.get('name') == this.model.get('name')) {
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

    // Check if intersecting
    if (intersectRect(dragBounds, bounds)) {
      // If not previewing, start the comparison
      if (this.previewAction == null) {
        this.previewValue = this.dragData.get('value');
        this.previewAction = 'compare';
        kinetic.hide();
        this.layer.draw();

        // Commit the comparison
        var step = new Compare({
          drag: this.dragData.get('expr'),
          against: this.model,
          dragSketch: dragSketch,
          againstSketch: this
        });
        this.model.trigger('step', {step: step});

        // Start a timeout to switch to assignment
        this.addTimeout(function() {
          self.previewAction = 'assign';
          var step = new Assignment({
            variable: self.model,
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
      this.clearTimeouts();
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
});


