/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';

// DOM Element References
const form = document.getElementById('prompt-form') as HTMLFormElement;
const topicInput = document.getElementById('topic-input') as HTMLInputElement;
const gradeSelect = document.getElementById('grade-select') as HTMLSelectElement;
const boardSelect = document.getElementById('board-select') as HTMLSelectElement;
const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
const textResultEl = document.getElementById('text-result') as HTMLDivElement;
const mediaResultEl = document.getElementById('media-result') as HTMLDivElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const errorMessageEl = document.getElementById('error-message') as HTMLParagraphElement;
const actionsContainer = document.getElementById('actions-container') as HTMLDivElement;
const visualAidsContainer = document.getElementById('visual-aids-container') as HTMLDivElement;

// Favorites Modal Elements
const viewFavoritesButton = document.getElementById('view-favorites-button') as HTMLButtonElement;
const favoritesModal = document.getElementById('favorites-modal') as HTMLDivElement;
const closeModalButton = document.getElementById('close-modal-button') as HTMLButtonElement;
const favoritesList = document.getElementById('favorites-list') as HTMLDivElement;
const tagFiltersContainer = document.getElementById('tag-filters') as HTMLDivElement;
const modalOverlay = document.querySelector('.modal-overlay') as HTMLDivElement;

// App State
type Favorite = {
    id: string;
    topic: string;
    grade: string;
    board: string;
    explanation: string;
    tags: string[];
};
let currentTopicData: Omit<Favorite, 'id' | 'tags'> | null = null;
let activeTagFilter: string | null = null;


// Initialize the Google AI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- FAVORITES & TAGS LOGIC ---

/**
 * Retrieves favorites from localStorage.
 * @returns {Favorite[]} An array of favorite items.
 */
function getFavorites(): Favorite[] {
    const favoritesJSON = localStorage.getItem('conceptFavorites');
    const favorites = favoritesJSON ? JSON.parse(favoritesJSON) : [];
    // Ensure every favorite has a tags array for backward compatibility
    return favorites.map(fav => ({ ...fav, tags: fav.tags || [] }));
}

/**
 * Saves favorites to localStorage.
 * @param {Favorite[]} favorites - The array of favorite items to save.
 */
function saveFavorites(favorites: Favorite[]): void {
    localStorage.setItem('conceptFavorites', JSON.stringify(favorites));
}

/**
 * Toggles the favorite status of the current topic.
 */
function toggleFavorite(): void {
    if (!currentTopicData) return;

    const favorites = getFavorites();
    const existingIndex = favorites.findIndex(fav =>
        fav.topic === currentTopicData.topic &&
        fav.grade === currentTopicData.grade &&
        fav.board === currentTopicData.board
    );

    if (existingIndex > -1) {
        // Remove from favorites
        favorites.splice(existingIndex, 1);
    } else {
        // Add to favorites
        const newFavorite: Favorite = {
            id: `fav-${Date.now()}`,
            ...currentTopicData,
            tags: [], // Initialize with empty tags
        };
        favorites.push(newFavorite);
    }

    saveFavorites(favorites);
    renderActionButtons(); // Re-render the button to reflect the new state
}

/**
 * Adds a tag to a favorite item.
 * @param {string} favoriteId - The ID of the favorite.
 * @param {string} tag - The tag to add.
 */
function addTagToFavorite(favoriteId: string, tag: string): void {
    const cleanedTag = tag.trim();
    if (!cleanedTag) return;

    const favorites = getFavorites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (favorite && !favorite.tags.includes(cleanedTag)) {
        favorite.tags.push(cleanedTag);
        saveFavorites(favorites);
        renderFavoritesList(); // Re-render to show the new tag
    }
}

/**
 * Removes a tag from a favorite item.
 * @param {string} favoriteId - The ID of the favorite.
 * @param {string} tag - The tag to remove.
 */
function removeTagFromFavorite(favoriteId: string, tag: string): void {
    const favorites = getFavorites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (favorite) {
        favorite.tags = favorite.tags.filter(t => t !== tag);
        saveFavorites(favorites);
        renderFavoritesList(); // Re-render to remove the tag
    }
}

/**
 * Creates a short text snippet from a longer string.
 * @param {string} text - The full text.
 * @param {number} [length=150] - The approximate length of the snippet.
 * @returns {string} The text snippet.
 */
function createSnippet(text: string, length = 150): string {
    if (!text || text.length <= length) {
        return text;
    }
    const trimmedText = text.substring(0, length);
    const lastSpaceIndex = trimmedText.lastIndexOf(' ');
    if (lastSpaceIndex > 0) {
        return trimmedText.substring(0, lastSpaceIndex) + '...';
    }
    return trimmedText + '...';
}

/**
 * Renders the action buttons (Favorite, Copy) based on the current state.
 */
function renderActionButtons(): void {
    actionsContainer.innerHTML = '';
    if (!currentTopicData) return;

    const favorites = getFavorites();
    const isFavorited = favorites.some(fav =>
        fav.topic === currentTopicData.topic &&
        fav.grade === currentTopicData.grade &&
        fav.board === currentTopicData.board
    );

    // --- Favorite Button ---
    const favoriteButton = document.createElement('button');
    favoriteButton.id = 'favorite-button';
    favoriteButton.className = 'icon-button';
    favoriteButton.setAttribute('aria-pressed', String(isFavorited));
    favoriteButton.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Save to favorites');
    favoriteButton.innerHTML = isFavorited
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="m12 15.4 6 3.6-1.6-7 5.6-4.8-7.2-0.6L12 2 9.2 8l-7.2 0.6 5.6 4.8-1.6 7Z"/></svg> <span>Saved</span>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="m12 15.4 6 3.6-1.6-7 5.6-4.8-7.2-0.6L12 2 9.2 8l-7.2 0.6 5.6 4.8-1.6 7Zm0-2.85 4.25 2.55-0.95-4.75 3.5-3-4.55-0.4L12 3.15 9.75 7.3l-4.55 0.4 3.5 3-0.95 4.75Z"/></svg> <span>Save to Favorites</span>`;
    favoriteButton.addEventListener('click', toggleFavorite);

    // --- Copy Button ---
    const copyButton = document.createElement('button');
    copyButton.id = 'copy-button';
    copyButton.className = 'icon-button';
    copyButton.setAttribute('aria-label', 'Copy explanation');
    const originalCopyHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M7 19q-.825 0-1.412-.587T5 17V4q0-.825.588-1.412T7 2h10q.825 0 1.413.588T19 4v13q0 .825-.587 1.413T17 19Zm0-2h10V4H7Zm-4 6q-.825 0-1.412-.587T1 21V8h2v13h11v2Zm4-6V4v13Z"/></svg> <span>Copy</span>`;
    copyButton.innerHTML = originalCopyHTML;

    copyButton.addEventListener('click', () => {
        if (!currentTopicData?.explanation) return;
        navigator.clipboard.writeText(currentTopicData.explanation).then(() => {
            copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M9.55 18.2 3.65 12.3l1.425-1.425L9.55 15.35l9.425-9.425L20.4 7.35Z"/></svg> <span>Copied!</span>`;
            copyButton.classList.add('copied');
            copyButton.disabled = true;
            setTimeout(() => {
                copyButton.innerHTML = originalCopyHTML;
                copyButton.classList.remove('copied');
                copyButton.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            // Optionally, show an error message to the user
        });
    });

    actionsContainer.appendChild(copyButton);
    actionsContainer.appendChild(favoriteButton);
}


/**
 * Renders the list of favorited items and tag filters in the modal.
 */
function renderFavoritesList(): void {
    const allFavorites = getFavorites();
    const filteredFavorites = activeTagFilter ? allFavorites.filter(fav => fav.tags.includes(activeTagFilter)) : allFavorites;
    
    renderTagFilters(allFavorites);
    favoritesList.innerHTML = '';

    if (filteredFavorites.length === 0) {
        favoritesList.innerHTML = `<p class="empty-list-message">${activeTagFilter ? 'No topics found with this tag.' : 'You haven\'t saved any topics yet.'}</p>`;
        return;
    }

    filteredFavorites.forEach(favorite => {
        const item = document.createElement('div');
        item.className = 'favorite-item';
        
        // --- Main Content (Topic + Remove Button) ---
        const mainContent = document.createElement('div');
        mainContent.className = 'favorite-main-content';
        const info = document.createElement('div');
        info.className = 'favorite-info';
        info.innerHTML = `
            <button class="favorite-topic-button">${favorite.topic}</button>
            <span class="favorite-details">${favorite.grade} Grade, ${favorite.board}</span>
        `;
        info.querySelector('.favorite-topic-button').addEventListener('click', () => {
            loadFavorite(favorite);
        });
        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-button remove-button';
        removeBtn.setAttribute('aria-label', `Remove ${favorite.topic}`);
        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21ZM17 6H7v13h10Z"/></svg>`;
        removeBtn.addEventListener('click', () => removeFavorite(favorite.id));
        mainContent.appendChild(info);
        mainContent.appendChild(removeBtn);

        // --- Explanation Snippet Section ---
        const explanationContainer = document.createElement('div');
        explanationContainer.className = 'favorite-explanation';
        const snippet = createSnippet(favorite.explanation);
        const snippetParagraph = document.createElement('p');
        snippetParagraph.innerText = snippet;
        explanationContainer.appendChild(snippetParagraph);

        // --- Toggle Button ---
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-explanation-button';
        toggleButton.textContent = 'Read More';
        let isExpanded = false;
        toggleButton.addEventListener('click', () => {
            isExpanded = !isExpanded;
            explanationContainer.classList.toggle('expanded', isExpanded);
            if (isExpanded) {
                explanationContainer.innerHTML = marked.parse(favorite.explanation) as string;
                toggleButton.textContent = 'Read Less';
            } else {
                explanationContainer.innerHTML = ''; // Clear first
                const p = document.createElement('p');
                p.innerText = snippet;
                explanationContainer.appendChild(p);
                toggleButton.textContent = 'Read More';
            }
        });

        // --- Tags Section ---
        const tagsSection = document.createElement('div');
        tagsSection.className = 'tags-section';
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags-container';
        favorite.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            const removeTagBtn = document.createElement('button');
            removeTagBtn.className = 'remove-tag-button';
            removeTagBtn.innerHTML = '&times;';
            removeTagBtn.setAttribute('aria-label', `Remove tag ${tag}`);
            removeTagBtn.onclick = () => removeTagFromFavorite(favorite.id, tag);
            tagEl.appendChild(removeTagBtn);
            tagsContainer.appendChild(tagEl);
        });
        const tagInputContainer = document.createElement('div');
        tagInputContainer.className = 'tag-input-container';
        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.placeholder = 'Add a tag...';
        tagInput.className = 'tag-input';
        const addTagBtn = document.createElement('button');
        addTagBtn.textContent = 'Add';
        addTagBtn.className = 'add-tag-button';
        const addTagAction = () => {
            addTagToFavorite(favorite.id, tagInput.value);
            tagInput.value = '';
        };
        addTagBtn.onclick = addTagAction;
        tagInput.onkeydown = (e) => { if (e.key === 'Enter') addTagAction(); };
        tagInputContainer.appendChild(tagInput);
        tagInputContainer.appendChild(addTagBtn);
        tagsSection.appendChild(tagsContainer);
        tagsSection.appendChild(tagInputContainer);

        // --- Append all parts ---
        item.appendChild(mainContent);
        item.appendChild(explanationContainer);
        item.appendChild(toggleButton);
        item.appendChild(tagsSection);
        favoritesList.appendChild(item);
    });
}

/**
 * Renders the tag filter buttons.
 * @param {Favorite[]} allFavorites - All saved favorites to extract tags from.
 */
function renderTagFilters(allFavorites: Favorite[]): void {
    tagFiltersContainer.innerHTML = '';
    const allTags = new Set(allFavorites.flatMap(fav => fav.tags));

    if (allTags.size > 0) {
        const clearButton = document.createElement('button');
        clearButton.textContent = 'All Topics';
        clearButton.className = 'tag-filter-button' + (activeTagFilter === null ? ' active' : '');
        clearButton.onclick = () => {
            activeTagFilter = null;
            renderFavoritesList();
        };
        tagFiltersContainer.appendChild(clearButton);

        allTags.forEach(tag => {
            const button = document.createElement('button');
            button.textContent = tag;
            button.className = 'tag-filter-button' + (activeTagFilter === tag ? ' active' : '');
            button.onclick = () => {
                activeTagFilter = tag;
                renderFavoritesList();
            };
            tagFiltersContainer.appendChild(button);
        });
    }
}

/**
 * Loads a selected favorite's content into the main view.
 * @param {Favorite} favorite - The favorite item to load.
 */
function loadFavorite(favorite: Favorite): void {
    // Update inputs
    topicInput.value = favorite.topic;
    gradeSelect.value = favorite.grade;
    boardSelect.value = favorite.board;

    const { mainContent, visualAidDescriptions } = parseExplanation(favorite.explanation);

    // Display content
    textResultEl.innerHTML = marked.parse(mainContent) as string;
    mediaResultEl.innerHTML = '<p class="info-message">Media is not saved with favorites.</p>';
    
     // Clear any old visual aids and display the descriptions as text
    visualAidsContainer.innerHTML = '';
    if (visualAidDescriptions.length > 0) {
        visualAidsContainer.innerHTML = `
            <h3>Visual Aids</h3>
            <p class="info-message">The following visual aids were part of the original explanation:</p>
            <ul>
                ${visualAidDescriptions.map(desc => `<li>${desc}</li>`).join('')}
            </ul>
        `;
    }

    // Update state
    currentTopicData = {
        topic: favorite.topic,
        grade: favorite.grade,
        board: favorite.board,
        explanation: favorite.explanation,
    };

    // Update UI
    errorMessageEl.style.display = 'none';
    loader.style.display = 'none';
    renderActionButtons();
    closeModal();
}

/**
 * Removes a favorite item by its ID.
 * @param {string} id - The ID of the favorite to remove.
 */
function removeFavorite(id: string): void {
    let favorites = getFavorites();
    favorites = favorites.filter(fav => fav.id !== id);
    saveFavorites(favorites);
    renderFavoritesList(); // Re-render the list
}


// --- MODAL CONTROLS ---
function openModal() {
    activeTagFilter = null;
    renderFavoritesList();
    favoritesModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    favoritesModal.hidden = true;
    document.body.style.overflow = '';
}

viewFavoritesButton.addEventListener('click', openModal);
closeModalButton.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !favoritesModal.hidden) {
        closeModal();
    }
});


// --- API & GENERATION LOGIC ---

/**
 * Parses the full explanation to separate main content from visual aid descriptions.
 * @param {string} fullText - The complete markdown text from the model.
 * @returns {{mainContent: string, visualAidDescriptions: string[]}}
 */
function parseExplanation(fullText: string): { mainContent: string; visualAidDescriptions: string[] } {
    const visualAidHeading = "### Visual Aids";
    const examQuestionsHeading = "### Potential Exam Questions";

    const visualAidStartIndex = fullText.indexOf(visualAidHeading);
    
    if (visualAidStartIndex === -1) {
        return { mainContent: fullText, visualAidDescriptions: [] };
    }

    const examQuestionsStartIndex = fullText.indexOf(examQuestionsHeading, visualAidStartIndex);
    const endOfSection = examQuestionsStartIndex !== -1 ? examQuestionsStartIndex : fullText.length;

    const mainContentBefore = fullText.substring(0, visualAidStartIndex).trim();
    const mainContentAfter = fullText.substring(endOfSection).trim();
    const mainContent = `${mainContentBefore}\n\n${mainContentAfter}`;
    
    const visualAidsSection = fullText.substring(visualAidStartIndex + visualAidHeading.length, endOfSection).trim();
    const descriptions = visualAidsSection
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- '))
        .map(line => line.substring(2).trim());

    return { mainContent, visualAidDescriptions: descriptions };
}

/**
 * Streams a text explanation from the Gemini model.
 */
async function generateExplanation(prompt: string): Promise<string> {
    let fullResponse = '';
    textResultEl.innerHTML = '';
    try {
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        for await (const chunk of responseStream) {
            fullResponse += chunk.text;
            textResultEl.innerHTML = marked.parse(fullResponse) as string;
        }
        return fullResponse;
    } catch (error) {
        console.error('Error generating text:', error);
        throw new Error('Failed to generate text explanation.');
    }
}

/**
 * Generates an educational video related to the topic.
 * This involves starting a generation job and polling for its completion.
 */
async function generateVideo(topic: string) {
    // 1. Set initial loading state in the media container.
    mediaResultEl.innerHTML = `
        <div class="media-placeholder">
            <div class="placeholder-icon"></div>
            <p id="media-status-text">Preparing video request...</p>
        </div>
    `;
    const mediaStatusText = document.getElementById('media-status-text') as HTMLParagraphElement;

    // 2. Define the enhanced prompt for a high-quality educational video.
    const videoPrompt = `Create a short, high-quality, and visually engaging educational animation explaining the concept of "${topic}". The style should be a clean, 2D motion graphics animation with clear typography, smooth transitions, and relevant icons or diagrams. The video should be silent and last around 15-30 seconds. Focus on making the core concepts easy to grasp for a student.`;

    try {
        // 3. Start the video generation operation.
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: videoPrompt,
            config: { numberOfVideos: 1 }
        });

        // 4. Set up reassuring loading messages during polling.
        const loadingMessages = [
            "Storyboarding the concept...", "Gathering visual elements...", "Animating the key points...",
            "Rendering frames...", "Adding final touches...", "Almost ready..."
        ];
        let messageIndex = 0;
        mediaStatusText.textContent = loadingMessages[messageIndex];
        const messageInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % loadingMessages.length;
            const currentStatusEl = document.getElementById('media-status-text');
            if (currentStatusEl) {
                currentStatusEl.textContent = loadingMessages[messageIndex];
            } else {
                clearInterval(messageInterval);
            }
        }, 8000);

        // 5. Poll for the operation to complete.
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        clearInterval(messageInterval);

        // 6. Process the finished operation.
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error('Video generation succeeded but no download link was found.');
        }

        const finalStatusEl = document.getElementById('media-status-text');
        if (finalStatusEl) finalStatusEl.textContent = 'Finalizing video...';

        // 7. Fetch the video data and create a video element.
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error(`Failed to download video: ${response.statusText}`);
        
        const videoBlob = await response.blob();
        const videoUrl = URL.createObjectURL(videoBlob);
        
        const video = document.createElement('video');
        video.src = videoUrl;
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.setAttribute('playsinline', '');
        
        mediaResultEl.innerHTML = '';
        mediaResultEl.appendChild(video);

    } catch (error) {
        console.error('Error generating video:', error);
        mediaResultEl.innerHTML = `<p class="error-message-small">Could not generate video.</p>`;
    }
}

/**
 * Generates a single image based on a description.
 */
async function generateSingleImage(description: string): Promise<string> {
    const imagePrompt = `Create a very simple and clear educational diagram or infographic with minimal text, suitable for a school textbook. The diagram should visually explain: "${description}". Use a clean, flat design style with a white background.`;
    
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '16:9',
        },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${base64ImageBytes}`;
}

/**
 * Generates and displays visual aids based on descriptions.
 */
async function generateVisualAids(descriptions: string[]): Promise<void> {
    visualAidsContainer.innerHTML = `<h3>Visual Aids</h3>`;
    
    const placeholderIds = descriptions.map((_, index) => `visual-aid-placeholder-${index}`);
    descriptions.forEach((desc, index) => {
        const item = document.createElement('div');
        item.className = 'visual-aid-item';
        item.innerHTML = `
            <p class="visual-aid-description">${desc}</p>
            <div id="${placeholderIds[index]}" class="visual-aid-loader">
                <div class="loader-small"></div>
            </div>
        `;
        visualAidsContainer.appendChild(item);
    });

    const imagePromises = descriptions.map(desc => generateSingleImage(desc));
    const results = await Promise.allSettled(imagePromises);

    results.forEach((result, index) => {
        const placeholder = document.getElementById(placeholderIds[index]);
        if (placeholder) {
            if (result.status === 'fulfilled') {
                const img = document.createElement('img');
                img.src = result.value;
                img.alt = descriptions[index];
                placeholder.replaceWith(img);
            } else {
                console.error(`Failed to generate diagram for: "${descriptions[index]}"`, result.reason);
                placeholder.innerHTML = `<p class="error-message-small">Could not generate diagram.</p>`;
            }
        }
    });
}


/**
 * Handles the form submission to generate a concept explanation and media.
 * @param {Event} e - The form submission event.
 */
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!topicInput.value) {
        errorMessageEl.textContent = 'Please enter a topic.';
        errorMessageEl.style.display = 'block';
        return;
    }

    // Reset state
    submitButton.disabled = true;
    loader.style.display = 'flex';
    textResultEl.innerHTML = '';
    mediaResultEl.innerHTML = '';
    visualAidsContainer.innerHTML = '';
    errorMessageEl.style.display = 'none';
    actionsContainer.innerHTML = '';
    currentTopicData = null;

    const topic = topicInput.value;
    const grade = gradeSelect.value;
    const board = boardSelect.value;

    const textPrompt = `You are an expert educator specializing in the ${board} curriculum.
    Explain the concept of "${topic}" for a ${grade} grade student.
    Break down complex ideas into simple, easy-to-understand parts.
    Use analogies and real-world examples relevant to a student in India.
    Structure the response clearly using markdown formatting (headings, lists, bold text).

    After the main explanation, add a section titled "### Visual Aids".
    Under this section, provide 2-3 concise, single-sentence descriptions of simple diagrams or infographics that would help explain this concept. Each description must be on a new line and start with a hyphen (-).

    Finally, include a section at the end titled "### Potential Exam Questions"
    Under this section, provide 2-3 exam-style questions related to the topic.
    For each question, provide a detailed, model answer that a student should write to get full marks.`;

    try {
        const textPromise = generateExplanation(textPrompt);
        const videoPromise = generateVideo(topic);

        const results = await Promise.allSettled([textPromise, videoPromise]);

        if (results[0].status === 'fulfilled') {
            const fullExplanation = results[0].value;
            currentTopicData = { topic, grade, board, explanation: fullExplanation };
            renderActionButtons();

            const { mainContent, visualAidDescriptions } = parseExplanation(fullExplanation);
            textResultEl.innerHTML = marked.parse(mainContent) as string;
            
            if (visualAidDescriptions.length > 0) {
                generateVisualAids(visualAidDescriptions);
            }

        } else {
             errorMessageEl.textContent = 'Sorry, something went wrong while generating the explanation. Please try again.';
             errorMessageEl.style.display = 'block';
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        errorMessageEl.textContent = 'An unexpected error occurred. Please check the console.';
        errorMessageEl.style.display = 'block';
    } finally {
        // Reset loading state
        loader.style.display = 'none';
        submitButton.disabled = false;
    }
});