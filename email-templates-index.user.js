// ==UserScript==
// @name         Email Templates Index
// @namespace    https://example.com
// @version      7.11
// @description  Inserts selected template text into focused input fields or TinyMCE editors, with correct selection, auto-scroll, button highlighting, and restart functionality.
// @author       KaiserXanderW
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/KaiserXanderW/email-responses-index/main/email-templates-index.user.js
// @updateURL    https://raw.githubusercontent.com/KaiserXanderW/email-responses-index/main/email-templates-index.user.js
// ==/UserScript==


(function () {
    'use strict';

    let lastFocusedElement = null;
    let searchBoxContainer = null;
    let input, ul;
    let highlightedIndex = -1;
    let selectedLanguage = "DE"; // Default to German
    let filteredTemplates = [];  // Stores the filtered templates from search
    let templates = [];

    // Wrap all script logic in a function
    async function init() {
        console.log("Template Index Script: init() called.");

        // Clear existing event listeners to avoid duplicates on script restart
        document.removeEventListener('focusin', trackFocusedElement);
        document.removeEventListener('keydown', globalKeyListener);

        // 1. Track Focused Elements
        document.addEventListener('focusin', trackFocusedElement, { capture: true });

        // 2. Keydown for opening the search box (F4) - capture phase for reliability
        document.addEventListener('keydown', globalKeyListener, { capture: true });

        // 3. Fetch templates again (or skip if you prefer caching)
        templates = await loadTemplates();
    }

    function trackFocusedElement(event) {
        if (searchBoxContainer && searchBoxContainer.contains(event.target)) {
            return;
        }
        const target = event.target;
        if (
            target.tagName === 'TEXTAREA' ||
            (target.tagName === 'INPUT' && target.type === 'text') ||
            target.isContentEditable
        ) {
            lastFocusedElement = target;
        }
    }

    function globalKeyListener(event) {
        console.log('Keydown captured:', event.key);  // Debug log
        if (event.key === 'F4') {
            event.preventDefault();
            event.stopPropagation();
            createSearchBox();
        }
    }

    function createSearchBox() {
        if (searchBoxContainer) {
            searchBoxContainer.remove();
        }

        if (!lastFocusedElement) {
            alert('No text box or contenteditable field was focused.');
            return;
        }

        // Container for the entire search UI
        searchBoxContainer = document.createElement('div');
        searchBoxContainer.style.position = 'absolute';
        searchBoxContainer.style.zIndex = '10000';
        searchBoxContainer.style.fontFamily = 'Arial, sans-serif';
        searchBoxContainer.style.backgroundColor = 'white';
        searchBoxContainer.style.border = '1px solid #ccc';
        searchBoxContainer.style.borderRadius = '4px';
        searchBoxContainer.style.padding = '5px';
        searchBoxContainer.style.boxShadow = '0px 4px 8px rgba(0,0,0,0.1)';

        const rect = lastFocusedElement.getBoundingClientRect();
        searchBoxContainer.style.top = `${rect.top + window.scrollY}px`;
        searchBoxContainer.style.left = `${rect.left + window.scrollX}px`;

        // The top container with the input + close button
        const topRowContainer = document.createElement('div');
        topRowContainer.style.display = 'flex';
        topRowContainer.style.alignItems = 'center';

        // The search input
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type to filter templates...';
        input.style.width = '200px';
        input.style.padding = '5px';
        input.style.fontSize = '14px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';
        input.style.display = 'block';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        // Prevent autofill by making it readonly initially
        input.setAttribute('name', 'search_' + Math.random().toString(36).substr(2, 10));
        input.setAttribute('readonly', 'true');
        input.addEventListener('focus', () => {
            input.removeAttribute('readonly');
        });

        // The close button (little X)
        const closeButton = document.createElement('button');
        closeButton.textContent = 'X';
        closeButton.style.fontSize = '14px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.marginLeft = '5px';
        closeButton.addEventListener('click', () => {
            closeSearchBox();
        });

        // Add input and close button to the top row
        topRowContainer.appendChild(input);
        topRowContainer.appendChild(closeButton);

        // The list of templates
        ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.margin = '5px 0 0 0';
        ul.style.padding = '0';
        ul.style.backgroundColor = 'white';
        ul.style.border = '1px solid #ccc';
        ul.style.borderRadius = '4px';
        ul.style.maxHeight = '200px';
        ul.style.overflowY = 'auto';
        ul.style.display = 'none';

        // Attach everything
        searchBoxContainer.appendChild(topRowContainer);
        searchBoxContainer.appendChild(ul);
        document.body.appendChild(searchBoxContainer);

        // Setup event listeners
        input.focus();
        input.addEventListener('input', () => handleSearch(input.value));
        input.addEventListener('keydown', handleInputNavigation, true);

        // Show full list initially
        handleSearch('');
    }

    function handleSearch(query) {
        query = query.trim().toLowerCase();
        ul.innerHTML = '';
        highlightedIndex = -1;

        filteredTemplates = templates.filter(t =>
            t.title.toLowerCase().includes(query) ||
            t.tags.some(tag => tag.toLowerCase().includes(query))
        );

        if (filteredTemplates.length === 0) {
            ul.style.display = 'none';
            return;
        }

        ul.style.display = 'block';

        filteredTemplates.forEach((template, index) => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #eee';
            li.style.cursor = 'pointer';
            li.style.userSelect = 'none';
            li.contentEditable = false;
            li.tabIndex = -1;

            const title = document.createElement('span');
            title.textContent = template.title;
            title.style.flex = '1';

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '5px';

            const buttonDE = createLangButton('DE', template.text.de, index);
            const buttonEN = createLangButton('EN', template.text.en, index);

            buttonContainer.appendChild(buttonDE);
            buttonContainer.appendChild(buttonEN);

            li.appendChild(title);
            li.appendChild(buttonContainer);

            li.addEventListener('mouseenter', () => highlightResult(index));
            li.addEventListener('mouseleave', () => highlightResult(-1));
            li.addEventListener('click', () => highlightResult(index));

            ul.appendChild(li);
        });

        highlightResult(0);
    }

    function createLangButton(lang, text, index) {
        const button = document.createElement('button');
        button.textContent = lang;
        button.style.padding = '5px 10px';
        button.style.fontSize = '12px';
        button.style.cursor = 'pointer';
        button.style.border = '1px solid #ccc';
        button.style.borderRadius = '4px';
        button.style.transition = 'background 0.2s, color 0.2s';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            insertTemplate(text);
            closeSearchBox();
        });

        updateButtonStyle(button, lang, index);
        return button;
    }

    function updateButtonStyle(button, lang, index) {
        if (index === highlightedIndex && lang === selectedLanguage) {
            button.style.backgroundColor = '#007bff';
            button.style.color = 'white';
        } else {
            button.style.backgroundColor = '#ddd';
            button.style.color = 'black';
        }
    }

    function highlightResult(index) {
        highlightedIndex = index;
        const items = ul.querySelectorAll('li');

        items.forEach((item, i) => {
            item.style.backgroundColor = i === index ? '#bde4ff' : '';

            const buttons = item.querySelectorAll('button');
            buttons.forEach(btn => {
                const lang = btn.textContent;
                updateButtonStyle(btn, lang, i);
            });
        });

        if (index >= 0 && items[index]) {
            items[index].scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }

    function handleInputNavigation(event) {
        const items = ul.querySelectorAll('li');
        if (!items.length) return;

        switch (event.key) {
            case 'ArrowDown':
                highlightedIndex = (highlightedIndex + 1) % filteredTemplates.length;
                highlightResult(highlightedIndex);
                break;
            case 'ArrowUp':
                highlightedIndex = (highlightedIndex - 1 + filteredTemplates.length) % filteredTemplates.length;
                highlightResult(highlightedIndex);
                break;
            case 'ArrowLeft':
                selectedLanguage = "DE";
                highlightResult(highlightedIndex);
                break;
            case 'ArrowRight':
                selectedLanguage = "EN";
                highlightResult(highlightedIndex);
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && filteredTemplates.length > 0) {
                    const template = filteredTemplates[highlightedIndex];
                    insertTemplate(
                        selectedLanguage === "DE" ? template.text.de : template.text.en
                    );
                    closeSearchBox();
                }
                break;
            case 'Escape':
                closeSearchBox();
                break;
        }
    }

    function insertTemplate(text) {
        if (!lastFocusedElement) return;

        lastFocusedElement.focus();

        let wrappedText;
        if (selectedLanguage === "DE") {
            wrappedText = `${text}\\\\n\\\\nFreundliche Grüße,\\\\nAlexander`;
        } else {
            wrappedText = `${text}\\\\n\\\\nKind regards,\\\\nAlexander`;
        }

        if (lastFocusedElement.isContentEditable) {
            document.execCommand('insertText', false, wrappedText);
        } else {
            lastFocusedElement.value += wrappedText;
        }
    }

    function closeSearchBox() {
        if (searchBoxContainer) searchBoxContainer.remove();
    }

    async function loadTemplates() {
        try {
            const response = await fetch("https://gist.githubusercontent.com/KaiserXanderW/51087d041078b96b8b702e91395331e5/raw");
            if (!response.ok) throw new Error("Failed to load templates.");
            return await response.json();
        } catch (error) {
            console.error("Error loading templates:", error);
            return [];
        }
    }

    // Call init() right away
    init();

    // Add the restart function if GM_registerMenuCommand is available
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand("Restart Script", async () => {
            console.clear();
            console.log("Restarting Template Index Script!");
            await init();
        });
    }
})();
