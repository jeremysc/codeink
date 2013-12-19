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
    _.bindAll(this, 'render', 'renderValue');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;

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

    var sketch = this.renderValue();

    this.layer.add(this.group);
    this.layer.draw();
  },

  renderValue: function() {
    var self = this;

    // draw the number 
    var value = this.model.get('value');
    var sketch = new Kinetic.Label({
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
      var tag = this.getTag();
      tag.setStroke('red');
      self.layer.draw();
    });
    sketch.on("mouseout", function() {
      var tag = this.getTag();
      tag.setStroke('black');
      self.layer.draw();
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
  }
});

var ListSketch = DatumSketch.extend({
  model: List,

  initialize: function(options) {
    var self = this;
    _.bindAll(this, 'render', 'animateAppend', 'animateInsert');
    this.layer = options.layer;
    this.globals = options.globals;
    this.dragData = options.dragData;

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
      var tag = this.getTag();
      tag.setStroke('red');
      self.layer.draw();
    });
    sketch.on("mouseout", function() {
      var tag = this.getTag();
      tag.setStroke('black');
      self.layer.draw();
    });

    /* dragging:
    user clicks
    - deal with double click = debouncing

    when the user clicks:
      - set the value as dragData (global, draggable)
      - if exit occurs quickly
        - make a copy
      - if user dwells before exit, mark as a pop
        - on exit, pop from the list (list redraws and closes gap) 
      - for re-entry, use relative loop index
    */
    sketch.on("mousemove", function(event) {
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
            console.log("exit WITH dwell");
          } else {
            // duplicate sketch
            self.renderListValue(x,y,value,index);
            console.log("exit WITHOUT dwell");
          }
        }
      }
    });
    var startDrag = function(event) {
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

      // handle drags inside loop
      var loop = self.model.get('loop');
      var dragIndex = index;
      if (loop != null) {
        var loopIndex = loop.getValue();
        if (loopIndex < index) {
          dragIndex = new Expr({
            value: loop,
            offset: index - loopIndex,
            parts: ['value', ' + ', 'offset']
          });
        } else if (loopIndex > index) {
          dragIndex = new Expr({
            value: loop,
            offset: loopIndex - index,
            parts: ['value', ' - ', 'offset']
          });
        } else {
          dragIndex = loop;
        }
      }
      self.dragData.set({
        dragging: true,
        expr: new ListVarExpr({
          list: self.model,
          index: dragIndex
        }),
        sketch: this,
        offset: offset,
        src: self,
        value: value
      });
      this.exited = false;
      this.dwelled = true;
      //setTimeout(function(sketch) { sketch.dwelled = true; }, 1000, this);
    };

    sketch.on("mousedown", _.debounce(startDrag, 150));

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

        // handle drags inside loop
        var loop = self.model.get('loop');
        var dragIndex = index;
        if (loop != null) {
          var loopIndex = loop.getValue();
          if (loopIndex < index) {
            dragIndex = new Expr({
              value: loop,
              offset: index - loopIndex,
              parts: ['value', ' + ', 'offset']
            });
          } else if (loopIndex > index) {
            dragIndex = new Expr({
              value: loop,
              offset: loopIndex - index,
              parts: ['value', ' - ', 'offset']
            });
          } else {
            dragIndex = loop;
          }
        }

        // Start building the pending step
        self.dragData.set({step: new Insert({list: self.model, index: dragIndex, value: self.dragData.get('expr'), animation: self.animateInsert})});

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
          // handle drags inside loop
          var loop = self.model.get('loop');
          var dragIndex = index;
          if (loop != null) {
            var loopIndex = loop.getValue();
            if (loopIndex < index) {
              dragIndex = new Expr({
                value: loop,
                offset: index - loopIndex,
                parts: ['value', ' + ', 'offset']
              });
            } else if (loopIndex > index) {
              dragIndex = new Expr({
                value: loop,
                offset: loopIndex - index,
                parts: ['value', ' - ', 'offset']
              });
            } else {
              dragIndex = loop;
            }
          }
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
  animateInsert: function(step, callback) {
    var self = this;
    var values = self.model.get('values');
    var shift = box_dim+box_shift;

    // check for pop
    var value = step.get('value');
    var pop, popping = false;
    if (!isPrimitiveType(value) && !isDatum(value)) {
      if (value.get("action") == "pop") {
        pop = value;
        popping = true;
      }
    }

    if (popping) {
      var insertIndex = step.get('index');
      var popIndex = pop.get('index');
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
    }
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
