import {Chess} from './chess-1.0.0.js';

const board = Chessboard2('board', {draggable: true, position: 'start'});
const game = new Chess();
const stockfish = new Worker('js/stockfish-16.1.js');
const evaler = new Worker('js/stockfish-16.1.js');

let moveIndex = 0;
let moves = [];
let fens = [];
let latestScore = 0.0;
let evalHistory = [];

const ctx = document.getElementById('evalChart').getContext('2d');
const evalChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Evaluation',
            data: [],
            borderColor: 'rgb(194,194,194)',
            borderWidth: 2,
            backgroundColor: 'rgb(194,194,194)',
            fill: {
                target: 'origin',
                above: 'rgb(255, 255, 255)',   // Area will be red above the origin
                below: 'rgb(84,84,84)'    // And blue below the origin
            },
            pointRadius: 3,
            pointBackgroundColor: 'rgba(154,154,154)',
            pointBorderColor: 'rgba(154,154,154)',
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                min: -8, max: 8,
                grid: {
                    display: false,
                }
            },
            x: {
                grid: {
                    display: false,
                }
            }
        }
    }
});

document.getElementById('loadPgn').addEventListener('click', loadPgn);

function loadPgn() {
    const input = document.getElementById('pgnInput');
    const pgn = input.value;
    game.loadPgn(pgn);
    moves = game.history({verbose: true});
    moveIndex = 0;
    game.reset();
    board.position(game.fen());
    input.value = '';

    fens = [game.fen()];

    for (let move of moves) {
        game.move(move);
        fens.push(game.fen());
    }
    game.reset();


    renderMoveList();
    analyzeFullGameBatch();
}

let lastEval = 0;

function analyzeFullGameBatch() {
    game.reset();
    evalHistory = [];
    evalChart.data.labels = [];
    evalChart.data.datasets[0].data = [];

    let positions = [];
    positions.push(`position fen ${game.fen()}`);

    for (let i = 0; i < moves.length; i++) {
        let m = game.move(moves[i]);
        console.log(m);
        console.log(game.fen());
        positions.push(`position fen ${game.fen()}`);
    }


    // Start first evaluation
    for (let pos of positions) {
        evaler.postMessage(pos);
        evaler.postMessage('eval');
    }
    game.reset();

    // FIXME highlight after eval are all done

    highlightActiveMove();

    evalChart.data.datasets[0].pointBorderColor = 'rgba(154,154,154)';
    evalChart.data.datasets[0].pointBackgroundColor = 'rgba(154,154,154)';

}


evaler.onmessage = function (event) {
    if (event.data.includes("Final evaluation")) {
        const match = event.data.match(/Final evaluation\s+([+-]?\d+\.?\d*)/);
        console.log(event.data);
        if (match) {
            let evalScore = parseFloat(match[1]);
            evalScore = Math.max(-8, Math.min(8, evalScore));
            evalHistory.push(evalScore);
            evalChart.data.labels.push(lastEval + 1);
            evalChart.data.datasets[0].data.push(evalScore);
            evalChart.update();
            lastEval++;
        }
    }
};


document.getElementById('nextMove').addEventListener('click', () => {
    if (moveIndex < moves.length) {
        clearArrows();
        game.move(moves[moveIndex]);
        board.position(game.fen());
        moveIndex++;
        highlightMove();
    }
});

document.getElementById('prevMove').addEventListener('click', () => {
    if (moveIndex > 0) {
        clearArrows();
        game.undo();
        board.position(game.fen());
        moveIndex--;
        highlightMove();
    }
});

document.getElementById('firstMove').addEventListener('click', () => {
    clearArrows();
    game.reset();
    board.position(game.fen());
    moveIndex = 0;
    highlightMove();
});

document.getElementById('lastMove').addEventListener('click', () => {
    clearArrows();
    game.reset();
    moves.forEach(move => game.move(move));
    board.position(game.fen());
    moveIndex = moves.length;
    highlightMove();
});

function renderMoveList() {
    const tbody = document.getElementById('moves');
    tbody.innerHTML = '';
    for (let i = 0; i < moves.length; i += 2) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${Math.floor(i / 2) + 1}</td>
            <td class="move" data-index="${i}">${moves[i].san || ''}</td>
            <td class="move" data-index="${i + 1}">${moves[i + 1].san || ''}</td>
        `;
        tbody.appendChild(tr);
    }


    highlightMove();

    document.querySelectorAll('.move').forEach(cell => {
        cell.addEventListener('click', event => {
            moveIndex = parseInt(event.target.dataset.index) + 1;
            game.reset();
            for (let i = 0; i < moveIndex; i++) {
                game.move(moves[i]);
            }
            clearArrows();
            board.position(game.fen());
            highlightMove();
        });
    });
}

// Handle clicking on chart points to navigate moves
const chartCanvas = document.getElementById('evalChart');
chartCanvas.onclick = (event) => {
    const points = evalChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (points.length) {
        const index = points[0].index;
        moveIndex = index;
        game.reset();
        for (let i = 0; i < moveIndex; i++) {
            game.move(moves[i]);
        }
        board.position(game.fen());
        clearArrows();
        highlightMove();
        highlightActiveMove();
    }
};


function highlightMove() {
    const rows = document.querySelectorAll('#moves td');
    rows.forEach(row => row.classList.remove('highlight'));
    if (moveIndex > 0) {
        const row = Math.floor((moveIndex - 1) / 2);
        const highlightMove = row + moveIndex;
        rows[highlightMove].classList.add('highlight');
    }

    highlightActiveMove();
    analyzePosition();
}

function highlightActiveMove() {
    evalChart.data.datasets[0].pointBackgroundColor = evalChart.data.labels.map((_, index) =>
        index === moveIndex ? 'red' : 'rgb(154,154,154)'
    );
    evalChart.data.datasets[0].pointBorderColor = evalChart.data.labels.map((_, index) =>
        index === moveIndex ? 'red' : 'rgb(154,154,154)'
    );

    evalChart.update();
}

function analyzePosition() {
    stockfish.postMessage(`position fen ${game.fen()}`);
    stockfish.postMessage('go depth 15');
}

let bestMoveUCI;

let bestMoveSequence = [];

stockfish.onmessage = function (event) {
    if (event.data.startsWith('info depth 15')) {
        bestMoveSequence = event.data.split(" pv ")[1].split(" ");
    }
    if (event.data.startsWith('bestmove')) {
        bestMoveUCI = event.data.split(' ')[1];
        if (!bestMoveUCI || bestMoveUCI === '(none)') return;

        const from = bestMoveUCI.substring(0, 2);
        const to = bestMoveUCI.substring(2, 4);

        if (moveIndex < moves.length) {
           let nextMove = moves[moveIndex];
           if (nextMove.lan !== bestMoveUCI) {
               drawArrows(nextMove.from, nextMove.to, 'rgba(161,191,255, 0.58)');
           }
        }


        drawArrows(from, to, 'green');
        bestMoveSequence = bestMoveSequence.slice(0, 8);
    }
};

function drawArrows(from, to, color) {
    board.addArrow({start: from, end: to, color, size: 'small'});
}

function clearArrows() {
    board.clearArrows();
}

async function fetchWithTimeout(url, options, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Request timed out");
        }
        throw error;
    }
}

// Add loading indicator to the Explain button
const explainButton = document.getElementById('explainMove');
const explanationBox = document.getElementById('explanation');

explainButton.addEventListener('click', async () => {
    if (!bestMoveUCI || bestMoveUCI == '(none)') {
        alert('No move selected to explain.');
        return;
    }

    const fen = game.fen();
    const move = moves[moveIndex];

    // transform all bestMoveSequence into PGN

    let bestMovesPgn = []

    let dummy = new Chess(fen);

    for (let uciMove of bestMoveSequence) {
        const move = dummy.move({ from: uciMove.substring(0, 2), to: uciMove.substring(2, 4), promotion: "q" });
        if (move) {
            bestMovesPgn.push(move.san); // Store PGN notation (SAN = Standard Algebraic Notation)
        } else {
            console.warn(`Invalid move: ${uciMove} in position: ${dummy.fen()}`);
            break;
        }
    }




    try {

        // Show loading state
        explainButton.disabled = true;
        explainButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Explaining...';
        explanationBox.innerText = 'Analyzing move...';

        const response = await fetchWithTimeout('/api/explain-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fen,
                move,
                bestMove: bestMovesPgn[0],
                continuation: bestMovesPgn,
            })
        }, 45000);

        console.dir(response)
        if (!response.ok) {
            throw new Error('Failed to get explanation');
        }

        const data = await response.json();
        console.dir(data);

        // Render explanation
        let explanationHtml = `<strong>Move Explanation:</strong><br>${data.explanation}<br><br>`;

        // Render possible continuations
        if (data.continuations && data.continuations.length > 0) {
            explanationHtml += `<strong>Possible Continuations:</strong><ul>`;
            data.continuations.forEach((continuation) => {
                    explanationHtml += `<li><strong>${continuation.color} ${continuation.move}:</strong> ${continuation.reason}</li>`;
            });
            explanationHtml += `</ul>`;
        }

        explanationBox.innerHTML = explanationHtml;
    } catch (error) {
        console.error('Error fetching explanation:', error);
        explainButton.disabled = false;
        explainButton.innerText = 'Explain';
        explanationBox.innerText = `Failed to get explanation`;
    } finally {
        explainButton.disabled = false;
        explainButton.innerText = 'Explain';
    }
});
