const broadcast = function(broad){
  broad = broad.toLowerCase();
  for(const sprite in sprites){
    for(const idx in sprites[sprite].a[broad]){
      const iterator = sprites[sprite].a[broad][idx]();
      iterator.next();
      iterators.push([sprite, iterator]);
    }
  }
};

const broadcastWait = function*(_){
  broadcast(_);
};

const createClone = function(){
};
const deleteClone = function(){
};
const askWait = function*(quest){
};

const toBool = x => !!(+x) || (isNaN(+x) && x != "false");

const modulo = (a, b) => Math.abs(b) == Infinity && Math.abs(a) < Infinity ? a : ((a % b) + b) % b;
const tan = _ => Math.abs(_ = Math.round(Math.tan(.017453292519943295 * _) * 1e10) / 1e10) === 16331239353195368 ? Infinity * Math.sign(_) : _;

const equals = (a, b) => (isNaN(+a) && isNaN(+b)) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() == b.toString().toLowerCase() : +a == +b;
const notEqual = (a, b) => (isNaN(+a) && isNaN(+b)) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() != b.toString().toLowerCase() : +a != +b;
const lessThan = (a, b) => isNaN(+a) || isNaN(+b) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() < b.toString().toLowerCase() : +a < +b;
const lessThanEqual = (a, b) => isNaN(+a) || isNaN(+b) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() <= b.toString().toLowerCase() : +a <= +b;
const greaterThan = (a, b) => isNaN(+a) || isNaN(+b) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() > b.toString().toLowerCase() : +a > +b;
const greaterThanEqual = (a, b) => isNaN(+a) || isNaN(+b) || (typeof a === "string" && !a.trim().length) || (typeof b === "string" && !b.trim().length) ? a.toString().toLowerCase() >= b.toString().toLowerCase() : +a >= +b;

const hideVar = function(id){
};
const showVar = function(id){
};
const hideList = function(id){
};
const showList = function(id){
};

const listStr = list => (
  (list.every(item => item.toString().length == 1)) ?
  list.join`` :
  list.join` `
);

const listIdx = (a, b) => !isNaN(+b) ? (+b - 1) | 0 : (b = (b + "").toLowerCase()) === "last" ? a - 1 : b === "random" || b === "any" ? (Math.random() * a) | 0 : -1;

const listInsert = function(a, b, c){
  if(b == "last")
    a.push(c);
  else if(--b >= 0 && b <= a.length)
    a.splice(b, 0, c);
};

const listReplace = (a, b, c) => (b >= 0 && b < a.length) && (a[b] = c);
const listDelete = (a, b) => b === "all" ? (a = []) : a.splice(listIdx(a, b), 1);
const randInt = (a, b) => (a = a < b ? a : b) + Math.floor((b - a + 1) * Math.random());
const randFloat = (a, b) => (a = a < b ? a : b) + (b - a) * Math.random();
const randNum = (a, b, c) => (a = (+a || 0) < (+b || 0) ? a : b) + (((+a % 1) || (+b % 1) || (a[c = "includes"] && a[c]`.`) || (b[c] && b[c]`.`)) ? ((+b || 0) - (+a || 0)) * Math.random() : Math.floor(((+b || 0) - (+a || 0) + 1) * Math.random()));

const sprites = [];
const spriteDefs = [];
let iterators = [];

const gotoXY = function(sprite, x, y){
//  x = Math.max(Math.min(x, 240), -240);
//  y = Math.max(Math.min(y, 180), -180);
  sprite.h && drawPen(sprite.c, sprite.d, x, y, sprite.i, sprite.j, sprite.k);

  sprite.c = x;
  sprite.d = y;
};

const playFull = function*(_){ //Sound :(
};

const penColInt = col => [rgbHSV(col & 0xffffff), (col >>>= 24) ? col / 255 : 1];

const penCol = (col, temp) => (
  (
    col = isNaN(+col) ?
    (
      isNaN(temp = +("0x" + col.slice(2, col.length - 1))) ?
      0 :
      temp
    ) :
    +col
  ),
  [
    rgbHSV(col & 0xffffff),
    (col >>>= 24) ? col / 255 : 1
  ]
);

const keyPressed = key => (
  typeof key == "number" ?
  keys[_] : (
    (key = key.toUpperCase()) == "ANY" ?
    keys.includes(true) :
    keys[{
      "ENTER": "ENTER",
      "SPACE": "SPACE",
      "LEFT ARROW": "ARROWLEFT",
      "UP ARROW": "ARROWUP",
      "RIGHT ARROW": "ARROWRIGHT",
      "DOWN ARROW": "ARROWDOWN"
    }[key] || key[0]]
  )
);

const rgbHSV = _ => {
  _ = [((_ >> 16) & 255) / 255, ((_ >> 8) & 255) / 255, (_ & 255) / 255];
  const a = Math.max(..._);
  const b = a - Math.min(..._);
  return [b ? 50 / 3 * (a == _[0] ? ((_[1] - _[2]) / b) % 6 : a == _[1] ? (_[2] - _[0]) / b + 2 : (_[0] - _[1]) / b + 4) : 0, b / a || 0, a]
};

const keys = {};

let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

addEventListener("keydown", function(e){
  e.preventDefault();
  keys[e.key.toUpperCase()] = true;


  for(const sprite in sprites){
    for(const idx in sprites[sprite].l[e.key.toUpperCase()]){
      const iterator = sprites[sprite].l[e.key.toUpperCase()][idx]();
      iterator.next();
      iterators.push([sprite, iterator]);
    }
  }
});
addEventListener("keyup", e => keys[e.key.toUpperCase()] = false);

renderCanvas.addEventListener("mousemove", function(e){
  const rect = renderCanvas.getBoundingClientRect();
  mouseX = Math.max(-240, Math.min(240, e.clientX - rect.left - 240));
  mouseY = Math.max(-180, Math.min(180, 180 + rect.top - e.clientY));
});

addEventListener("mousedown", () => mouseDown = true);
addEventListener("mouseup", () => mouseDown = false);

let counter = 0;
let answer = "";
let start = Date.now();

let running = true;
const flag = function(){
  for(const sprite in sprites){
    for(const idx in sprites[sprite].b)
      iterators.push([sprite, sprites[sprite].b[idx]()])
  }

  function run(){
    const prev = Date.now();

    for(const idx in iterators){
      if(iterators[idx]?.[1]?.next()?.done)
        iterators.splice(idx, 1);
    }

    draw();

    if(running)
      requestAnimationFrame(run);
  }
  run();
};
