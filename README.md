# Some Scratch Compiler
An WIP optimizing Scratch-to-JS compiler

# About
The goal of this compiler is to reduce code size and maximum code speed.
An example (via Scratchblocks) is as follows:
```
define fib (n)
  set [a v] to (0)
  set [b v] to (1)
  set [c v] to (1)
  repeat (n)
    set    [a v] to (b)
    set    [b v] to (c)
    change [c v] by (a)
  end
```
Should be compiled to something similar to this (when unminified):
```js
function(a0){
  v0 = 0;
  v1 = 1;
  v2 = 1;
  for(let _ = +(a0) || 0; _-- >= 0.5;){
    v0 = v1;
    v1 = v2;
    v2 += v0;
  }
}
```
Note that in the future this could possibly be optimized further upon knowing input types for a function -- For example, if this input would never have anything but a number the `+(a0) || 0` could just become `(a0) || 0` or even just `a0`.

# Limitations
As this is a work in progress, there is currently no way to render sprites, and the current method of rendering pen is via a Canvas Context 2D. This is due to the main focus of the code at the moment being towards the actual compiled code, leaving only a very simple base for rendering (see `render.js`).
