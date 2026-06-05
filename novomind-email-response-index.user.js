// ==UserScript==
// @name         novomind-email-response-index
// @namespace    https://example.com
// @version      7.19
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
    let selectedIndices = new Set(); // stores indices into original `templates` array (stable across filter changes)
    let observer = null;
    let selectedCountDiv = null;
    let selectedSummaryEl = null;
    let selectedNamesEl = null;
    let languageLocked = false;
    let preF4FieldContent = null;
    let pickerActive = false;
    let selectedClosingIndex = 0;
    let closings = [];
    let discardTimer = null;


    async function init() {
        console.log("Template Index Script: init() called.");

        document.removeEventListener("focusin", trackFocusedElement);
        document.removeEventListener("keydown", globalKeyListener);

        document.addEventListener("focusin", trackFocusedElement, { capture: true });
        document.addEventListener("keydown", globalKeyListener, { capture: true });

        if (observer) observer.disconnect();
        observer = new MutationObserver(setupIframeListeners);
        observer.observe(document.body, { childList: true, subtree: true });

        setupIframeListeners();
        const loaded = await loadTemplates();
        if (loaded.templates === null) {
            templatesLoadFailed = true;
            templates = [];
        } else {
            templatesLoadFailed = false;
            templates = loaded.templates;
        }
        closings = loaded.closings || [];
    }

    function setupIframeListeners() {
        document.querySelectorAll("iframe").forEach((iframe) => {
            if (iframe.contentDocument && !iframe.dataset.scriptListener) {
                iframe.dataset.scriptListener = "true";
                iframe.contentDocument.addEventListener("focusin", (e) => trackFocusedElementInIframe(e, iframe), { capture: true });
                iframe.contentDocument.addEventListener("keydown", (e) => globalKeyListenerInIframe(e, iframe), { capture: true });

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

        if (event.key === "F4") {
            event.preventDefault();
            event.stopPropagation();
            createSearchBox();
        }
    }

    function globalKeyListenerInIframe(event, iframe) {

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

    function getCurrentFieldContent() {
        if (!lastFocusedElement) return '';
        if (lastIframe && typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            return tinymce.activeEditor.getContent();
        }
        if (lastFocusedElement.tagName === 'TEXTAREA' || (lastFocusedElement.tagName === 'INPUT' && lastFocusedElement.type === 'text')) {
            return lastFocusedElement.value;
        }
        return lastFocusedElement.innerHTML || '';
    }

    function restoreFieldContent(content) {
        if (!lastFocusedElement) return;
        if (lastIframe && typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            tinymce.activeEditor.setContent(content);
            return;
        }
        if (lastFocusedElement.tagName === 'TEXTAREA' || (lastFocusedElement.tagName === 'INPUT' && lastFocusedElement.type === 'text')) {
            lastFocusedElement.value = content;
            return;
        }
        lastFocusedElement.innerHTML = content;
    }

    function createSearchBox() {
        if (searchBoxContainer) {
            searchBoxContainer.remove();
            searchBoxContainer = null;
            // Reset state when re-opening (user pressed F4 again without closing properly)
            selectedIndices.clear();
            languageLocked = false;
            preF4FieldContent = null;
        }

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
        closeButton.addEventListener("click", () => closeSearchBox({ discard: true }));

        topRowContainer.append(input, closeButton);

        // Selected templates summary (shown below search input when count > 0)
        selectedSummaryEl = document.createElement("div");
        selectedSummaryEl.id = "selectedSummary";
        selectedSummaryEl.style.cssText = "font-size: 12px; padding: 4px 5px; color: #007bff; display: none;";
        selectedNamesEl = document.createElement("span");
        selectedNamesEl.id = "selectedNames";
        selectedSummaryEl.appendChild(document.createTextNode("Selected templates: "));
        selectedSummaryEl.appendChild(selectedNamesEl);

        // Title bar
        const titleBar = document.createElement("div");
        titleBar.style.cssText = "font-size: 12px; font-weight: bold; padding: 4px 5px; background: #007bff; color: white; border-radius: 3px 3px 0 0; margin-bottom: 4px;";
        titleBar.textContent = "Email Templates";
        searchBoxContainer.insertBefore(titleBar, searchBoxContainer.firstChild);

        ul = document.createElement("ul");
        ul.style.cssText = `
            list-style: none; margin: 5px 0 0 0; padding: 0; background: white;
            border: 1px solid #ccc; border-radius: 4px; max-height: 200px;
            overflow-y: auto; display: none;
        `;

        // "N selected" counter (shown between summary and list)
        selectedCountDiv = document.createElement("div");
        selectedCountDiv.id = "selectedCount";
        selectedCountDiv.style.cssText = "font-size: 12px; padding: 4px 8px; color: #007bff; display: none; border-bottom: 1px solid #eee;";

        searchBoxContainer.append(topRowContainer, selectedSummaryEl, selectedCountDiv, ul);
        document.body.appendChild(searchBoxContainer);

        // Save current field content for potential discard on blur/close
        preF4FieldContent = getCurrentFieldContent();

        // Blur/discard handler — discard all inserted text when focus leaves container
        searchBoxContainer.addEventListener('focusout', (e) => {
            if (discardTimer) clearTimeout(discardTimer);
            discardTimer = setTimeout(() => {
                discardTimer = null;
                if (pickerActive) return;
                if (!searchBoxContainer || !searchBoxContainer.contains(document.activeElement)) {
                    closeSearchBox({ discard: true });
                }
            }, 100);
        });

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

            const stableIndex = templates.indexOf(template);
            if (selectedIndices.has(stableIndex)) {
                li.style.borderLeft = '3px solid #007bff';
                li.style.backgroundColor = '#f0f7ff';
            }

            const title = document.createElement("span");
            title.textContent = template.title;
            title.style.flex = "1";

            const buttonContainer = document.createElement("div");
            buttonContainer.style.cssText = "display: flex; gap: 5px;";

            const buttonDE = createLangButton("DE", template.text.de, index);
            const buttonEN = createLangButton("EN", template.text.en, index);

            buttonContainer.append(buttonDE, buttonEN);
            li.append(title, buttonContainer);

            li.addEventListener("mouseenter", () => {
                const stableIdx = templates.indexOf(template);
                const isSelected = selectedIndices.has(stableIdx);
                if (!isSelected) li.style.backgroundColor = '#e8e8e8';
            });
            li.addEventListener("mouseleave", () => {
                const stableIdx = templates.indexOf(template);
                const isSelected = selectedIndices.has(stableIdx);
                if (!isSelected) li.style.backgroundColor = '';
            });
            li.addEventListener("click", () => highlightResult(index));

            ul.appendChild(li);
        });

        highlightResult(0);

        if (selectedCountDiv) {
            if (selectedIndices.size > 0) {
                selectedCountDiv.style.display = 'block';
                selectedCountDiv.textContent = selectedIndices.size + ' selected';
            } else {
                selectedCountDiv.style.display = 'none';
            }
        }

        if (selectedSummaryEl && selectedNamesEl) {
            if (selectedIndices.size > 0) {
                selectedSummaryEl.style.display = 'block';
                let names = [];
                for (let idx of selectedIndices) {
                    if (idx < templates.length) {
                        names.push(templates[idx].title);
                    }
                }
                selectedNamesEl.textContent = names.join(', ');
            } else {
                selectedSummaryEl.style.display = 'none';
            }
        }
    }

    function createLangButton(lang, text, index) {
        const button = document.createElement("button");
        button.textContent = lang;
        button.style.cssText = `
            padding: 5px 10px; font-size: 12px; cursor: pointer;
            border: 1px solid #ccc; border-radius: 4px;
            transition: background 0.2s, color 0.2s, opacity 0.2s;
        `;

        button.addEventListener("click", (e) => {
            e.stopPropagation();
            
            // Language lock: if locked and this button is the wrong language, ignore
            if (languageLocked && lang !== selectedLanguage) return;
            
            // Dedup: if already selected, no-op
            if (selectedIndices.has(templates.indexOf(filteredTemplates[index]))) return;
            
            // First selection: lock language
            if (selectedIndices.size === 0) {
                selectedLanguage = lang;
                languageLocked = true;
            }
            
            // Track selection
            selectedIndices.add(templates.indexOf(filteredTemplates[index]));
            
            // Append template body (first = greeting+body, subsequent = body-only)
            const isFirst = selectedIndices.size === 1;
            appendTemplateBody(filteredTemplates[index], isFirst, selectedLanguage);
            
            // Update UI 
            handleSearch(input.value); // re-render to show selection visuals
        });

        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#007bff';
            button.style.color = 'white';
        });
        button.addEventListener('mouseleave', () => {
            updateButtonStyle(button, lang, index);
        });

        updateButtonStyle(button, lang, index);
        return button;
    }

    function updateButtonStyle(button, lang, index) {
        // Language lock: dim opposite-language buttons
        if (languageLocked && lang !== selectedLanguage) {
            button.style.opacity = '0.4';
            button.style.cursor = 'not-allowed';
        } else {
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
        
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
            if (i === index) {
                item.style.backgroundColor = "#bde4ff";
            } else if (selectedIndices.size > 0 && i < filteredTemplates.length) {
                const stableIdx = templates.indexOf(filteredTemplates[i]);
                if (selectedIndices.has(stableIdx)) {
                    item.style.backgroundColor = "#f0f7ff";
                } else {
                    item.style.backgroundColor = "";
                }
            } else {
                item.style.backgroundColor = "";
            }

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
                if (languageLocked) return;
                selectedLanguage = "DE";
                highlightResult(highlightedIndex);
                break;
            case "ArrowRight":
                if (languageLocked) return;
                selectedLanguage = "EN";
                highlightResult(highlightedIndex);
                break;
            case "Enter":
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                    // Shift+Enter: finalize - auto-close if 0-1 templates, picker if 2+
                    if (selectedIndices.size === 0 && highlightedIndex >= 0) {
                        appendTemplateBody(filteredTemplates[highlightedIndex], true, selectedLanguage);
                        finalizeAndClose();
                    } else if (selectedIndices.size === 1) {
                        finalizeAndClose();
                    } else if (selectedIndices.size > 1) {
                        showClosingPicker();
                    }
                } else {
                    // Enter: select highlighted entry (like clicking DE/EN) — just select, no close
                    if (highlightedIndex >= 0 && filteredTemplates.length > 0 && !selectedIndices.has(templates.indexOf(filteredTemplates[highlightedIndex]))) {
                        // Simulate clicking the language button
                        if (selectedIndices.size === 0) {
                            languageLocked = true;
                        }
                        selectedIndices.add(templates.indexOf(filteredTemplates[highlightedIndex]));
                        const isFirst = selectedIndices.size === 1;
                        appendTemplateBody(filteredTemplates[highlightedIndex], isFirst, selectedLanguage);
                        handleSearch(input.value);
                    }
                }
                break;
            case "Escape":
                if (selectedIndices.size > 0) {
                    // First press: clear selection (text stays in field)
                    selectedIndices.clear();
                    languageLocked = false;
                    handleSearch(input.value); // re-render to clear selection visuals
                } else {
                    // Second press: discard + close
                    closeSearchBox({ discard: true });
                }
                break;
        }
    }

    function getBodyOnly(template, lang) {
        // Handle both lowercase (Gist) and uppercase (test mock) keys
        const bodyText = template.bodyOnly && (template.bodyOnly[lang] || template.bodyOnly[lang.toUpperCase()]);
        if (bodyText) return bodyText;
        const textKey = template.text[lang] ? lang : lang.toUpperCase();
        let text = template.text[textKey];
        // Strip greeting
        text = text.replace(/^(Sehr geehrte Damen und Herren,|Dear Sir or Madam,)\n\n/, '');
        // Strip opening line
        text = text.replace(/^(vielen Dank für Ihre Nachricht\.|Thank you for your message\.)\n\n/, '');
        // Strip closing
        text = text.replace(/\n\n(Bei weiteren Fragen stehen wir Ihnen (gerne )?zur Verfügung[.!]?|Wir freuen uns auf Ihre Rückmeldung\.?|If you have further questions you can always contact us\.?|We are looking forward to hearing from you\.?|If you have any questions, feel free to ask!)$/, '');
        return text.trim();
    }

    function appendTemplateBody(template, isFirst, lang) {
        if (!lastFocusedElement) return;
        // Handle both lowercase (Gist) and uppercase (test mock) keys
        const langKey = template.text[lang.toLowerCase()] ? lang.toLowerCase() : lang.toUpperCase();
        let text;
        if (isFirst) {
            text = template.text[langKey].trim();
            text = text.replace(/\n\n(Bei weiteren Fragen stehen wir Ihnen (gerne )?zur Verfügung[.!]?|Wir freuen uns auf Ihre Rückmeldung\.?|If you have further questions you can always contact us\.?|We are looking forward to hearing from you\.?|If you have any questions, feel free to ask!)$/, '');
            text = text.replace(/\n/g, '<br>');
        } else {
            // Subsequent templates: body-only
            text = getBodyOnly(template, lang.toLowerCase()).replace(/\n/g, '<br>');
        }
        lastFocusedElement.focus();
        if (typeof tinymce !== 'undefined' && lastIframe) {
            const editors = tinymce.get();
            const editor = editors.find(e => {
                try { return e.getBody() === lastFocusedElement; } catch (ex) { return false; }
            });
            if (editor) {
                editor.focus();
                editor.insertContent(text);
            } else if (tinymce.activeEditor) {
                tinymce.activeEditor.insertContent(text);
            } else {
                const doc = lastIframe.contentDocument;
                doc.execCommand('insertHTML', false, text);
            }
        } else if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            tinymce.activeEditor.insertContent(text);
        } else {
            const doc = lastIframe ? lastIframe.contentDocument : document;
            if (doc.execCommand) {
                doc.execCommand('insertHTML', false, text);
            } else {
                lastFocusedElement.innerHTML += text;
            }
        }
        if (input) input.focus();
    }

    function finalizeAndClose() {
        if (!lastFocusedElement) return;
        if (discardTimer) clearTimeout(discardTimer);
        lastFocusedElement.focus();
        let closing = '';
        if (closings.length > 0 && selectedClosingIndex >= 0 && selectedClosingIndex < closings.length) {
            closing = selectedLanguage === 'DE' ? closings[selectedClosingIndex].de : closings[selectedClosingIndex].en;
        }
        let signature = selectedLanguage === 'DE'
            ? '<br><br>Freundliche Grüße,<br>Alexander'
            : '<br><br>Kind regards,<br>Alexander';
        let wrappedText = '';
        if (closing) {
            wrappedText = '<br><br>' + closing.replace(/\n/g, '<br>') + signature;
        } else {
            wrappedText = signature;
        }
        if (typeof tinymce !== 'undefined' && lastIframe) {
            const editors = tinymce.get();
            const editor = editors.find(e => {
                try { return e.getBody() === lastFocusedElement; } catch (ex) { return false; }
            });
            if (editor) {
                editor.focus();
                editor.insertContent(wrappedText);
            } else if (tinymce.activeEditor) {
                tinymce.activeEditor.insertContent(wrappedText);
            } else {
                const doc = lastIframe.contentDocument;
                doc.execCommand('insertHTML', false, wrappedText);
            }
        } else if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            tinymce.activeEditor.insertContent(wrappedText);
        } else {
            const doc = lastIframe ? lastIframe.contentDocument : document;
            if (doc.execCommand) {
                doc.execCommand('insertHTML', false, wrappedText);
            } else {
                lastFocusedElement.innerHTML += wrappedText;
            }
        }
        if (input) input.focus();
        closeSearchBox();
    }

    function showClosingPicker() {
        pickerActive = true;
        const existing = document.getElementById('closingPicker');
        if (existing) existing.remove();

        const pickerContainer = document.createElement('div');
        pickerContainer.id = 'closingPicker';
        Object.assign(pickerContainer.style, {
            position: 'absolute',
            zIndex: '10001',
            background: 'white',
            border: '1px solid #007bff',
            borderRadius: '4px',
            padding: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontFamily: 'Arial, sans-serif',
            minWidth: '300px'
        });

        if (lastFocusedElement) {
            const rect = lastIframe ? lastIframe.getBoundingClientRect() : lastFocusedElement.getBoundingClientRect();
            pickerContainer.style.top = (rect.top + window.scrollY) + 'px';
            pickerContainer.style.left = (rect.left + window.scrollX) + 'px';
        }

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 13px;';
        title.textContent = 'Select closing:';
        pickerContainer.appendChild(title);

        const DEFAULT_CLOSINGS = [
            { de: "Bei weiteren Fragen stehen wir Ihnen zur Verfügung.", en: "If you have further questions you can always contact us." },
            { de: "Wir freuen uns auf Ihre Rückmeldung.", en: "We are looking forward to hearing from you." }
        ];
        const options = (closings && closings.length > 0) ? closings : DEFAULT_CLOSINGS;

        let pickerHighlightedIndex = 0;

        const optionDivs = options.map(function(opt, idx) {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 6px 10px; cursor: pointer; border-radius: 3px;';
            div.textContent = selectedLanguage === 'DE' ? opt.de : opt.en;
            div.addEventListener('mouseenter', function() { highlightPickerOption(idx); });
            div.addEventListener('click', function() { selectClosing(idx); });
            return div;
        });

        optionDivs.forEach(function(div) { pickerContainer.appendChild(div); });

        if (optionDivs.length > 0) {
            optionDivs[0].style.background = '#e8f0fe';
        }

        function highlightPickerOption(idx) {
            pickerHighlightedIndex = idx;
            optionDivs.forEach(function(div, i) {
                div.style.background = i === idx ? '#e8f0fe' : '';
            });
        }

        function selectClosing(idx) {
            if (closings && closings.length > 0) {
                selectedClosingIndex = idx;
            } else {
                selectedClosingIndex = -1;
                const closingText = options[idx];
                const closingHtml = '<br><br>' + (selectedLanguage === 'DE' ? closingText.de : closingText.en).replace(/\n/g, '<br>');
                if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
                    tinymce.activeEditor.insertContent(closingHtml);
                } else {
                    const doc = lastIframe ? lastIframe.contentDocument : document;
                    if (doc.execCommand) {
                        doc.execCommand('insertHTML', false, closingHtml);
                    } else {
                        lastFocusedElement.innerHTML += closingHtml;
                    }
                }
            }
            pickerContainer.remove();
            finalizeAndClose();
        }

        function skipClosing() {
            selectedClosingIndex = -1;
            pickerContainer.remove();
            if (searchBoxContainer) searchBoxContainer.style.display = '';
            finalizeAndClose();
        }

        pickerContainer.addEventListener('keydown', function(e) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    pickerHighlightedIndex = (pickerHighlightedIndex + 1) % options.length;
                    highlightPickerOption(pickerHighlightedIndex);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    pickerHighlightedIndex = (pickerHighlightedIndex - 1 + options.length) % options.length;
                    highlightPickerOption(pickerHighlightedIndex);
                    break;
                case 'Enter':
                    e.preventDefault();
                    e.stopPropagation();
                    selectClosing(pickerHighlightedIndex);
                    break;
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    skipClosing();
                    break;
            }
        });

        pickerContainer.tabIndex = -1;

        if (searchBoxContainer) {
            searchBoxContainer.style.display = 'none';
        }

        document.body.appendChild(pickerContainer);
        pickerContainer.focus();

        requestAnimationFrame(() => {
            const pickerRect = pickerContainer.getBoundingClientRect();
            if (pickerRect.bottom > window.innerHeight && searchBoxContainer) {
                const searchRect = searchBoxContainer.getBoundingClientRect();
                pickerContainer.style.top = (searchRect.top + window.scrollY - pickerRect.height - 4) + 'px';
            }
            if (pickerRect.right > window.innerWidth) {
                pickerContainer.style.left = (window.innerWidth - pickerRect.width - 10 + window.scrollX) + 'px';
            }
        });
    }

    function closeSearchBox({ discard } = {}) {
        if (discardTimer) { clearTimeout(discardTimer); discardTimer = null; }
        if (discard && preF4FieldContent !== null) {
            restoreFieldContent(preF4FieldContent);
        }
        pickerActive = false;
        if (searchBoxContainer) searchBoxContainer.remove();
        searchBoxContainer = null;
        selectedIndices.clear();
        languageLocked = false;
        preF4FieldContent = null;
    }

    async function loadTemplates() {
        try {
            const response = await fetch("https://gist.githubusercontent.com/KaiserXanderW/51087d041078b96b8b702e91395331e5/raw");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            GM_setValue("templatesCache", JSON.stringify(data));
            return { templates: data.templates || data, closings: data.closings || [] };
        } catch (error) {
            console.error("Error loading templates:", error);
            const cached = GM_getValue("templatesCache", null);
            if (cached) {
                console.warn("Using cached templates.");
                const parsed = JSON.parse(cached);
                return { templates: parsed.templates || parsed, closings: parsed.closings || [] };
            }
            return { templates: null, closings: [] };
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
