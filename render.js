const penCanvas = document.createElement("canvas");
const renderCanvas = document.createElement("canvas");
const penCtx = penCanvas.getContext("2d");
const renderCtx = renderCanvas.getContext("2d");
renderCanvas.style = "border: 5px solid black";
penCanvas.width = renderCanvas.width = 480;
penCanvas.height = renderCanvas.height = 360;
penCtx.lineCap = "round";

document.body.appendChild(renderCanvas);

const penClear = () => penCtx.clearRect(0, 0, 480, 360);

function drawPen(x1, y1, x2, y2, color, alpha, size){
  if(alpha){
    const l = color[2] * (1 - color[1] / 2);
    penCtx.strokeStyle = `hsl(${3.6 * color[0]},${100 * (color[2] - l) / Math.min(l, 1 - l) || 0}%,${100 * l}%)`;
    penCtx.globalAlpha = alpha;
    penCtx.lineWidth = size;
    penCtx.beginPath();
    penCtx.moveTo(x1 + 240, 180 - y1);
    penCtx.lineTo(x2 + 240, 180 - y2);
    penCtx.stroke();
  }
}

function draw(){
  renderCtx.fillStyle = "#fff";
  renderCtx.fillRect(0, 0, 480, 360);
  renderCtx.drawImage(penCanvas, 0, 0);
}
