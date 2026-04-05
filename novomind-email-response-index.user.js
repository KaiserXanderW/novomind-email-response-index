// ==UserScript==
// @name         novomind-email-response-index
// @namespace    https://example.com
// @version      7.13
// @description  Inserts selected template text into focused input fields or TinyMCE editors (iframes), with F4 hotkey.
// @author       KaiserXanderW
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      gist.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/KaiserXanderW/novomind-email-response-index/main/novomind-email-response-index.user.js
// @updateURL    https://raw.githubusercontent.com/KaiserXanderW/novomind-email-response-index/main/novomind-email-response-index.user.js
// ==/UserScript==

(function() {
    "use strict";

    let lastFocusedElement = null;
    let lastIframe = null;
    let searchBoxContainer = null;
    let input, ul;
    let highlightedIndex = -1;
    let selectedLanguage = "DE";
    let filteredTemplates = [];
    let templates = [];
    let templatesLoadFailed = false;

    async function init() {
        console.log("Template Index Script: init() called.");

        document.removeEventListener("focusin", trackFocusedElement);
        document.removeEventListener("keydown", globalKeyListener);

        document.addEventListener("focusin", trackFocusedElement, { capture: true });
        document.addEventListener("keydown", globalKeyListener, { capture: true });

        const observer = new MutationObserver(setupIframeListeners);
        observer.observe(document.body, { childList: true, subtree: true });

        setupIframeListeners();
        const loaded = await loadTemplates();
        if (loaded === null) {
            templatesLoadFailed = true;
            templates = [];
        } else {
            templatesLoadFailed = false;
            templates = loaded;
        }
    }

    function setupIframeListeners() {
        document.querySelectorAll("iframe").forEach((iframe) => {
            if (iframe.contentDocument && !iframe.dataset.scriptListener) {
                iframe.dataset.scriptListener = "true";
                iframe.contentDocument.addEventListener("focusin", (e) => trackFocusedElementInIframe(e, iframe), { capture: true });
                iframe.contentDocument.addEventListener("keydown", (e) => globalKeyListenerInIframe(e, iframe), { capture: true });
                console.log("Listeners added to iframe:", iframe.id || iframe.src);
            }
        });
    }

    function trackFocusedElement(event) {
        if (searchBoxContainer && searchBoxContainer.contains(event.target)) return;
        const target = event.target;
        if (isEditable(target)) {
            lastFocusedElement = target;
            lastIframe = null;
        }
    }

    function trackFocusedElementInIframe(event, iframe) {
        if (searchBoxContainer && searchBoxContainer.contains(event.target)) return;
        const target = event.target;
        if (isEditable(target)) {
            lastFocusedElement = target;
            lastIframe = iframe;
        }
    }

    function globalKeyListener(event) {
        console.log("Main keydown:", event.key);
        if (event.key === "F4") {
            event.preventDefault();
            event.stopPropagation();
            createSearchBox();
        }
    }

    function globalKeyListenerInIframe(event, iframe) {
        console.log("Iframe keydown:", event.key);
        if (event.key === "F4") {
            event.preventDefault();
            event.stopPropagation();
            createSearchBox();
        }
    }

    function isEditable(el) {
        return el.tagName === "TEXTAREA" ||
               (el.tagName === "INPUT" && el.type === "text") ||
               el.isContentEditable ||
               el.contentEditable === "true";
    }

    function createSearchBox() {
        if (searchBoxContainer) searchBoxContainer.remove();

        if (!lastFocusedElement) {
            alert("No text box or contenteditable field was focused.");
            return;
        }

        searchBoxContainer = document.createElement("div");
        searchBoxContainer.style.cssText = `
            position: absolute; z-index: 10000; font-family: Arial, sans-serif;
            background: white; border: 1px solid #ccc; border-radius: 4px;
            padding: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        `;

        const rect = lastIframe ? lastIframe.getBoundingClientRect() : lastFocusedElement.getBoundingClientRect();
        searchBoxContainer.style.top = `${rect.top + window.scrollY}px`;
        searchBoxContainer.style.left = `${rect.left + window.scrollX}px`;

        const topRowContainer = document.createElement("div");
        topRowContainer.style.cssText = "display: flex; align-items: center;";

        input = document.createElement("input");
        Object.assign(input.style, {
            width: "200px",
            padding: "5px",
            fontSize: "14px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            display: "block"
        });
        input.type = "text";
        input.placeholder = "Type to filter templates...";
        input.autocomplete = "off";
        input.autocorrect = "off";
        input.spellcheck = false;
        input.name = "search_" + Math.random().toString(36).substr(2, 10);
        input.readOnly = true;
        input.addEventListener("focus", () => input.readOnly = false);

        const closeButton = document.createElement("button");
        closeButton.textContent = "X";
        closeButton.style.cssText = "font-size: 14px; cursor: pointer; margin-left: 5px;";
        closeButton.addEventListener("click", closeSearchBox);

        topRowContainer.append(input, closeButton);

        ul = document.createElement("ul");
        ul.style.cssText = `
            list-style: none; margin: 5px 0 0 0; padding: 0; background: white;
            border: 1px solid #ccc; border-radius: 4px; max-height: 200px;
            overflow-y: auto; display: none;
        `;

        searchBoxContainer.append(topRowContainer, ul);
        document.body.appendChild(searchBoxContainer);

        input.focus();
        input.addEventListener("input", () => handleSearch(input.value));
        input.addEventListener("keydown", handleInputNavigation, true);
        handleSearch("");
    }

    function handleSearch(query) {
        query = query.trim().toLowerCase();
        ul.innerHTML = "";
        highlightedIndex = -1;

        if (templatesLoadFailed) {
            ul.style.display = "block";
            const li = document.createElement("li");
            li.style.cssText = "padding: 8px; color: red;";
            li.textContent = "Failed to load templates. Check your connection.";
            ul.appendChild(li);
            return;
        }

        filteredTemplates = templates.filter(t =>
            t.title.toLowerCase().includes(query) ||
            t.tags.some(tag => tag.toLowerCase().includes(query))
        );

        if (filteredTemplates.length === 0) {
            ul.style.display = "none";
            return;
        }

        ul.style.display = "block";

        filteredTemplates.forEach((template, index) => {
            const li = document.createElement("li");
            li.style.cssText = `
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;
                user-select: none;
            `;
            li.tabIndex = -1;

            const title = document.createElement("span");
            title.textContent = template.title;
            title.style.flex = "1";

            const buttonContainer = document.createElement("div");
            buttonContainer.style.cssText = "display: flex; gap: 5px;";

            const buttonDE = createLangButton("DE", template.text.de, index);
            const buttonEN = createLangButton("EN", template.text.en, index);

            buttonContainer.append(buttonDE, buttonEN);
            li.append(title, buttonContainer);

            li.addEventListener("mouseenter", () => highlightResult(index));
            li.addEventListener("mouseleave", () => highlightResult(-1));
            li.addEventListener("click", () => highlightResult(index));

            ul.appendChild(li);
        });

        highlightResult(0);
    }

    function createLangButton(lang, text, index) {
        const button = document.createElement("button");
        button.textContent = lang;
        button.style.cssText = `
            padding: 5px 10px; font-size: 12px; cursor: pointer;
            border: 1px solid #ccc; border-radius: 4px;
            transition: background 0.2s, color 0.2s;
        `;

        button.addEventListener("click", (e) => {
            e.stopPropagation();
            insertTemplate(text);
            closeSearchBox();
        });

        updateButtonStyle(button, lang, index);
        return button;
    }

    function updateButtonStyle(button, lang, index) {
        if (index === highlightedIndex && lang === selectedLanguage) {
            button.style.backgroundColor = "#007bff";
            button.style.color = "white";
        } else {
            button.style.backgroundColor = "#ddd";
            button.style.color = "black";
        }
    }

    function highlightResult(index) {
        highlightedIndex = index;
        const items = ul.querySelectorAll("li");

        items.forEach((item, i) => {
            item.style.backgroundColor = i === index ? "#bde4ff" : "";

            const buttons = item.querySelectorAll("button");
            buttons.forEach((btn) => {
                const lang = btn.textContent;
                updateButtonStyle(btn, lang, i);
            });
        });

        if (index >= 0 && items[index]) {
            items[index].scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    function handleInputNavigation(event) {
        const items = ul.querySelectorAll("li");
        if (!items.length) return;

        switch (event.key) {
            case "ArrowDown":
                highlightedIndex = (highlightedIndex + 1) % filteredTemplates.length;
                highlightResult(highlightedIndex);
                break;
            case "ArrowUp":
                highlightedIndex = (highlightedIndex - 1 + filteredTemplates.length) % filteredTemplates.length;
                highlightResult(highlightedIndex);
                break;
            case "ArrowLeft":
                selectedLanguage = "DE";
                highlightResult(highlightedIndex);
                break;
            case "ArrowRight":
                selectedLanguage = "EN";
                highlightResult(highlightedIndex);
                break;
            case "Enter":
                if (highlightedIndex >= 0 && filteredTemplates.length > 0) {
                    const template = filteredTemplates[highlightedIndex];
                    insertTemplate(selectedLanguage === "DE" ? template.text.de : template.text.en);
                    closeSearchBox();
                }
                break;
            case "Escape":
                closeSearchBox();
                break;
        }
    }

    function insertTemplate(text) {
        if (!lastFocusedElement) return;
        lastFocusedElement.focus();
    
        let cleanText = text.trim().replace(/\n/g, '<br>');
        let signature = selectedLanguage === "DE" 
            ? '<br><br>Freundliche Grüße,<br>Alexander'
            : '<br><br>Kind regards,<br>Alexander';
        let wrappedText = cleanText + signature;  // Exact control
    
        if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            tinymce.activeEditor.insertContent(wrappedText);  // Use insertContent (no extra P)
            return;
        }
    
        const doc = lastIframe ? lastIframe.contentDocument : document;
        if (doc.execCommand) {
            doc.execCommand('insertHTML', false, wrappedText);
            return;
        }
        lastFocusedElement.innerHTML += wrappedText;
    }





    function closeSearchBox() {
        if (searchBoxContainer) searchBoxContainer.remove();
    }

    async function loadTemplates() {
        try {
            const response = await fetch("https://gist.githubusercontent.com/KaiserXanderW/51087d041078b96b8b702e91395331e5/raw");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            GM_setValue("templatesCache", JSON.stringify(data));
            return data;
        } catch (error) {
            console.error("Error loading templates:", error);
            const cached = GM_getValue("templatesCache", null);
            if (cached) {
                console.warn("Using cached templates.");
                return JSON.parse(cached);
            }
            return null;
        }
    }

    init();

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Restart Script", async () => {
            console.clear();
            console.log("Restarting Template Index Script!");
            await init();
        });
    }
})();
