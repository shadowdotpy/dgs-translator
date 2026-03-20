const translateBtn = document.getElementById('translateBtn');
const clearBtn = document.getElementById('clearBtn');
const userInput = document.getElementById('userInput');
const currentWordDisplay = document.getElementById('currentWord');
const statusDisplay = document.getElementById('status');
const glossOutput = document.getElementById('glossOutput');
const videoContainer = document.getElementById('videoContainer');
const videoCredits = document.getElementById('videoCredits');

let videoQueue = [];
let isSequenceRunning = false;

userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') translateBtn.click(); });

clearBtn.addEventListener('click', () => {
    userInput.value = "";
    userInput.focus();
    stopAllVideos();
    videoContainer.innerHTML = "";
    videoCredits.innerHTML = "";
    currentWordDisplay.innerText = "-";
    statusDisplay.innerText = "Bereit.";
    document.getElementById('glossContainer').style.display = "none";
    isSequenceRunning = false;
});

translateBtn.addEventListener('click', async () => {
    const text = userInput.value.trim();
    if (!text) return;

    stopAllVideos();
    videoContainer.innerHTML = "";
    videoCredits.innerHTML = "";
    videoQueue = [];
    
    const glosses = transformToDGS(text);
    initGlosses(glosses); 

    statusDisplay.innerText = "Suche Gebärden...";

    for (let i = 0; i < glosses.length; i++) {
        const word = glosses[i];
        const data = await fetchSignVideoData(word);
        const glossSpan = document.getElementById(`gloss-${i}`);
        
        if (data) {
            const index = videoQueue.length;
            videoQueue.push(data);
            addVideoToUI(data, index);
            if(glossSpan) glossSpan.className = "found";
        } else {
            if(glossSpan) glossSpan.className = "missing";
        }
    }

    if (videoQueue.length > 0) {
        isSequenceRunning = true;
        playVideoAtIndex(0, true);
        statusDisplay.innerText = "Wiedergabe läuft...";
    } else {
        statusDisplay.innerText = "Keine passenden Videos gefunden.";
    }
});

async function fetchSignVideoData(word) {
    const query = `query {
      search(word: "${word}") {
        id
        text
        currentVideo {
          videoUrl
          license
          copyright
          user { name }
        }
      }
    }`;

    const targetUrl = `https://signdict.org/graphql-api/graphiql?query=${encodeURIComponent(query)}&raw=true`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        const rawData = await response.json();
        const content = rawData.contents;

        let resultData;
        try {
            resultData = JSON.parse(content);
        } catch (e) {
            // Extraktions-Logik für HTML-Umschlag
            const startMarker = "response: '";
            const endMarker = "',\n        variables:";
            if (content.includes(startMarker)) {
                let jsonPart = content.split(startMarker)[1].split(endMarker)[0];
                jsonPart = jsonPart.replace(/\\n/g, '');
                resultData = JSON.parse(jsonPart);
            } else return null;
        }

        const searchResults = resultData.data?.search || [];
        let entry = searchResults.find(e => e.text.toLowerCase() === word.toLowerCase() && e.currentVideo?.videoUrl) 
                    || searchResults.find(e => e.currentVideo?.videoUrl);

        if (entry && entry.currentVideo) {
            return {
                word: entry.text.toUpperCase(),
                url: entry.currentVideo.videoUrl,
                user: entry.currentVideo.user?.name || "SignDict",
                copyright: entry.currentVideo.copyright || ""
            };
        }
    } catch (e) { console.error("API Fehler:", e); }
    return null;
}

function initGlosses(glosses) {
    document.getElementById('glossContainer').style.display = "flex";
    glossOutput.innerHTML = glosses.map((g, i) => `<span id="gloss-${i}" style="background:#eee; color:#666;">${g}</span>`).join("");
}

function addVideoToUI(data, index) {
    const div = document.createElement('div');
    div.className = 'video-item';
    div.id = `item-${index}`;
    div.innerHTML = `<video src="${data.url}" muted playsinline></video><p>${data.word}</p>`;
    div.onclick = () => { isSequenceRunning = false; playVideoAtIndex(index, false); };
    videoContainer.appendChild(div);
}

function playVideoAtIndex(index, continueNext) {
    if (index >= videoQueue.length) return;
    stopAllVideos();
    const data = videoQueue[index];
    const itemEl = document.getElementById(`item-${index}`);
    const vid = itemEl.querySelector('video');
    
    document.querySelectorAll('.video-item').forEach(el => el.classList.remove('active'));
    itemEl.classList.add('active');
    currentWordDisplay.innerText = data.word;
    videoCredits.innerHTML = `Quelle: <b>${data.user}</b> ${data.copyright}`;
    itemEl.scrollIntoView({ behavior: 'smooth', inline: 'center' });

    vid.play().catch(() => {});
    vid.onended = () => { 
        if (continueNext && isSequenceRunning) {
            setTimeout(() => playVideoAtIndex(index + 1, true), 500);
        }
    };
}

function stopAllVideos() { 
    videoContainer.querySelectorAll('video').forEach(v => { v.pause(); v.currentTime = 0; }); 
}

function transformToDGS(sentence) {
    const STOP_WORDS = ['ist', 'sind', 'bin', 'ein', 'eine', 'der', 'die', 'das', 'und'];
    
    // Mapping für Zeitformen (Erweiterbar)
    const TENSE_MAP = {
        // Essen & Trinken
        'aß': 'essen', 'gegessen': 'essen', 'trank': 'trinken', 'getrunken': 'trinken',
        // Bewegung
        'ging': 'gehen', 'gegangen': 'gehen', 'fuhr': 'fahren', 'gefahren': 'fahren',
        'lief': 'laufen', 'gelaufen': 'laufen', 'kam': 'kommen', 'gekommen': 'kommen',
        'flog': 'fliegen', 'geflogen': 'fliegen',
        // Kommunikation & Wahrnehmung
        'sagte': 'sagen', 'gesagt': 'sagen', 'sprach': 'sprechen', 'gesprochen': 'sprechen',
        'sah': 'sehen', 'gesehen': 'sehen', 'hörte': 'hören', 'gehört': 'hören',
        'las': 'lesen', 'gelesen': 'lesen', 'schrieb': 'schreiben', 'geschrieben': 'schreiben',
        // Arbeit & Handeln
        'machte': 'machen', 'gemacht': 'machen', 'arbeitete': 'arbeiten', 'gearbeitet': 'arbeiten',
        'gab': 'geben', 'gegeben': 'geben', 'nahm': 'nehmen', 'genommen': 'nehmen',
        'half': 'helfen', 'geholfen': 'helfen', 'kaufte': 'kaufen', 'gekauft': 'kaufen',
        // Denken & Fühlen
        'dachte': 'denken', 'gedacht': 'denken', 'wusste': 'wissen', 'gewusst': 'wissen',
        'verstand': 'verstehen', 'verstanden': 'verstehen', 'fand': 'finden', 'gefunden': 'finden',
        'liebte': 'lieben', 'geliebt': 'lieben',
        // Modalverben
        'wollte': 'wollen', 'konnte': 'können', 'musste': 'müssen', 'durfte': 'dürfen', 'sollte': 'sollen'
    };

    return sentence.toLowerCase().replace(/[.!?,]/g, "").split(/\s+/)
                   .filter(w => !STOP_WORDS.includes(w) && w.length > 0)
                   .map(w => {
                       // Zeitform umwandeln falls im Mapping vorhanden, sonst Original
                       const baseForm = TENSE_MAP[w] || w;
                       return baseForm.toUpperCase();
                   });
}

// Drag Logik
let isDown = false; let startX; let scrollLeft;
videoContainer.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX - videoContainer.offsetLeft; scrollLeft = videoContainer.scrollLeft; videoContainer.style.scrollBehavior = 'auto'; });
videoContainer.addEventListener('mouseleave', () => isDown = false);
videoContainer.addEventListener('mouseup', () => { isDown = false; videoContainer.style.scrollBehavior = 'smooth'; });
videoContainer.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); const x = e.pageX - videoContainer.offsetLeft; const walk = (x - startX) * 2; videoContainer.scrollLeft = scrollLeft - walk; });