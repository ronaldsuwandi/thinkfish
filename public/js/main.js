import {Chess} from './chess-1.0.0.js';

const board = Chessboard2('board', {draggable: true, position: 'start'});
const game = new Chess();
const stockfish = new Worker('js/stockfish-16.1.js');
const evaler = new Worker('js/stockfish-16.1.js');

let moveIndex = 0;
let moves = [];
let fens = [];
let gameReviewMates = [];
let evalHistory = [];

const additionalContext = document.getElementById('additionalContext');

const toggleSwitch = document.getElementById("toggleModel");
const toggleLabel = document.getElementById("modelLabel");

const getModel = () => {
    return toggleSwitch.checked ? "gpt-4o" : "gpt-4o-mini";
}

document.addEventListener("DOMContentLoaded", function () {

    if (toggleSwitch.checked) {
        toggleLabel.textContent = "4o";
    } else {
        toggleLabel.textContent = "4o-mini";
    }

    toggleSwitch.addEventListener("change", function () {
        if (toggleSwitch.checked) {
            toggleLabel.textContent = "4o";
        } else {
            toggleLabel.textContent = "4o-mini";
        }
    });
});


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
const input = document.getElementById('pgnInput');

document.getElementById('loadPgn').addEventListener('click', loadPgn);
document.getElementById('pastePGN').addEventListener('click', async () => {
    input.value = await navigator.clipboard.readText();
    loadPgn();
})

function loadPgn() {
    const pgn = input.value;
    game.loadPgn(pgn);
    moves = game.history({verbose: true});
    moveIndex = 0;
    bestMoveSequence = [];
    fens = [];
    gameReviewMates = [];
    mate = 0;
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
        evaler.postMessage('go depth 2'); // to check for imminent mate
    }
    game.reset();

    console.log(positions.length);

    // FIXME highlight after eval are all done

    highlightActiveMove();

    evalChart.data.datasets[0].pointBorderColor = 'rgba(154,154,154)';
    evalChart.data.datasets[0].pointBackgroundColor = 'rgba(154,154,154)';

}


let gameReviewMateEntry;

evaler.onmessage = function (event) {
    if (event.data.includes("Final evaluation")) {
        const match = event.data.match(/Final evaluation\s+([+-]?\d+\.?\d*)/);
        const noneMatch = event.data.match(/Final evaluation:\s+none*/);
        console.log(event.data);
        let evalScore = 0.0;

        if (match) {
            evalScore = parseFloat(match[1]);
            evalScore = Math.max(-8, Math.min(8, evalScore));
        } else if (noneMatch) {
            // for check final eval returns none, use previous score if available
            if (evalHistory.length > 0) {
                evalScore = evalHistory[evalHistory.length - 1];
            }
        }

        evalHistory.push(evalScore);
        evalChart.data.labels.push(lastEval + 1);
        evalChart.data.datasets[0].data.push(evalScore);
        evalChart.update();
        lastEval++;
    }

    if (event.data.startsWith('info depth 2')) {
        let mateMatch = event.data.match('mate (-?\\d+)');
        let reviewMate = 0;
        if (mateMatch) {
            reviewMate = parseInt(mateMatch[1])
        } else {
            reviewMate = 0;
        }
        gameReviewMateEntry = reviewMate;
    }
    if (event.data.startsWith('bestmove')) {
        // go depth has completed, finalised it
        gameReviewMates.push(gameReviewMateEntry);
        gameReviewMateEntry = 0;
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
        `;

        if (i < moves.length -1) {
            tr.innerHTML += `<td class="move" data-index="${i + 1}">${moves[i + 1].san || ''}</td>`;
        }

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
    stockfish.postMessage('go depth 20');
}

let bestMoveUCI;

let bestMoveSequence = [];
let mate = 0;

stockfish.onmessage = function (event) {
    if (event.data.startsWith('info depth 20')) {
        bestMoveSequence = event.data.split(" pv ")[1].split(" ");
        let mateMatch = event.data.match('mate (-?\\d+)');
        if (mateMatch) {
            mate = parseInt(mateMatch[1])
        } else {
            mate = 0;
        }
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
const reviewButton = document.getElementById('overallReview');
const reviewWhiteButton = document.getElementById('whiteReview');
const reviewBlackButton = document.getElementById('blackReview');
const explanationBox = document.getElementById('explanation');

const llmButtons = [explainButton, reviewWhiteButton, reviewBlackButton, reviewButton];

explainButton.dataset.originalText = 'Explain';
reviewButton.dataset.originalText = 'Overall Review';
reviewWhiteButton.dataset.originalText = 'White Review';
reviewBlackButton.dataset.originalText = 'Black Review';

const explainCallback = async (reviewType) => {
    let reviewTypeText;
    if (reviewType === 'overall') {
        reviewTypeText = 'Overall';
    } else if (reviewType === 'white') {
        reviewTypeText = 'White';
    } else if (reviewType === 'black') {
        reviewTypeText = 'Black';
    }

    if (moves.length === 0) {
        alert('No moves to review');
        return;
    }

    // game review mates and fens will have extra item (at start)
    if (moves.length !== gameReviewMates.length-1) {
        alert('Stockfish has not fully evaluate the game');
        return;
    }

    try {
        // Show loading state
        enableLLMButtons(false);
        explanationBox.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Explaining...';

        const body = [];
        for (let i=0;i<moves.length;i++) {
            body.push({
                pgn: moves[i].san,
                before_fen: moves[i].before,
                after_fen: moves[i].after,
                evalScore: evalHistory[i+1],
                mate: gameReviewMates[i+1],
            })
        }


        const response = await fetchWithTimeout('/api/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reviewType,
                moves: body,
                model: getModel(),
                additionalContext: additionalContext.value,
            })
        }, 120000);

        console.dir(response)
        if (!response.ok) {
            throw new Error('Failed to get explanation');
        }

        const data = await response.json();
        let explanationHtml = `<strong>${reviewTypeText} Review:</strong><br>${data.explanation.replaceAll('\n', '<br>')}<br><br>`;

        explanationBox.innerHTML = explanationHtml;
    } catch (error) {
        console.error('Error fetching explanation:', error);
        enableLLMButtons(true);
        explanationBox.innerText = `Failed to get explanation`;
    } finally {
        enableLLMButtons(true);
    }
}

reviewButton.addEventListener('click', async (event) => {
    await explainCallback('overall');
});
reviewWhiteButton.addEventListener('click', async (event) => {
    await explainCallback('white');
});
reviewBlackButton.addEventListener('click', async (event) => {
    await explainCallback('black');
});

const enableLLMButtons = (enable) => {
    for (let btn of llmButtons) {
        btn.disabled = !enable;
        if (!enable) {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Explaining...';
        } else {
            btn.innerHTML = btn.dataset.originalText;
        }
    }
}

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
            bestMovesPgn.push({
                pgn: move.san,
                before_fen: move.before,
                after_fen: move.after,
            }); // Store PGN notation (SAN = Standard Algebraic Notation)
        } else {
            console.warn(`Invalid move: ${uciMove} in position: ${dummy.fen()}`);
            break;
        }
    }


    try {
        // Show loading state
        enableLLMButtons(false);
        explanationBox.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Explaining...';
        const response = await fetchWithTimeout('/api/explain-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: getModel(),
                fen,
                move,
                mate,
                bestMove: bestMovesPgn[0],
                continuation: bestMovesPgn,
                additionalContext: additionalContext.value,
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
        enableLLMButtons(true);
        explanationBox.innerText = `Failed to get explanation`;
    } finally {
        enableLLMButtons(true);
    }
});
