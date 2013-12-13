Codeink
=======
[Use it here](http://people.csail.mit.edu/jscott/codeink/). An environment where you can describe an algorithm by tracing it on concrete examples.

1. Setup an example by dragging objects onto the stage.
2. Trace the algorithm by directly manipulating the objects.
3. Codeink translates the trace into (Python) steps.
4. Play back the steps as an animation of the algorithm.

The hope is that this environment will make it easier for 
* Teachers to illustrate algorithms.
* Students to ground their understanding on concrete examples.
* Developers to think through programming problems and debug and test their ideas.

Codeink follows from [Bret Victor's](http://worrydream.com) environment for [Drawing Dynamic Visualizations](http://vimeo.com/66085662). 
It also utilizes part of [Philip Guo's](http://pgbovine.net/) [Online Python Tutor](http://www.pythontutor.com/) to obtain an execution trace of Python code. In some ways, Codeink is complementary to OPT, because where OPT visualizes what the computer is doing, Codeink allows the programmer to 'be the computer' to test their understanding without writing code.

NOTE: To get Codeink working locally, you'll have to point the shebang in ./opt/web_exec.py to your system's Python.
