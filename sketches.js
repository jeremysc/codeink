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
  var groupPosition = group.getPosition();
  var rects = group.getChildren().map(function(child) {
    var position = child.getPosition();
    var width = child.getWidth();
    var height = child.getHeight();
    return {left: groupPosition.x + position.x, right: groupPosition.x + position.x + width, top: groupPosition.y + position.y, bottom: groupPosition.y + position.y + height};
  });
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
  drawBoxAndLabel: function(x, y, boxw, boxh, value, index) {
    var text_height = boxh-10;

    var box = new Kinetic.Rect({
      index: index,
      x: x,
      y: y,
      width: boxw,
      height: boxh,
      stroke: 'black',
      strokeWidth: 3
    });

    var label = new Kinetic.Text({
      y: y + (boxh - text_height) / 2.0,
      text: value,
      fontSize: text_height,
      fontFamily: 'Helvetica',
      fill: 'black'
    });
    var label_x = x + (boxw - label.textWidth)/2.0;
    label.setX(label_x);

    return {box: box, label: label};
  }
});

var NumberSketch = DatumSketch.extend({
  model: Number,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'renderValue', 'selectIfIntersects');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.sketch = null;
    this.selected = false;

    var position = this.model.get('position');
    this.group = new Kinetic.Group({
      name: this.model.getSymbol(),
      x: position.x,
      y: position.y
    });
    if (self.model.getValue() == null) {
      self.model.set({value: 0});
      var step = new Assignment({
        variable: self.model,
        value: self.model.getValue()
      });
      self.model.trigger('step', {step: step});
    }

    this.group.on("dragend", function(event) {
      self.model.set({position: this.getPosition()});
    });
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

    // draggable label
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
      fontSize: 18,
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
    label.on("dblclick", function() {
      var name = prompt('Enter new name:');
      if (name != null) {
        self.model.set({name: name});
      }
    });
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
    sketch.on("dblclick", function() {
      self.editing = true;
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
      if (self.editing) {
        self.editing = false;
        return;
      }
      
      // duplicate sketch
      self.renderValue();

      // move current sketch to global
      this.moveTo(self.globals);
      //self.globals.moveToBottom();
      this.setPosition(self.group.getPosition());

      // get grab offset
      var position = this.getPosition();
      var offset = {x: event.offsetX - position.x,
                    y: event.offsetY - position.y};
      
      self.dragData.set({
        dragging: true,
        expr: self.model,
        sketch: this,
        offset: offset,
        src: self,
        value: self.model.getValue()
      });
      self.layer.draw();
    };

    sketch.on("mousedown", _.debounce(startDrag, 150));

    this.group.add(sketch);
    return sketch;
  }
});

var BinaryNodeSketch = DatumSketch.extend({
  model: BinaryNode,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'selectIfIntersects', 'setFill');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;

    this.model.on('change', this.render);
    this.model.on('fill', this.setFill);
    var step = new Assignment({
      variable: this.model,
      value: new NodeExpr({value: this.model.getValue()})
    });
    this.model.trigger('step', {step: step});
  },
  
  setFill: function(options) {
    console.log('filling');
  },
  
  selectIfIntersects: function(rect) {
  },
  
  render: function() {
    var self = this;
    if (this.group) {
      this.group.removeChildren();
      this.group.remove();
    } else {
      // The raw dropped position, before it has been inserted into a tree
      this.group = new Kinetic.Group({
        name: this.model.getSymbol(),
        draggable: true
      });
      this.group.on("dragend", function(event) {
        //self.model.set({position: this.getPosition()});
        console.log(this.getPosition());
      });
    }
    if (! this.model.get('visible')) {
      this.layer.draw();
      return;
    }
    
    // Update the group's position
    var position = this.model.get('position');
    this.group.setPosition(position);

    // draggable label for the list
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
      fontSize: 18,
      padding: 5,
      fill: 'black'
    }));
    this.group.add(label);

    // draw the node and pointers (hidden)
    var value = this.model.get('value');
    this.node = new Kinetic.Label({
      x: 0,
      y: 0,
    });
    this.node.add(new Kinetic.Tag({
      strokeWidth: 3
    }));
    this.node.add(new Kinetic.Text({
      text: value,
      fontFamily: 'Helvetica',
      fontSize: 35,
      width: box_dim,
      height: box_dim,
      offsetY: -5,
      align: 'center',
      fill: 'black'
    }));
    this.group.add(this.node);
    this.layer.add(this.group);
    this.layer.draw();
  }
});

var ListSketch = DatumSketch.extend({
  model: List,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'animateAppend', 'animateRearrange', 'selectIfIntersects', 'setFill');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;
    this.state = options.state;
    this.selectLeft = -1;
    this.numSelected = 0;

    if (this.model.get('initialized')) {
      var step = new Assignment({
        variable: this.model,
        value: this.model.get('expr'),
      });
      this.model.trigger('step', {step: step});
    }

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
    this.model.on('fill', this.setFill);
  },
  
  setFill: function(options) {
    var sketch = this.sketches[options.index];
    sketch.getTag().setFill(options.color);
    this.layer.draw();
  },

  selectIfIntersects: function(rect) {
    var self = this;
    var selectRect = getRectCorners(rect);
    this.selectLeft = -1;
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
        if (self.selectLeft == -1)
          self.selectLeft = i;
        self.numSelected += 1;
      } else {
        sketch.getTag().setStroke('black');
      }
    }
    this.layer.draw();
  },

  // draws a box and numeric value
  renderListValue: function(x, y, value, index) {
    var self = this;

    // draw the number 
    var sketch = new Kinetic.Label({
      x: x,
      y: y,
      //draggable: true
    });
    sketch.exited = true;
    sketch.dwelled = false;
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

    /* dragging:
    when the user clicks:
      - set the value as dragData (global, draggable)
      - if exit occurs quickly
        - make a copy
      - if user dwells before exit, mark as a pop
        - on exit, pop from the list datum (list redraws and closes gap) 
    */
    var startDrag = function(event) {
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
      // move selected elems to global scope
      if (self.numSelected > 0) {
        self.selected = [];
        var groupPosition = self.group.getPosition();
        var leftPosition = self.sketches[self.selectLeft].getPosition();
        groupPosition.x += leftPosition.x;
        groupPosition.y += leftPosition.y;
        var selectedGroup = new Kinetic.Group();
        // get grab offset
        var offset = {x: event.offsetX - groupPosition.x,
                      y: event.offsetY - groupPosition.y};
        selectedGroup.setPosition(groupPosition);
        self.layer.add(selectedGroup);
        for (var i = self.selectLeft, j = 0; i < self.selectLeft + self.numSelected; i++, j++) {
          var selectedSketch = self.sketches[i];
          selectedSketch.setPosition({x: j*(box_dim+box_shift), y:0});
          selectedSketch.moveTo(selectedGroup);
        }
        var left = self.selectLeft;
        var right = self.selectLeft + self.numSelected;
        self.dragData.set({
          dragging: true,
          expr: new ListVarExpr({
            list: self.model,
            index: left + ':' + right
          }),
          sketch: selectedGroup,
          offset: offset,
          fromSelect: true,
          //src: self,
          value: self.model.get('values').slice(left, right)
        });
        this.exited = false;
        this.dwelled = true;
        return;
      }
      
      // get position of sketch
      var position = this.getPosition();
      var groupPosition = self.group.getPosition();
      position.x += groupPosition.x;
      position.y += groupPosition.y;
      // get grab offset
      var offset = {x: event.offsetX - position.x,
                    y: event.offsetY - position.y};

      // move current sketch to global
      this.moveTo(self.globals);
      //self.globals.moveToBottom();
      this.setPosition(position);

      var dragIndex = index;
      self.dragData.set({
        dragging: true,
        expr: new ListVarExpr({
          list: self.model,
          index: dragIndex
        }),
        sketch: this,
        offset: offset,
        src: self,
        value: [value]
      });
      this.exited = false;
      this.dwelled = true;
      //setTimeout(function(sketch) { sketch.dwelled = true; }, 1000, this);
    };

    sketch.on("mousedown", _.debounce(startDrag, 150));

    sketch.on("mousemove", function(event) {
      if (self.numSelected > 0) {
        if (self.dragData.get('dragging') && !this.exited) {
          // get position of sketch
          var position = self.dragData.get('sketch').getPosition();
          var listLeft = self.group.getPosition().y;
          var listTop = self.group.getPosition().y;
          var listBottom = self.group.getPosition().y + box_dim;
          if (position.y > listBottom || position.y + box_dim < listTop) {
            this.exited = true;
            // duplicate sketch
            var xpos = self.selectLeft*(box_dim+box_shift);
            var values = self.model.get('values');
            for (var i = self.selectLeft; i < self.selectLeft + self.numSelected; i++) {
              self.sketches[i] = self.renderListValue(xpos, 0, values[i], i);
              xpos += box_dim+box_shift;
            }
            self.selectLeft = -1;
            self.numSelected = 0;
          }
        }
        return;
      }
      if (self.dragData.get('dragging') && !this.exited) {
        // get position of sketch
        var position = this.getPosition();
        var listTop = self.group.getPosition().y;
        var listBottom = self.group.getPosition().y + box_dim;
        if (position.y > listBottom || position.y + box_dim < listTop) {
          clearTimeout();
          this.exited = true;
          if (this.dwelled) {
            self.model.pop(index);
            // modify the expression to be a pop
            var expr = new Pop({list: self.model, index: index});
            self.dragData.set({'expr': expr});
          } else {
            // duplicate sketch
            self.renderListValue(x,y,value,index);
          }
        }
      }
    });
    this.group.add(sketch);
    return sketch;
  },

  render: function(event) {
    var self = this;
    this.group.removeChildren();
    this.group.remove();
    if (! this.model.get('visible') && this.model.get('initialized')) {
      this.layer.draw();
      return;
    }

    // draggable label for the list
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
      fontSize: 18,
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
    label.on("dblclick", function() {
      var name = prompt('Enter new name:');
      if (name != null) {
        self.model.set({name: name});
      }
    });
    this.group.add(label);

    // draw the list
    var values = this.model.get('values');
    var xpos = 0;
    this.sketches = [];
    for (var i = 0; i < values.length; i++) {
      var sketch = this.renderListValue(xpos, 0, values[i], i);
      this.sketches.push(sketch);
      xpos += box_dim+box_shift;
    }
    this.plus = this.drawBoxAndLabel(xpos, 0, box_dim, box_dim, "+", -1);
    this.group.add(this.plus.label);
    this.group.add(this.plus.box);
    this.plus.box.on("click", function() {
      var value = prompt('Enter new value');
      if (value != null) {
        var values = self.model.get('values');
        values.push(value);
        self.model.set({values: values});
        self.model.trigger('change');
        if (self.model.get('initialized')) {
          var step = new Append({list: self.model, value: value, animation: self.animateAppend});
          self.model.trigger('step', {step: step});
        }
      }
    });
    
    // initialize button for the list
    if (!this.model.get('initialized')) {
      var check = new Kinetic.Label({
        x: xpos,
        y: box_dim+box_shift,
        opacity: 0.75
      });
      check.add(new Kinetic.Tag({
        fill: 'white'
      }));
      check.add(new Kinetic.Text({
        text: 'done',
        fontFamily: 'Helvetica',
        fontSize: 18,
        padding: 5,
        fill: 'green'
      }));
      check.on("mouseover", function() {
        var tag = this.getTag();
        tag.setStroke('black');
        self.layer.draw();
      });
      check.on("mouseout", function() {
        var tag = this.getTag();
        tag.setStroke('');
        self.layer.draw();
      });
      check.on("click", function() {
        self.model.set({initialized: true});
        var step = new Assignment({
          variable: self.model,
          value: self.model.getValue(),
        });
        self.model.trigger('step', {step: step});
      });
      this.group.add(check);
    }

    // handle dragging of numbers in
    this.group.on("mouseenter", function(event) {
      //TODO why does this work?
      if (!self.model.get('initialized')) {// || self.dragData.get('src') == self) {
        return;
      } else if (self.dragData.get('dragging') && ! self.dragData.get('engaged')) {
        self.dragData.set({engaged: true});

        // hide the sketch
        var sketch = self.dragData.get('sketch');
        sketch.hide();

        // get the insertion index
        var position = this.getPosition();
        position = {x: event.offsetX - position.x, y: event.offsetY - position.y};
        var values = self.model.get('values');
        var index = Math.min(Math.round(position.x / box_dim), values.length);

        var dragIndex = index;
        // Start building the pending step
        var dragExpr = self.dragData.get('expr');
        if (dragExpr != null && dragExpr.get('action') == 'pop'
            && dragExpr.get('list').get('name') == self.model.get('name')) {
          var fromIndex = dragExpr.get('index');
          self.dragData.set({
            step: new Rearrange({
              list: self.model,
              fromIndex: fromIndex,
              toIndex: dragIndex,
              animation: self.animateRearrange
            })
          });
        } else {
          self.dragData.set({
            step: new Insert({
              list: self.model,
              index: dragIndex,
              value: self.dragData.get('expr'),
              //animation: self.animateInsert
            })
          });
        }

        // modify the data
        var value = self.dragData.get('value');
        self.model.insert(index, value);
        this.old_index = index;
      }
    });
    this.group.on("mouseleave", function(event) {
      if (self.dragData.get('dragging') && self.dragData.get('engaged')) {
        self.dragData.set({engaged: false});

        self.model.pop(this.old_index);
        self.dragData.set({step: null});

        // show the sketch
        var sketch = self.dragData.get('sketch');
        sketch.show();
      }
    });
    this.group.on("mousemove", function(event) {
      if (self.dragData.get('dragging') && self.dragData.get('engaged')) {
        if (!self.model.get('initialized')) return;
        var position = this.getPosition();
        position = {x: event.offsetX - position.x, y: event.offsetY - position.y};
        var values = self.model.get('values');
        var index = Math.min(Math.floor(position.x / box_dim), values.length-1);
        if (index != this.old_index) {
          var dragIndex = index;
          var value = self.dragData.get('value');
          self.model.pop(this.old_index);
          self.model.insert(index, value);
          this.old_index = index;
          var step = self.dragData.get('step');
          step.set({index: dragIndex});
        }
      }
    });

    this.layer.add(this.group);
    this.layer.draw();
  },

  // Animations
  animateRearrange: function(step, callback) {
    var self = this;
    var values = self.model.get('values');
    var shift = box_dim+box_shift;

    var insertIndex = step.get('toIndex');
    var popIndex = step.get('fromIndex');
    var popSketch = this.sketches[popIndex];
    // 3 stages to pop and insert the value
    var tween3 = new Kinetic.Tween({
      node: popSketch, 
      duration: 0.2,
      y: 0,
      onFinish: callback
    });
    var tween2 = new Kinetic.Tween({
      node: popSketch, 
      duration: 0.4,
      x: shift*insertIndex,
      onFinish: function() {tween3.play();} 
    });
    var tween1 = new Kinetic.Tween({
      node: popSketch, 
      duration: 0.2,
      y: shift,
      onFinish: function() {tween2.play();} 
    });
    // move the other values to the right
    var tweens = [];
    var shiftStart = (insertIndex < popIndex) ? insertIndex : popIndex;
    var shiftEnd = (insertIndex < popIndex) ? popIndex : insertIndex;
    var shiftDirection = (insertIndex < popIndex) ? 'right' : 'left';
    for (var i = shiftStart; i <= shiftEnd; i++) {
      if (i == popIndex) continue;
      var sketch = self.sketches[i];
      var xpos = sketch.getPosition().x;
      var shiftBy = (shiftDirection == 'right') ? shift : -shift;
      var tween = new Kinetic.Tween({
        node: self.sketches[i], 
        duration: 0.7,
        x: xpos + shiftBy
      });
      tweens.push(tween);
    }
    for (var i = 0; i < tweens.length; i++) {
      tweens[i].play();
    }
    tween1.play();
  },

  animateAppend: function(step, callback) {
    var self = this;
    var values = self.model.get('values');
    var value = step.get('value');
    var groupPosition = self.group.getPosition();
    var position = {};
    position.x = (box_dim+box_shift)*values.length;
    position.y = -groupPosition.y;
    var sketch = new Kinetic.Label(position);
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
    this.group.add(sketch);
    this.layer.draw();
    // animate it
    var tween = new Kinetic.Tween({
      node: sketch, 
      duration: 0.6,
      y: 0,
      onFinish: callback
    });
    // move the plus over as well
    var x = this.plus.box.getPosition().x;
    var plusTween = new Kinetic.Tween({
      node: this.plus.box, 
      duration: 0.6,
      x: x + box_dim+box_shift
    });
    x = this.plus.label.getPosition().x;
    var plusTween2 = new Kinetic.Tween({
      node: this.plus.label, 
      duration: 0.6,
      x: x + box_dim+box_shift
    });
    tween.play();
    plusTween.play();
    plusTween2.play();


  }
  
});
