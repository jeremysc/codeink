Non-interacting pairs:
  - Indirectly moved subtrees with anything
  - Sublists with anything (only drop to copy?)

Get active bounds for dragged object
- Num: kinetic rect
- List element: kinetic rect
- Sublist: kinetic rect
- Node: circle
- Edge: pointer root or head

For every other sketch:
  - previewInteraction
    - If interacting, and is a relevant candidate
      - Preview some behavior
        - Remember to hide other behaviors within the otherSketch
        - Clear old dwell timers
      - Commit the behavior if it's safe
      - Populate the dragData.step if it's unsafe
      - If a new behavior, start the dwell timer
      - If an old behavior, check the dwell state
        - If dwelling, offer other options
    - If not interacting
      - Hide behaviors
      - Clear the dwell timer

Lists:

  - List:

    Drag laterally:
      - Expand the list when exiting the original position
      - Dragged element gets re-drawn
      - Preview compares and inserts
    On leaving the bounds:
      - Collapse the list
    On re-enter:
      - Expand the list, start previewing things again

    Dwell and drag laterally:
      - On dwell: set poppedIndex in the ListSketch
      - Expand the list
        - Dragged element is skipped in rendering
        - Dropping in the gap is a no-op
      - Preview compares and inserts
      - On leaving the bounds:
        - Collapse the list (popped elem should still be skipped)
      - On re-enter:
        - Expand again (should be a gap again)

    Dwell: trigger a dwell event on the canvas
      - Expand the list if the sketch is a list

  - If sketch is a list:
    - If dwelled:
      - Call previewInteraction on the list

    - If not exited:
      - Check if it has exited - if not, just move it

    - If exited:
      - Call previewInteraction on the list
    

  - Drag out vertically
    - When exited, create the copy
    - If re-entering the vicinity, expand the list

  - Dwell
    - When dwelled, expand the list
    - Interpret the current position as an insert
  
  - Dwell and drag laterally
    - List is expanded
    - Drag left and right, do the comparisons or the previewed inserts
  
  - Dwell and drag vertically
    - If exiting, list collapses
    - On re-entering, the list expands
    - Preview comparisons and inserts

  - Expanding: expand around insertion point

    
// handle dragging of numbers in
this.group.on("mouseenter", function(event) {
  if (self.dragData.get('dragging') && ! self.dragData.get('engaged')) {
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
        })
      });
    } else {
      self.dragData.set({
        step: new Insert({
          list: self.model,
          index: dragIndex,
          value: self.dragData.get('expr'),
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
/* dragging:
  - set the value as dragData (global, draggable)
  - if exit occurs quickly
    - make a copy
  - if user dwells before exit, mark as a pop
    - on exit, pop from the list datum (list redraws and closes gap) 
*/


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

// NUMBERS
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

