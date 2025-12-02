require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

// Import hotel groups data
const { hotelGroups } = require('./brandsData.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for local network testing
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Test endpoint for AI
// Test endpoint for AI
app.get('/test-ai', async (req, res) => {
    try {
        console.log('🧪 Testing AI with API key:', process.env.GEMINI_API_KEY ? 'Key present (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'NO KEY FOUND');
        const questions = await fetchAIQuestions();
        res.json({ success: true, questionCount: questions.length, sample: questions[0] });
    } catch (error) {
        res.json({ success: false, error: error.message, stack: error.stack });
    }
});

// In-memory storage
const games = {}; // { roomCode: { hostId, players, gameState, questions, currentQuestionIndex, answers } }
const globalScores = []; // Legacy
const dailySoloScores = [];
const soloScores = [];
const multiplayerGames = []; // Array of game sessions with metadata

// Admin password
const ADMIN_PASSWORD = '12345';

// Brand names for highlighting
const BRANDS = [
    'Marriott', 'JW Marriott', 'The Ritz-Carlton', 'St. Regis', 'W Hotels', 'EDITION',
    'The Luxury Collection', 'Sheraton', 'Westin', 'Le Méridien', 'Renaissance',
    'Gaylord Hotels', 'Delta Hotels', 'Marriott Executive Apartments',
    'Marriott Vacation Club', 'Autograph Collection', 'Tribute Portfolio',
    'Design Hotels', 'Courtyard', 'Four Points', 'SpringHill Suites',
    'Fairfield Inn & Suites', 'AC Hotels', 'Aloft', 'Moxy', 'Residence Inn',
    'TownePlace Suites', 'Element', 'Homes & Villas by Marriott International',
    'Ritz-Carlton Reserve', 'Bulgari', 'Ritz-Carlton Yacht Collection',
    'Hilton', 'Hyatt', 'IHG', 'Best Western', 'Wyndham', 'Radisson', 'Accor',
    'Sofitel', 'Novotel', 'Ibis', 'Crowne Plaza', 'Holiday Inn'
];

// Helper function to highlight brand names
function highlightBrands(text) {
    let highlightedText = text;
    const sortedBrands = [...BRANDS].sort((a, b) => b.length - a.length);

    sortedBrands.forEach(brand => {
        const regex = new RegExp(`\\b(${brand})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, '**$1**');
    });

    return highlightedText;
}

// Helper: Find which group a brand belongs to
function findBrandGroup(brandName) {
    if (!brandName) return null;
    const normalizedBrand = brandName.toLowerCase().trim();

    for (const [groupKey, groupData] of Object.entries(hotelGroups)) {
        // Check exact brand match
        if (groupData.brands.some(b => b.toLowerCase() === normalizedBrand)) {
            return groupKey;
        }
        // Check partial match (e.g. "Ritz-Carlton" matching "The Ritz-Carlton")
        if (groupData.brands.some(b => b.toLowerCase().includes(normalizedBrand) || normalizedBrand.includes(b.toLowerCase()))) {
            return groupKey;
        }
    }
    return null;
}

// Helper: Validate AI Question
function validateQuestion(question, selectedGroupIds) {
    const { text, options, correctAnswer, correctAnswers, type } = question;

    // Skip validation for multi-select questions (too complex to validate generically)
    if (type === 'multi-select') {
        // Basic validation: check that all correctAnswers indices are valid
        if (!Array.isArray(correctAnswers) || correctAnswers.length === 0) {
            return { valid: false, reason: "Multi-select question missing correctAnswers array" };
        }
        if (correctAnswers.some(idx => idx < 0 || idx >= options.length)) {
            return { valid: false, reason: "Multi-select question has invalid correctAnswers indices" };
        }
        return { valid: true, reason: "Multi-select validation passed" };
    }

    // Standard single-answer validation
    const correctOption = options[correctAnswer];

    if (!correctOption) return { valid: false, reason: "Invalid correct answer index" };

    // Determine target group from question text
    // Look for group names in the question text
    let targetGroup = null;
    for (const groupId of selectedGroupIds) {
        const groupName = hotelGroups[groupId].name;
        if (text.includes(groupName) || text.includes(groupName.split(' ')[0])) { // Match "Marriott" in "Marriott International"
            targetGroup = groupId;
            break;
        }
    }

    if (!targetGroup) {
        // If we can't identify the target group in the text, we can't validate strictly.
        // But for Single Group mode, we know the target group is the only selected one.
        if (selectedGroupIds.length === 1) {
            targetGroup = selectedGroupIds[0];
        } else {
            return { valid: true, reason: "Skipped validation (multi-group)" };
        }
    }

    const correctOptionGroup = findBrandGroup(correctOption);

    // Case 1: "Which is NOT a [Group] brand?"
    if (text.toUpperCase().includes("NOT")) {
        // The correct answer MUST NOT belong to the target group
        if (correctOptionGroup === targetGroup) {
            return { valid: false, reason: `Logic Error: Question asks for NOT ${targetGroup}, but answer ${correctOption} IS ${targetGroup}` };
        }

        // OPTIONAL: Verify distractors DO belong to target group (to ensure there's only 1 correct answer)
        // This might be too strict if AI uses "None of the above", but let's try.
        let validDistractors = 0;
        options.forEach((opt, idx) => {
            if (idx !== correctAnswer) {
                const g = findBrandGroup(opt);
                if (g === targetGroup) validDistractors++;
            }
        });

        if (validDistractors < 2) { // At least most distractors should be from the target group
            // Warning only, don't fail? Or fail? Let's be strict for now.
            // Actually, if distractors are not from target group, then there are multiple correct answers!
            // So we MUST fail if any distractor is ALSO not from target group.
            const invalidDistractors = options.filter((opt, idx) => idx !== correctAnswer && findBrandGroup(opt) !== targetGroup);
            if (invalidDistractors.length > 0) {
                return { valid: false, reason: `Ambiguous: Multiple options are NOT ${targetGroup}: ${invalidDistractors.join(', ')}` };
            }
        }
    }
    // Case 2: "Which IS a [Group] brand?" or "Is X part of [Group]?" (Positive)
    else {
        // The correct answer MUST belong to the target group
        if (correctOptionGroup !== targetGroup) {
            // Special case for Yes/No questions
            if (options.includes("Yes") && options.includes("No")) {
                // For Yes/No, we need to parse the brand from the question
                // "Is Waldorf Astoria part of Marriott?" -> Answer should be No.
                // This is hard to validate generically without NLP.
                // Let's skip Yes/No validation for now or assume AI is mostly right on simple facts.
                return { valid: true, reason: "Skipped validation (Yes/No)" };
            }

            return { valid: false, reason: `Logic Error: Question asks for ${targetGroup}, but answer ${correctOption} is ${correctOptionGroup || 'Unknown'}` };
        }

        // Verify distractors do NOT belong to target group (to ensure unique answer)
        const ambiguousDistractors = options.filter((opt, idx) => idx !== correctAnswer && findBrandGroup(opt) === targetGroup);
        if (ambiguousDistractors.length > 0) {
            return { valid: false, reason: `Ambiguous: Multiple options ARE ${targetGroup}: ${ambiguousDistractors.join(', ')}` };
        }
    }

    return { valid: true };
}

// AI-powered question generation using direct API call
// Helper function to shuffle options and update correct answer indices
function shuffleOptions(question) {
    const indices = question.options.map((_, i) => i);
    const shuffledIndices = indices.sort(() => Math.random() - 0.5);

    const shuffledOptions = shuffledIndices.map(i => question.options[i]);

    if (question.type === 'multi-select') {
        const newCorrectAnswers = question.correctAnswers.map(oldIdx =>
            shuffledIndices.indexOf(oldIdx)
        );
        return {
            ...question,
            options: shuffledOptions,
            correctAnswers: newCorrectAnswers
        };
    } else {
        const newCorrectAnswer = shuffledIndices.indexOf(question.correctAnswer);
        return {
            ...question,
            options: shuffledOptions,
            correctAnswer: newCorrectAnswer
        };
    }
}

async function fetchAIQuestions(count = 10, selectedGroupIds = ['MARRIOTT']) {
    // Filter hotel groups based on selection
    const filteredGroups = {};
    selectedGroupIds.forEach(id => {
        if (hotelGroups[id]) {
            filteredGroups[id] = hotelGroups[id];
        }
    });

    // If no valid groups selected, default to MARRIOTT
    if (Object.keys(filteredGroups).length === 0) {
        filteredGroups.MARRIOTT = hotelGroups.MARRIOTT;
    }

    // Context: Provide ALL groups to ensure accuracy (prevent hallucinations)
    const allGroupsJSON = JSON.stringify(hotelGroups, null, 2);
    const selectedGroupName = hotelGroups[selectedGroupIds[0]].name;
    const isSingleGroup = selectedGroupIds.length === 1;

    let promptInstructions = "";

    if (isSingleGroup) {
        promptInstructions = `
**MODE: SINGLE GROUP TRAINING (${selectedGroupName})**
You must generate questions specifically to test knowledge of **${selectedGroupName}** against its competitors.

**FORBIDDEN QUESTION TYPES:**
- DO NOT ask "Which hotel group owns [Brand]?" if the answer is ${selectedGroupName}. (This is too easy).

**REQUIRED QUESTION TYPES:**
1. **Find the Brand:** "Which of these is a ${selectedGroupName} brand?" (Options: 1 Correct Brand, 3 Competitor Brands).
2. **Find the Imposter:** "Which of these is NOT a ${selectedGroupName} brand?" (Options: 3 Correct Brands, 1 Competitor Brand).
3. **True/False:** "Is [Competitor Brand] part of ${selectedGroupName}?" (Correct Answer: No).
4. **True/False:** "Is [Correct Brand] part of ${selectedGroupName}?" (Correct Answer: Yes).

**SMART DISTRACTORS:**
- When choosing distractors, match the **tier/category** of the correct answer.
- Example: If the correct answer is a Luxury brand (e.g., Ritz-Carlton), distractors MUST be Luxury brands from other groups (e.g., Waldorf Astoria, Park Hyatt, Sofitel). DO NOT use budget brands as distractors for luxury questions.
`;
    } else {
        promptInstructions = `
**MODE: MULTI-GROUP COMPARISON**
You must generate questions to compare and contrast the selected groups.

**QUESTION TYPES:**
1. **Ownership:** "Which hotel group owns [Brand]?"
2. **Comparison:** "Which of these brands belongs to [Group]?"
3. **True/False:** "Is [Brand] part of [Group]?"

**SMART DISTRACTORS:**
- Always include distractors from the other selected groups first, then other major groups if needed.
`;
    }

    const systemPrompt = `You are an expert Hotel Consultant.
    
**FULL DATA CONTEXT (Reference Source):**
${allGroupsJSON}

**INSTRUCTIONS:**
The user is training on: **${selectedGroupIds.join(', ')}**.
${promptInstructions}

**CRITICAL RULES:**
1. Generate ${Math.ceil(count * 1.5)} unique questions (we'll filter the best ones).
2. **IMPORTANT: Include 1-2 MULTI-SELECT questions in the quiz.**
3. Use the **FULL DATA CONTEXT** to verify facts. Do not hallucinate relationships.
4. **For standard questions**: Provide exactly 4 options.
5. **For multi-select questions**: Provide 6-8 options with multiple correct answers.

**MULTI-SELECT QUESTION FORMAT:**
- Type: "Select all brands belonging to [Group]"
- Must include "type": "multi-select" in the JSON
- Must include "correctAnswers": [0, 2, 4, 5] (array of all correct indices)
- Must include "timeLimit": 20 (20 seconds instead of 12)
- Options should be a mix of correct brands from the target group and competitor brands
- Example:
{
  "id": 1,
  "type": "multi-select",
  "text": "Select all brands belonging to Marriott International",
  "options": ["Westin", "Waldorf Astoria", "Sheraton", "Conrad", "Courtyard", "Hyatt Place", "AC Hotels", "InterContinental"],
  "correctAnswers": [0, 2, 4, 6],
  "timeLimit": 25,
  "explanation": "Westin, Sheraton, Courtyard, and AC Hotels are Marriott brands."
}

**OUTPUT FORMAT:**
Strict JSON Array. No Markdown.
Standard question structure: [{ "id": 1, "text": "Question?", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "explanation": "Short fact." }]
Multi-select structure: [{ "id": 2, "type": "multi-select", "text": "Select all...", "options": [...], "correctAnswers": [0, 2], "timeLimit": 25, "explanation": "..." }]`;

    try {
        console.log('🤖 Calling Gemini AI via REST API...');

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: systemPrompt
                        }]
                    }]
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error Status: ${response.status}`);
            console.error(`❌ API Error Body: ${errorText}`);
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        console.log('📝 Raw AI Response:', text.substring(0, 200) + '...');

        // Parse JSON response
        const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const questions = JSON.parse(cleanedText);

        console.log(`✅ Parsed ${questions.length} questions from AI`);

        // Transform to match server format
        const validQuestions = [];

        for (const q of questions) {
            // Check if this is a multi-select question
            const isMultiSelect = q.type === 'multi-select';

            // Clean options (remove "A. ", "B. ", etc. prefixes if present)
            const cleanedOptions = q.options.map(opt => {
                if (typeof opt === 'string') {
                    // Remove patterns like "A. ", "B) ", "1. ", etc.
                    return opt.replace(/^[A-D][\\.\\)]\\s*/i, '').trim();
                }
                return opt;
            });

            let questionObj;

            if (isMultiSelect) {
                // Multi-select question: has correctAnswers array
                if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
                    console.warn(`⚠️ Skipping multi-select question: Missing or empty correctAnswers array`);
                    continue;
                }

                questionObj = {
                    type: 'multi-select',
                    text: highlightBrands(q.text),
                    options: cleanedOptions,
                    correctAnswers: q.correctAnswers, // Array of indices
                    timeLimit: q.timeLimit || 20
                };
            } else {
                // Standard single-answer question
                let correctAnswerIndex;
                if (typeof q.correctAnswer === 'number') {
                    correctAnswerIndex = q.correctAnswer;
                } else if (typeof q.correctAnswer === 'string') {
                    // Check if it's a letter (A, B, C, D)
                    const letterMatch = q.correctAnswer.trim().toUpperCase();
                    if (letterMatch === 'A') correctAnswerIndex = 0;
                    else if (letterMatch === 'B') correctAnswerIndex = 1;
                    else if (letterMatch === 'C') correctAnswerIndex = 2;
                    else if (letterMatch === 'D') correctAnswerIndex = 3;
                    else {
                        // Try exact match first
                        correctAnswerIndex = q.options.indexOf(q.correctAnswer);

                        // If not found, try trimmed and case-insensitive match
                        if (correctAnswerIndex === -1) {
                            correctAnswerIndex = q.options.findIndex(opt =>
                                opt.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
                            );
                        }

                        // If still not found, SKIP the question (Safety First)
                        if (correctAnswerIndex === -1) {
                            console.warn(`⚠️ Skipping question: Could not find correct answer "${q.correctAnswer}" in options: ${JSON.stringify(q.options)}`);
                            continue;
                        }
                    }
                }

                questionObj = {
                    text: highlightBrands(q.text),
                    options: cleanedOptions,
                    correctAnswer: correctAnswerIndex,
                    timeLimit: q.timeLimit || 12
                };
            }

            // Validate the question logic
            const validation = validateQuestion(questionObj, selectedGroupIds);
            if (!validation.valid) {
                console.warn(`❌ Validation Failed: ${validation.reason}`);
                console.warn(`   Question: ${q.text}`);
                if (questionObj.type === 'multi-select') {
                    console.warn(`   Correct Answers: ${questionObj.correctAnswers.map(idx => q.options[idx]).join(', ')}`);
                } else {
                    console.warn(`   Answer: ${q.options[questionObj.correctAnswer]}`);
                }
                continue; // Skip invalid question
            }

            validQuestions.push(questionObj);
        }

        console.log(`✅ ${validQuestions.length} valid questions ready (filtered from ${questions.length})`);

        // If we filtered too many, we might need to fallback or just return what we have
        if (validQuestions.length === 0) {
            throw new Error("All AI questions failed validation.");
        }

        // Take only the requested count (in case we got more)
        const finalQuestions = validQuestions.slice(0, count);

        // Shuffle options for each question to randomize correct answer positions
        const shuffledQuestions = finalQuestions.map(q => shuffleOptions(q));

        return shuffledQuestions;
    } catch (error) {
        console.error('❌ AI Question Generation Error:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Fallback: Generate questions
function generateQuestions(count = 10) {
    const allQuestions = [
        { text: "Which brand is Marriott's flagship luxury brand?", options: ["JW Marriott", "Ritz-Carlton", "St. Regis", "W Hotels"], correctAnswer: 1 },
        { text: "Is Bulgari part of the Marriott portfolio?", options: ["Yes", "No"], correctAnswer: 0 },
        { text: "Which brand offers yacht experiences?", options: ["W Hotels", "Ritz-Carlton", "EDITION", "St. Regis"], correctAnswer: 1 },
        { text: "Which brand is known for its wellness focus?", options: ["Sheraton", "Westin", "Renaissance", "Le Méridien"], correctAnswer: 1 },
        { text: "Is Autograph Collection a soft brand?", options: ["Yes", "No"], correctAnswer: 0 },
        { text: "Which brand targets creative travelers?", options: ["Renaissance", "Le Méridien", "Sheraton", "Delta Hotels"], correctAnswer: 0 },
        { text: "Which brand is designed for extended stays?", options: ["Courtyard", "Residence Inn", "Fairfield Inn", "SpringHill Suites"], correctAnswer: 1 },
        { text: "Is Moxy a budget-friendly brand?", options: ["Yes", "No"], correctAnswer: 0 },
        { text: "Which brand focuses on eco-conscious travelers?", options: ["Element", "Aloft", "AC Hotels", "Four Points"], correctAnswer: 0 },
        { text: "Which brand offers vacation ownership?", options: ["Residence Inn", "Marriott Vacation Club", "TownePlace Suites", "Element"], correctAnswer: 1 },
        { text: "Does Homes & Villas offer private home rentals?", options: ["Yes", "No"], correctAnswer: 0 },
        { text: "Is Hilton part of Marriott?", options: ["Yes", "No"], correctAnswer: 1 },
        { text: "Which of these is NOT a Marriott brand?", options: ["Westin", "Sofitel", "Sheraton", "Courtyard"], correctAnswer: 1 },
        { text: "Is Crowne Plaza a Marriott brand?", options: ["Yes", "No"], correctAnswer: 1 },
        { text: "Which is a competitor brand?", options: ["Aloft", "Best Western", "Moxy", "AC Hotels"], correctAnswer: 1 },
        // Multi-select fallback questions
        {
            type: "multi-select",
            text: "Select all **Luxury** brands from Marriott:",
            options: ["Ritz-Carlton", "Courtyard", "St. Regis", "Moxy", "JW Marriott", "Aloft"],
            correctAnswers: [0, 2, 4],
            timeLimit: 20
        },
        {
            type: "multi-select",
            text: "Select all brands that are **NOT** part of Marriott:",
            options: ["Westin", "Hilton", "Sheraton", "Hyatt", "Renaissance", "InterContinental"],
            correctAnswers: [1, 3, 5],
            timeLimit: 20
        }
    ];

    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    return selected.map(q => {
        const withHighlight = {
            ...q,
            text: highlightBrands(q.text),
            timeLimit: q.timeLimit || 12
        };
        // Shuffle options for randomization
        return shuffleOptions(withHighlight);
    });
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Admin login
    socket.on('admin_login', ({ password }, callback) => {
        if (password === ADMIN_PASSWORD) {
            callback({ success: true });
        } else {
            callback({ success: false, error: 'Invalid password' });
        }
    });

    // Admin delete score
    socket.on('admin_delete_score', ({ leaderboardType, index }) => {
        if (leaderboardType === 'solo') {
            soloScores.splice(index, 1);
        } else if (leaderboardType === 'multiplayer') {
            multiplayerScores.splice(index, 1);
        } else if (leaderboardType === 'daily') {
            dailySoloScores.splice(index, 1);
        }
    });

    // Admin clear leaderboard
    socket.on('admin_clear_leaderboard', ({ leaderboardType }) => {
        if (leaderboardType === 'solo') {
            soloScores.length = 0;
        } else if (leaderboardType === 'multiplayer') {
            multiplayerGames.length = 0;
            console.log('🗑️ Cleared multiplayer game history');
        } else if (leaderboardType === 'daily') {
            dailySoloScores.length = 0;
        }
    });

    // Submit solo score
    socket.on('submit_solo_score', ({ nickname, score, avatar }, callback) => {
        console.log(`Solo score submitted: ${nickname} - ${score} - ${avatar}`);

        const scoreEntry = {
            nickname,
            score,
            avatar: avatar || '👤',
            date: new Date()
        };

        dailySoloScores.push(scoreEntry);
        soloScores.push(scoreEntry);

        callback({ success: true });
    });

    // Get solo leaderboard
    socket.on('get_solo_leaderboard', (callback) => {
        const top10 = [...soloScores].sort((a, b) => b.score - a.score).slice(0, 10);
        callback(top10);
    });

    // Get multiplayer leaderboard (returns game sessions)
    socket.on('get_multiplayer_leaderboard', (callback) => {
        callback(multiplayerGames);
    });

    // Get global leaderboard (legacy - returns solo)
    socket.on('get_global_leaderboard', (callback) => {
        const top10 = [...soloScores].sort((a, b) => b.score - a.score).slice(0, 10);
        callback(top10);
    });

    // Get daily leaderboard
    socket.on('get_daily_leaderboard', (callback) => {
        const today = new Date().toDateString();
        const todaysScores = dailySoloScores
            .filter(s => new Date(s.date).toDateString() === today)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        callback(todaysScores);
    });

    // Create room
    socket.on('create_room', (dataOrCallback, maybeCallback) => {
        let nickname, avatar, callback;

        if (typeof dataOrCallback === 'function') {
            callback = dataOrCallback;
        } else {
            nickname = dataOrCallback?.nickname;
            avatar = dataOrCallback?.avatar;
            callback = maybeCallback;
        }

        const roomCode = generateRoomCode();
        games[roomCode] = {
            hostId: socket.id,
            players: [],
            gameState: 'LOBBY',
            questions: [],
            currentQuestionIndex: -1,
            answers: {}
        };

        if (nickname) {
            games[roomCode].players.push({
                id: socket.id,
                nickname,
                avatar: avatar || '👤',
                score: 0,
                streak: 0,
                isHost: true
            });
        }

        socket.join(roomCode);
        callback({ roomCode });
        console.log(`Room created: ${roomCode} by ${socket.id}${nickname ? ` (${nickname})` : ''}`);
    });

    // Join room
    socket.on('join_room', ({ roomCode, nickname, avatar }, callback) => {
        console.log(`🎮 Join attempt - Room: ${roomCode}, Nickname: ${nickname}, Avatar: ${avatar}`);

        const room = games[roomCode];
        if (!room) {
            console.log(`❌ Room ${roomCode} not found. Available rooms:`, Object.keys(games));
            return callback({ success: false, error: "Room not found. Please check the code." });
        }
        if (room.gameState !== 'LOBBY') {
            console.log(`❌ Room ${roomCode} already started (state: ${room.gameState})`);
            return callback({ success: false, error: "Game already started" });
        }

        const existingPlayer = room.players.find(p => p.nickname === nickname);
        if (existingPlayer) {
            console.log(`❌ Nickname ${nickname} already taken in room ${roomCode}`);
            return callback({ success: false, error: "Nickname already taken" });
        }

        const player = {
            id: socket.id,
            nickname,
            avatar: avatar || '👤',
            score: 0,
            streak: 0
        };
        room.players.push(player);
        socket.join(roomCode);

        // Notify host
        io.to(room.hostId).emit('player_joined', player);

        // Send lobby update to all players in the room
        io.to(roomCode).emit('lobby_update', {
            players: room.players.map(p => ({
                nickname: p.nickname,
                avatar: p.avatar,
                isHost: p.id === room.hostId
            }))
        });

        callback({ success: true });
        console.log(`✅ ${nickname} joined room ${roomCode} with avatar ${avatar}`);
    });

    // Start game
    socket.on('start_game', async ({ roomCode, selectedGroups, questionCount: requestedCount }) => {
        const room = games[roomCode];
        if (!room || room.hostId !== socket.id) return;

        // For Solo Mode: if no players, add host as player
        if (room.players.length === 0) {
            room.players.push({
                id: socket.id,
                nickname: 'SoloPlayer',
                avatar: '👤',
                score: 0,
                streak: 0
            });
        }

        // Determine question count: Use requested count or default (15 for Solo, 20 for Multiplayer)
        // Cap at 25 as requested
        let questionCount = requestedCount || (room.players.length === 1 ? 15 : 20);
        if (questionCount > 25) questionCount = 25;
        if (questionCount < 1) questionCount = 5; // Minimum 5 questions

        // Default to MARRIOTT if no groups selected
        const groupsToUse = (selectedGroups && selectedGroups.length > 0) ? selectedGroups : ['MARRIOTT'];

        // Try to fetch AI-generated questions, fallback to static questions
        try {
            console.log('🎮 Starting game in room:', roomCode);
            console.log('👥 Players:', room.players.length);
            console.log('🏨 Selected Groups:', groupsToUse.join(', '));
            console.log(`🤖 Requesting ${questionCount} questions from AI...`);
            room.questions = await fetchAIQuestions(questionCount, groupsToUse);
            console.log('✨ Using AI-generated questions');
        } catch (error) {
            console.warn('⚠️  AI generation failed, using fallback questions');
            console.warn('Error:', error.message);
            room.questions = generateQuestions(questionCount);
        }

        room.gameState = 'QUESTION';
        room.currentQuestionIndex = 0;

        const question = room.questions[0];
        io.to(roomCode).emit('game_started');
        io.to(roomCode).emit('new_question', {
            question: {
                text: question.text,
                options: question.options,
                timeLimit: question.timeLimit,
                type: question.type, // Include type for client UI
                index: 0,
                total: room.questions.length
            }
        });

        room.currentQuestionStartTime = Date.now();
    });

    // Submit answer
    socket.on('submit_answer', ({ roomCode, answer }) => {
        const room = games[roomCode];
        if (!room || room.gameState !== 'QUESTION') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.answers[socket.id]) return;

        const timeTaken = (Date.now() - room.currentQuestionStartTime) / 1000;
        room.answers[socket.id] = { answer, timeTaken };

        io.to(room.hostId).emit('player_answered', { playerId: socket.id });

        // Auto-trigger time_up if all players answered
        if (Object.keys(room.answers).length === room.players.length) {
            console.log(`All players answered for room ${roomCode}`);
            setTimeout(() => {
                if (room.gameState === 'QUESTION') {
                    processTimeUp(room, roomCode);
                }
            }, 500);
        }
    });

    // Time up handler
    socket.on('time_up', ({ roomCode }) => {
        const room = games[roomCode];
        if (!room || room.hostId !== socket.id) return;

        processTimeUp(room, roomCode);
    });

    // Helper function to process time_up
    function processTimeUp(room, roomCode) {
        if (room.gameState !== 'QUESTION') return;

        room.gameState = 'LEADERBOARD';
        console.log(`Time up for room ${roomCode}, question ${room.currentQuestionIndex + 1}`);

        const currentQuestion = room.questions[room.currentQuestionIndex];
        const isMultiSelect = currentQuestion.type === 'multi-select';

        // Calculate scores and send results
        room.players.forEach(player => {
            const playerAnswer = room.answers[player.id];
            let pointsEarned = 0;
            let isCorrect = false;
            let correctCount = 0;
            let totalCorrect = 0;

            if (isMultiSelect) {
                // Multi-select scoring: 1 point per correct selection
                const correctAnswers = currentQuestion.correctAnswers;
                const selectedAnswers = playerAnswer?.answer || [];

                totalCorrect = correctAnswers.length;

                if (Array.isArray(selectedAnswers)) {
                    // Count how many correct answers were selected
                    correctAnswers.forEach(correctIdx => {
                        if (selectedAnswers.includes(correctIdx)) {
                            correctCount++;
                        }
                    });

                    // Deduct points for wrong selections
                    selectedAnswers.forEach(selectedIdx => {
                        if (!correctAnswers.includes(selectedIdx)) {
                            correctCount--; // Penalty for wrong selection
                        }
                    });

                    // Award points (minimum 0)
                    pointsEarned = Math.max(0, correctCount);
                    player.score += pointsEarned;

                    // Full correct = streak continues, otherwise reset
                    if (correctCount === totalCorrect && selectedAnswers.length === totalCorrect) {
                        player.streak += 1;
                        isCorrect = true;
                    } else {
                        player.streak = 0;
                    }
                }
            } else {
                // Standard single-answer scoring
                const correctAnswer = currentQuestion.correctAnswer;

                if (playerAnswer && playerAnswer.answer === correctAnswer) {
                    const basePoints = 10;
                    const streakBonus = player.streak * 5;
                    pointsEarned = basePoints + streakBonus;
                    player.score += pointsEarned;
                    player.streak += 1;
                    isCorrect = true;
                } else {
                    player.streak = 0;
                }
            }

            player.lastRoundPoints = pointsEarned; // Store points earned this round

            // Emit individual result to the player
            if (isMultiSelect) {
                io.to(player.id).emit('question_result', {
                    correct: isCorrect,
                    points: pointsEarned,
                    score: player.score,
                    streak: player.streak,
                    correctAnswers: currentQuestion.correctAnswers,
                    correctCount: correctCount,
                    totalCorrect: totalCorrect,
                    type: 'multi-select'
                });
            } else {
                io.to(player.id).emit('question_result', {
                    correct: isCorrect,
                    points: pointsEarned,
                    score: player.score,
                    streak: player.streak,
                    correctAnswer: currentQuestion.options[currentQuestion.correctAnswer]
                });
            }
        });

        // Send leaderboard update to everyone
        const leaderboard = room.players
            .sort((a, b) => b.score - a.score)
            .map(p => ({
                id: p.id,
                nickname: p.nickname,
                avatar: p.avatar,
                score: p.score,
                lastRoundPoints: p.lastRoundPoints
            }));

        let correctAnswerText = "";
        let correctAnswersIndices = [];

        if (currentQuestion.type === 'multi-select') {
            correctAnswerText = currentQuestion.correctAnswers.map(idx => currentQuestion.options[idx]).join(', ');
            correctAnswersIndices = currentQuestion.correctAnswers;
        } else {
            correctAnswerText = currentQuestion.options[currentQuestion.correctAnswer];
        }

        io.to(roomCode).emit('question_ended', {
            leaderboard,
            correctAnswerText,
            correctAnswers: correctAnswersIndices, // Send indices for multi-select UI
            type: currentQuestion.type
        });
    }

    // Next question
    socket.on('next_question', ({ roomCode }) => {
        const room = games[roomCode];
        if (!room) return;

        const isSoloMode = room.players.length === 1 && room.players[0].id === room.hostId;
        if (room.hostId !== socket.id && !isSoloMode) return;

        room.currentQuestionIndex += 1;
        room.answers = {};

        if (room.currentQuestionIndex >= room.questions.length) {
            const finalLeaderboard = [...room.players].sort((a, b) => b.score - a.score);
            io.to(roomCode).emit('game_over', { leaderboard: finalLeaderboard });

            if (room.players.length > 1) {
                // Save the entire game session
                const gameSession = {
                    id: `game_${Date.now()}`,
                    date: new Date(),
                    players: finalLeaderboard.map(p => ({
                        nickname: p.nickname,
                        score: p.score,
                        avatar: p.avatar || '👤'
                    })),
                    winner: finalLeaderboard[0].nickname,
                    questionCount: room.questions.length
                };
                multiplayerGames.push(gameSession);
                console.log(`📊 Saved multiplayer game session: ${gameSession.id}`);
            }
            room.gameState = 'FINISHED';
        } else {
            room.gameState = 'QUESTION';
            const question = room.questions[room.currentQuestionIndex];

            console.log(`Sending question ${room.currentQuestionIndex + 1}/${room.questions.length} to room ${roomCode}`);
            io.to(roomCode).emit('new_question', {
                question: {
                    text: question.text,
                    options: question.options,
                    timeLimit: question.timeLimit,
                    type: question.type, // Include type for client UI
                    index: room.currentQuestionIndex,
                    total: room.questions.length
                }
            });
            room.currentQuestionStartTime = Date.now();
        }
    });

    const removePlayer = (socketId) => {
        // Find room where user is a player
        for (const roomCode in games) {
            const room = games[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socketId);

            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                console.log(`❌ ${player.nickname} left room ${roomCode}`);

                // If game hasn't started, update lobby for others
                if (room.gameState === 'LOBBY') {
                    io.to(roomCode).emit('lobby_update', {
                        players: room.players.map(p => ({
                            nickname: p.nickname,
                            avatar: p.avatar,
                            isHost: p.id === room.hostId
                        }))
                    });
                }

                // If host left, maybe notify others? For now just log
                if (room.hostId === socketId) {
                    console.log(`⚠️ Host left room ${roomCode}`);
                }

                // Clean up empty rooms
                if (room.players.length === 0) {
                    delete games[roomCode];
                    console.log(`🗑️ Room ${roomCode} deleted (empty)`);
                }

                return; // User can only be in one room
            }
        }
    };

    socket.on('leave_room', () => {
        console.log('🚪 leave_room event received from:', socket.id);
        removePlayer(socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        removePlayer(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
