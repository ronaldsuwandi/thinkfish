const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());

// Apply required headers globally for all responses
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});


// Serve static frontend files
// app.use(express.static(path.join(__dirname, 'public/')));
app.use(express.static('public'));

// Dummy LLM API Endpoint
app.post('/api/explain-move', async (req, res) => {
    const { fen, move, bestMove, continuation } = req.body;

    if (!fen || !move || !bestMove) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }


    console.log("Received request:", { fen, move, bestMove });  // Log request

    // const systemPrompt = `
    //     You are a chess analyst at grand master level and consistently beat Stockfish.
    //     Your job is to explain the best move provided by Stockfish, explain the WHY behind it
    //     If user's provided move is DIFFERENT from the best move, also explain WHY the best move
    //     is better and if user's move is actually a good or bad move and make it VERY CLEAR that
    //     which is best move. For example:
    //
    //     "Black move xx is good/bad because it causes double pawn [further details].
    //     Whereas the move zz is better because [detailed reasons]"
    //
    //     User will provide the move in JSON format as follow (including current FEN state)
    //     {
    //         "fen": "[fen state]"
    //         "color": "[color]"
    //         "move": "[pgn move]"
    //         "bestMove": "[best move in UCI format]"
    //     }
    //
    //     The user will indicate which color does the user play and what is the current FEN state
    //
    //     Do note that bestMove input is in UCI format, always transform this into PGN format (a5c4 into Nc4 if knight was in a5)
    //
    //     Provide a JSON response structured as follows:
    //     {
    //         "explanation": "[Provide an explanation for the move]"
    //         "possibleContinuations" [
    //             {
    //                 "moves": [
    //                     {"move": "[PGN format]", "color": "white", "reason": "[Explain why]"},
    //                     {"move": "[PGN format for opponent]", "color": "black", "reason": "[Explain why]"},
    //                     ...
    //                 ]
    //             },
    //             {
    //                 "moves": [
    //                     {"move": "[PGN format]", "color": "white", "reason": "[Explain why]"},
    //                     {"move": "[PGN format for opponent]", "color": "black", "reason": "[Explain why]"},
    //                     ...
    //                 ]
    //             }
    //         ]
    //     }
    //
    //     Only give UP TO MAXIMUM 1 possible continuation from the best move. For EACH continuation go
    //     UP to 8 DEPTHS (8 moves)
    //
    //     VERY IMPORTANT
    //     Possible continuations AND explanations MUST BE VALID based on the
    //     given FEN position. When explaining pieces, make sure the pieces are
    //     referenced correctly based on the FEN position. For example:
    //     1. DO NOT mention knight on f8 when it is actually bishop on f8)
    //     2. DO NOT offer castling when FEN already indicated there is no castling right (one side or both)
    //     3. ALWAYS validate the explanation and possible continuations
    //     4. ALL explanation only use PGN. Do NOT USE UCI format
    // `.trim();


    const systemPrompt = `You are a grandmaster-level chess analyst. Your job is to explain the WHY the best move, as suggested by Stockfish, is superior.

INPUT
User will provide a JSON object:
{
    "color": "[white or black indicated by w or b]",
    "move": {
        "pgn": "[PGN move played]",
        "before_fen": "[FEN before move]",
        "after_fen": "[FEN after move]",
    }
    "bestMove": {
        "pgn": "[Best move in PGN]",
        "before_fen": "[FEN before move]",
        "after_fen": "[FEN after move]",
    }
    "continuation": [{
        "pgn": "Nc4",
        "before_fen": "[FEN before move]",
        "after_fen": "[FEN after move]",
    }, {
        "pgn": "Qf4",
        "before_fen": "[FEN before move]",
        "after_fen": "[FEN after move]",
    }, {
        "pgn": "d5",
        "before_fen": "[FEN before move]",
        "after_fen": "[FEN after move]",
    }],
}

OUTPUT
Your response must be valid JSON. Send it in plain text format without markdown

Only give UP TO MAXIMUM 8 moves from the possible continuation

{
    "explanation": "[Explain the move]",
    "continuations": [
        { "move": "Nc4", "color": "black", "reason": "Moves the knight to attack White's bishop and increase control over the center." },
        { "move": "Qf4", "color": "white", "reason": "White moves the queen to safety while maintaining pressure." }
        ... (MAXIMUM of 8 MOVES)        
    ]
}
`.trim();

    const userPrompt = JSON.stringify({
        fen,
        move: {
            pgn: move.san,
            before_fen: move.before,
            after_fen: move.after,
        },
        color: move.color,
        bestMove,
        continuation,
    });

    try {
        console.log('Sending request to OpenAI');
        const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            // model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            stream: true,
        });

        let responseChunks = [];
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
                responseChunks.push(text);
                process.stdout.write(text); // Debugging
            }
        }
        console.log("\n--- Streaming complete ---");

        // Combine all chunks into a single string and parse as JSON
        const fullResponse = responseChunks.join(""); // Ensure valid JSON
        const parsedJson = JSON.parse(fullResponse);

        return res.json(parsedJson); // Send clean JSON to frontend

    } catch (error) {
        console.error('Error fetching explanation:', error);
        return res.status(500).json({ error: 'Failed to generate explanation' });
    }
});




app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
