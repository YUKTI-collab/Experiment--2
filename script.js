// Global State
let points = [];
let delayMs = 500; // Animation delay
let comparisons = 0;
let bfComparisons = 0;
let currentExecutionId = 0; // To track active runs

// Canvas Contexts
const recCanvas = document.getElementById('recCanvas');
const stripCanvas = document.getElementById('stripCanvas');
const recCtx = recCanvas.getContext('2d');
const stripCtx = stripCanvas.getContext('2d');

// Adjust canvas resolution
function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
}

// Initialize canvases
setupCanvas(recCanvas);
setupCanvas(stripCanvas);

// Helpers
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Use actual width/height for clear
}

function drawPoint(ctx, p, color = '#007bff') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawLine(ctx, p1, p2, color = '#28a745', width = 2) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawVerticalLine(ctx, x, color = '#dc3545') {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, recCanvas.height); // Draw full height
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// --- Algorithm Implementation ---

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

function dist(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function bruteForce(pts, n) {
    let min_dist = Number.MAX_VALUE;
    let closest = [];

    for (let i = 0; i < n; ++i) {
        for (let j = i + 1; j < n; ++j) {
            bfComparisons++;
            let d = dist(pts[i], pts[j]);
            if (d < min_dist) {
                min_dist = d;
                closest = [pts[i], pts[j]];
            }
        }
    }
    return { min_dist, closest };
}

// Strip optimization
async function stripClosest(strip, size, d, execId) {
    if (execId !== currentExecutionId) return { min_dist: d, closestPair: null }; // Abort

    let min_dist = d;
    let closestPair = null;

    // Sorting strip by Y coordinate
    strip.sort((a, b) => a.y - b.y);

    // Visualization: Show strip points
    clearCanvas(stripCanvas);
    strip.forEach(p => drawPoint(stripCanvas.getContext('2d'), p, '#FFC107'));
    document.getElementById('stripInfo').innerText = `Checking ${strip.length} points in strip...`;

    if (execId !== currentExecutionId) return { min_dist: d, closestPair: null };
    await sleep(delayMs / 2);

    for (let i = 0; i < size; ++i) {
        if (execId !== currentExecutionId) return { min_dist: d, closestPair: null };
        for (let j = i + 1; j < size && (strip[j].y - strip[i].y) < min_dist; ++j) {
            comparisons++;
            let d_curr = dist(strip[i], strip[j]);

            // Visualize check
            drawLine(stripCanvas.getContext('2d'), strip[i], strip[j], '#ccc', 1);

            if (d_curr < min_dist) {
                min_dist = d_curr;
                closestPair = [strip[i], strip[j]];

                // Highlight new min in strip
                drawLine(stripCanvas.getContext('2d'), strip[i], strip[j], '#fd7e14', 3);
            }
        }
    }

    if (closestPair) {
        if (execId !== currentExecutionId) return { min_dist: d, closestPair: null };
        await sleep(delayMs);
    }

    return { min_dist, closestPair };
}

async function closestUtil(pts, n, execId) {
    if (execId !== currentExecutionId) return { min_dist: Number.MAX_VALUE, closest: [] };

    // Visualization: Clear and redraw current set
    // Note: In a full recursive viz, we might want to keep the whole state, 
    // but for simplicity, we'll draw the current recursive subset active region

    if (n <= 3) {
        let res = bruteForce(pts, n);
        comparisons += bfComparisons; // Approximate for hybrid
        if (res.closest.length > 0) {
            drawLine(recCtx, res.closest[0], res.closest[1], '#17a2b8', 2);
        }
        return res;
    }

    let mid = Math.floor(n / 2);
    let midPoint = pts[mid];

    // Visualize split
    drawVerticalLine(recCtx, midPoint.x);
    document.getElementById('recInfo').innerText = `Splitting at X = ${midPoint.x.toFixed(1)}`;

    if (execId !== currentExecutionId) return { min_dist: Number.MAX_VALUE, closest: [] };
    await sleep(delayMs);

    let dl = await closestUtil(pts.slice(0, mid), mid, execId);
    let dr = await closestUtil(pts.slice(mid), n - mid, execId);

    let d_min = dl.min_dist;
    let closest_pair = dl.closest;

    if (dr.min_dist < d_min) {
        d_min = dr.min_dist;
        closest_pair = dr.closest;
    }

    // Visualize current best from halves
    if (closest_pair && closest_pair.length === 2) {
        // Redraw to clear previous temporary lines if needed, but here we just overlay
        // Implementation note: Ideally we'd redraw 'clean' state here
        drawLine(recCtx, closest_pair[0], closest_pair[1], '#28a745', 3);
    }

    let strip = [];
    for (let i = 0; i < n; i++) {
        if (Math.abs(pts[i].x - midPoint.x) < d_min) {
            strip.push(pts[i]);
        }
    }

    // Pass execId
    let stripRes = await stripClosest(strip, strip.length, d_min, execId);
    if (execId !== currentExecutionId) return { min_dist: Number.MAX_VALUE, closest: [] };

    if (stripRes && stripRes.min_dist < d_min) {
        return stripRes;
    } else {
        return { min_dist: d_min, closest: closest_pair };
    }
}

async function startVisualizationInternal() {
    // Generate new execution ID
    currentExecutionId++;
    let myExecId = currentExecutionId;

    // Reset Stats
    comparisons = 0;
    bfComparisons = 0;
    document.getElementById('divComp').innerText = '0';
    document.getElementById('bfComp').innerText = '0';
    document.getElementById('savedComp').innerText = '0';
    document.getElementById('timeTaken').innerText = '0 ms';
    document.getElementById('p1').innerText = '-';
    document.getElementById('p2').innerText = '-';
    document.getElementById('finalDist').innerText = '-';
    clearCanvas(recCanvas);
    clearCanvas(stripCanvas);

    // Get Points
    // Sort by X
    points.sort((a, b) => a.x - b.x);

    // Draw initial sorted state
    points.forEach(p => drawPoint(recCtx, p));

    let startTime = performance.now();

    // Start Algorithm
    let result = await closestUtil(points, points.length, myExecId);

    // Check if we were cancelled
    if (myExecId !== currentExecutionId) return;

    let endTime = performance.now();
    let totalTime = (endTime - startTime).toFixed(2);

    // Final Output
    if (result.closest && result.closest.length === 2) {
        // Highlight Final
        clearCanvas(recCanvas);
        points.forEach(p => drawPoint(recCtx, p, '#6c757d')); // dims
        drawPoint(recCtx, result.closest[0], '#28a745');
        drawPoint(recCtx, result.closest[1], '#28a745');
        drawLine(recCtx, result.closest[0], result.closest[1], '#28a745', 4);
    //final answer in integer
    
        document.getElementById('p1').innerText =
 `(${Math.round(result.closest[0].x)}, ${Math.round(result.closest[0].y)})`;

document.getElementById('p2').innerText =
 `(${Math.round(result.closest[1].x)}, ${Math.round(result.closest[1].y)})`;

document.getElementById('finalDist').innerText =
 Math.round(result.min_dist);

    }

    // Calculate generic BF comparisons for N
    let n = points.length;
    let theoreticalBF = (n * (n - 1)) / 2;

    document.getElementById('divComp').innerText = comparisons;
    document.getElementById('bfComp').innerText = theoreticalBF;
    document.getElementById('savedComp').innerText = (theoreticalBF - comparisons);
    document.getElementById('timeTaken').innerText = `${totalTime} ms`;
    document.getElementById('finalComp').innerText = comparisons;
    document.getElementById('finalTime').innerText = `${totalTime} ms`;
}

// --- Interaction ---

function generatePoints() {
    let nInput = document.getElementById("numPoints");
    let n = parseInt(nInput.value);

    // Canvas bounds
    const width = recCanvas.width / (window.devicePixelRatio || 1);
    const height = recCanvas.height / (window.devicePixelRatio || 1);
    const padding = 20;

    points = [];
    for (let i = 0; i < n; i++) {
        points.push(new Point(
            padding + Math.random() * (width - 2 * padding),
            padding + Math.random() * (height - 2 * padding)
        ));
    }

    // Format output: (x, y), (x, y)...
    const formattedPoints = points.map(p => `(${Math.round(p.x)}, ${Math.round(p.y)})`).join(', ');
    document.getElementById("generatedPoints").textContent = formattedPoints;
    // Show Start & Reset Buttons
    document.getElementById("startBtn").style.display = "block";
    document.getElementById("resetBtn").style.display = "block";


    // Draw initial state
    clearCanvas(recCanvas);
    setupCanvas(recCanvas);
    points.forEach(p => drawPoint(recCtx, p));

    // Show Start Button
    const startBtn = document.getElementById("startBtn");
    startBtn.style.display = "block";

    // Reset stats display
    document.getElementById('divComp').innerText = '0';
    document.getElementById('bfComp').innerText = '0';
    document.getElementById('savedComp').innerText = '0';
    document.getElementById('timeTaken').innerText = '0 ms';
    document.getElementById('p1').innerText = '-';
    document.getElementById('p2').innerText = '-';
    document.getElementById('finalDist').innerText = '-';
    clearCanvas(stripCanvas);
}

// Ensure startVisualization is exposed and checks for points
window.startVisualization = async function () {
    if (points.length < 2) {
        alert("Please generate at least 2 points first.");
        return;
    }
    await startVisualizationInternal();
};
//reset simulation
function resetSimulation() {
    window.location.reload();
}

// Make globally available
window.generatePoints = generatePoints;
