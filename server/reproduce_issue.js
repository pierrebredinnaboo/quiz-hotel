require('dotenv').config();

const hotelGroups = {
    MARRIOTT: {
        name: "Marriott International",
        brands: [
            "The Ritz-Carlton", "Ritz-Carlton Reserve", "St. Regis", "JW Marriott", "W Hotels", "The Luxury Collection", "EDITION", "Bulgari Hotels & Resorts",
            "Marriott Hotels", "Sheraton", "Westin", "Renaissance Hotels", "Autograph Collection", "Delta Hotels", "Gaylord Hotels", "Design Hotels", "Tribute Portfolio",
            "Courtyard", "Four Points by Sheraton", "Fairfield by Marriott", "AC Hotels", "Aloft Hotels", "Moxy Hotels", "Element", "Protea Hotels", "City Express",
            "TownePlace Suites", "StudioRes", "Apartments by Marriott Bonvoy", "Homes & Villas", "Residence Inn", "SpringHill Suites"
        ]
    },
    HILTON: {
        name: "Hilton Worldwide",
        brands: [
            "Waldorf Astoria", "LXR Hotels & Resorts", "Conrad Hotels & Resorts", "Canopy by Hilton", "Signia by Hilton", "Hilton Hotels & Resorts", "Curio Collection",
            "DoubleTree by Hilton", "Tapestry Collection", "Embassy Suites", "Tempo by Hilton", "Motto by Hilton", "Hilton Garden Inn",
            "Hampton by Hilton", "Tru by Hilton", "Spark by Hilton", "Homewood Suites", "Home2 Suites", "Hilton Grand Vacations"
        ]
    },
    ACCOR: {
        name: "Accor Group",
        brands: [
            "Raffles", "Orient Express", "Banyan Tree", "Sofitel", "Sofitel Legend", "Fairmont", "Emblems", "SLS", "SO/",
            "MGallery", "Pullman", "Swissôtel", "Mövenpick", "Angsana", "Peppers", "Grand Mercure", "The Sebel", "Mantis",
            "Novotel", "Mercure", "Adagio", "Tribe", "Handwritten Collection",
            "ibis", "ibis Styles", "ibis budget", "greet", "hotelF1"
        ]
    }
};

async function fetchAIQuestions(count = 10, selectedGroupIds = ['MARRIOTT']) {
    const filteredGroups = {};
    selectedGroupIds.forEach(id => {
        if (hotelGroups[id]) {
            filteredGroups[id] = hotelGroups[id];
        }
    });

    const contextJSON = JSON.stringify(filteredGroups, null, 2);

    const systemPrompt = `You are an expert Hotel Consultant. The user has selected the following Hotel Groups for training.

**Use ONLY this data context to generate questions:**
${contextJSON}

**CRITICAL RULES:**
1. Generate ${count} unique questions.
2. ONLY use brands present in the JSON above.
3. Do not include brands from unselected competitors.
4. Focus on brand recognition, group ownership, and positioning.

**QUESTION TYPES TO USE:**
1. **Brand Ownership:** "Which hotel group owns [Brand]?" (Options: group names from the context)
2. **Brand Recognition:** "Is [Brand] part of [Group]?" (Yes/No)
3. **Multiple Choice:** "Which of these brands belongs to [Group]?" (Mix brands from different groups)

**OUTPUT FORMAT:**
Strict JSON Array. No Markdown.
Structure: [{ "id": 1, "text": "Question?", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "explanation": "Short fact." }]`;

    try {
        console.log('🤖 Calling Gemini AI via REST API...');
        console.log('Key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 'MISSING');

        // const fetch = require('undici').fetch; // Using global fetch
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Success! Response received.');
        // console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ AI Question Generation Error:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

fetchAIQuestions(15, ['MARRIOTT', 'HILTON', 'ACCOR']);
