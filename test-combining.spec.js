// Run with: npx playwright test test-combining.spec.js --reporter=list
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = 'file://' + path.resolve(__dirname, 'test-page.html');

const SEARCH_INPUT_SEL = 'input[placeholder="Type to filter templates..."]';
const CLOSING_PICKER_SEL = '#closingPicker';
const SELECTED_COUNT_SEL = '#selectedCount';
const SELECTED_SUMMARY_SEL = '#selectedSummary';
const TEXTAREA_SEL = '#test-textarea';

async function setupPage(page) {
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
        const iframe = document.querySelector('#test-iframe');
        return iframe && iframe.contentDocument && iframe.contentDocument.readyState === 'complete';
    }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
}

async function openSearchBox(page, { suppressBlur = true } = {}) {
    await page.click(TEXTAREA_SEL);
    await page.keyboard.press('F4');
    await page.waitForSelector(SEARCH_INPUT_SEL, { state: 'visible' });

    if (suppressBlur) {
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="Type to filter templates..."]');
            if (input && !input.dataset.__blurSuppressed) {
                input.dataset.__blurSuppressed = '1';
                input.addEventListener('focusout', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            }
        });
    }
}

function searchInputLocator(page) {
    return page.locator(SEARCH_INPUT_SEL);
}

async function clickTemplateLang(page, templateTitle, lang) {
    await page.evaluate(({ title, lang }) => {
        const items = document.querySelectorAll('li');
        for (const li of items) {
            if (li.textContent.includes(title)) {
                const buttons = li.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent === lang) {
                        btn.click();
                        return;
                    }
                }
            }
        }
    }, { title: templateTitle, lang });
    await page.waitForTimeout(200);
}

async function getTextareaValue(page) {
    return await page.locator(TEXTAREA_SEL).inputValue();
}

test.describe('Novomind Email Response Index — Core Flow QA', () => {

    test.beforeEach(async ({ page }) => {
        await setupPage(page);
    });

    test.afterEach(async ({ page }) => {
        await page.evaluate(() => {
            const boxes = document.querySelectorAll('#closingPicker, [style*="z-index: 10000"]');
            boxes.forEach(b => b.remove());
        });
    });

    // 1
    test('1. Single template quick-insert (Enter without clicks)', async ({ page }) => {
        await openSearchBox(page);

        const input = searchInputLocator(page);
        await input.fill('Check');

        await page.keyboard.press('Enter');

        await page.waitForSelector(CLOSING_PICKER_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        await page.keyboard.press('Enter');

        const value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).toContain('Der Check-in ist');
        expect(value).toContain('Alexander');

        await page.screenshot({ path: '.omo/evidence/task-11-1-single-insert.png', fullPage: true });
    });

    // 2
    test('2. Two-template build (click without Enter)', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await clickTemplateLang(page, 'Parking Options', 'DE');

        const value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).toContain('Der Check-in ist');
        expect(value).toContain('keinen hoteleigenen Parkplatz');

        const greetingMatches = (value.match(/Sehr geehrte Damen und Herren/g) || []).length;
        expect(greetingMatches).toBe(1);

        await page.screenshot({ path: '.omo/evidence/task-11-2-build.png', fullPage: true });
    });

    // 3
    test('3. Two-template finalize (click + Enter)', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await clickTemplateLang(page, 'Parking Options', 'DE');

        await searchInputLocator(page).click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');

        await page.waitForSelector(CLOSING_PICKER_SEL, { state: 'visible' });
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');

        const value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).toContain('Der Check-in ist');
        expect(value).toContain('keinen hoteleigenen Parkplatz');
        expect(value).toContain('Alexander');
        expect(value).toContain('Freundliche');

        await page.screenshot({ path: '.omo/evidence/task-11-3-finalize.png', fullPage: true });
    });

    // 4
    test('4. Discard on X', async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById('test-textarea').value = 'Original text';
        });
        expect(await getTextareaValue(page)).toBe('Original text');

        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');

        const afterInsert = await getTextareaValue(page);
        expect(afterInsert).not.toBe('Original text');

        const xButton = page.locator('button').filter({ hasText: /^X$/ });
        await xButton.click();
        await page.waitForTimeout(300);

        expect(await getTextareaValue(page)).toBe('Original text');

        await page.screenshot({ path: '.omo/evidence/task-11-4-discard-x.png', fullPage: true });
    });

    // 5
    test('5. Discard on blur', async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById('test-textarea').value = 'Original text';
        });

        await openSearchBox(page, { suppressBlur: false });

        await clickTemplateLang(page, 'Check-in Times', 'DE');

        await page.click('body', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);

        expect(await getTextareaValue(page)).toBe('Original text');

        await page.screenshot({ path: '.omo/evidence/task-11-5-discard-blur.png', fullPage: true });
    });

    // 6
    test('6. Filter persistence', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');

        const input = searchInputLocator(page);
        await input.fill('parking');
        await page.waitForTimeout(200);

        await expect(page.locator('li').filter({ hasText: 'Parking Options' })).toHaveCount(1);

        await clickTemplateLang(page, 'Parking Options', 'DE');

        await input.fill('');
        await page.waitForTimeout(200);

        const summary = page.locator(SELECTED_SUMMARY_SEL);
        await expect(summary).toBeVisible();
        await expect(summary).toContainText('Check-in Times');
        await expect(summary).toContainText('Parking Options');

        const counter = page.locator(SELECTED_COUNT_SEL);
        await expect(counter).toBeVisible();
        await expect(counter).toHaveText('2 selected');

        await page.screenshot({ path: '.omo/evidence/task-11-6-filter-persistence.png', fullPage: true });
    });

    // 7
    test('7. Language lock', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');

        const parkingEN = page.locator('li')
            .filter({ hasText: 'Parking Options' })
            .locator('button')
            .filter({ hasText: 'EN' });
        await expect(parkingEN).toBeVisible();

        const opacity = await parkingEN.evaluate(el => getComputedStyle(el).opacity);
        expect(parseFloat(opacity)).toBeLessThan(0.5);

        await parkingEN.click();
        await page.waitForTimeout(200);

        const value = await getTextareaValue(page);
        expect(value).not.toContain('Dear Sir or Madam');

        await page.screenshot({ path: '.omo/evidence/task-11-7-language-lock.png', fullPage: true });
    });

    // 8
    test('8. Deduplication', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await clickTemplateLang(page, 'Check-in Times', 'DE');

        const counter = page.locator(SELECTED_COUNT_SEL);
        await expect(counter).toBeVisible();
        await expect(counter).toHaveText('1 selected');

        await page.screenshot({ path: '.omo/evidence/task-11-8-dedup.png', fullPage: true });
    });

    // 9
    test('9. Escape twice — first clears selection, second discards', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(200);

        let value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).toContain('Der Check-in ist');

        await searchInputLocator(page).click();
        await page.waitForTimeout(100);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        const counter = page.locator(SELECTED_COUNT_SEL);
        await expect(counter).toBeHidden();

        value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        value = await getTextareaValue(page);
        expect(value).toBe('Original text');

        await expect(page.locator(SEARCH_INPUT_SEL)).toHaveCount(0);

        await page.screenshot({ path: '.omo/evidence/task-12-9-escape-twice.png', fullPage: true });
    });

    // 10
    test('10. Escape in closing picker — skips closing, appends signature only', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(200);

        await searchInputLocator(page).click();
        await page.waitForTimeout(100);

        await page.keyboard.press('Enter');
        await page.waitForSelector(CLOSING_PICKER_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        const value = await getTextareaValue(page);
        expect(value).toContain('Freundliche Grüße');
        expect(value).toContain('Alexander');
        expect(value).not.toContain('Wir freuen uns auf Ihre Rückmeldung');

        await page.screenshot({ path: '.omo/evidence/task-12-10-picker-escape.png', fullPage: true });
    });

    // 11
    test('11. Empty closings fallback — hardcoded defaults used', async ({ page }) => {
        await setupPage(page);
        await page.evaluate(async () => {
            const oldFetch = window.fetch;
            const MOCK_NO_CLOSINGS = {
                templates: [
                    {
                        title: "Check-in Times",
                        tags: ["check-in", "times"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nDer Check-in ist ab 15:00 Uhr möglich, der Check-out erfolgt bis 10:00 Uhr.\n\nBei weiteren Fragen stehen wir Ihnen zur Verfügung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nCheck-in starts at 3:00 PM, and check-out is by 10:00 AM.\n\nIf you have further questions you can always contact us."
                        },
                        bodyOnly: {
                            DE: "Der Check-in ist ab 15:00 Uhr möglich, der Check-out erfolgt bis 10:00 Uhr.",
                            EN: "Check-in starts at 3:00 PM, and check-out is by 10:00 AM."
                        }
                    },
                    {
                        title: "Parking Options",
                        tags: ["parking"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nLeider können wir keinen hoteleigenen Parkplatz anbieten. Eine alternative Parkmöglichkeit finden Sie unter: http://www.parkopedia.de\n\nBei weiteren Fragen stehen wir Ihnen zur Verfügung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nUnfortunately, we cannot offer on-site hotel parking. You can find alternative parking at: http://www.parkopedia.de\n\nIf you have further questions you can always contact us."
                        },
                        bodyOnly: {
                            DE: "Leider können wir keinen hoteleigenen Parkplatz anbieten. Eine alternative Parkmöglichkeit finden Sie unter: http://www.parkopedia.de",
                            EN: "Unfortunately, we cannot offer on-site hotel parking. You can find alternative parking at: http://www.parkopedia.de"
                        }
                    },
                    {
                        title: "Delayed Response Apology",
                        tags: ["apology", "delayed"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nWir entschuldigen uns für die verspätete Antwort. Aufgrund eines hohen Anfrageaufkommens sind unsere Reaktionszeiten länger als üblich.\n\nWir freuen uns auf Ihre Rückmeldung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nWe apologize for the delayed response. Due to high volume, our response times are longer than usual.\n\nWe are looking forward to hearing from you."
                        },
                        bodyOnly: {
                            DE: "Wir entschuldigen uns für die verspätete Antwort. Aufgrund eines hohen Anfrageaufkommens sind unsere Reaktionszeiten länger als üblich.",
                            EN: "We apologize for the delayed response. Due to high volume, our response times are longer than usual."
                        }
                    }
                ]
            };
            window.fetch = function(url, opts) {
                if (typeof url === 'string' && url.includes('gist.githubusercontent.com')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_NO_CLOSINGS) });
                }
                return oldFetch(url, opts);
            };
            await window.__restartScript();
        });
        await page.waitForTimeout(1000);

        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');

        await searchInputLocator(page).click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');

        await page.waitForSelector(CLOSING_PICKER_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        const pickerOptions = page.locator('#closingPicker > div:not(:first-child)');
        await expect(pickerOptions).toHaveCount(2);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        const value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).toContain('Der Check-in ist');
        expect(value).toContain('Bei weiteren Fragen stehen wir Ihnen zur Verfügung');
        expect(value).toContain('Freundliche Grüße');
        expect(value).toContain('Alexander');

        await page.screenshot({ path: '.omo/evidence/task-12-11-no-closings.png', fullPage: true });
    });

    // 12
    test('12. Template with missing bodyOnly — rule-based fallback', async ({ page }) => {
        await setupPage(page);
        await page.evaluate(async () => {
            const oldFetch = window.fetch;
            const MOCK_NO_BODYONLY = {
                templates: [
                    {
                        title: "Check-in Times",
                        tags: ["check-in", "times"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nDer Check-in ist ab 15:00 Uhr möglich, der Check-out erfolgt bis 10:00 Uhr.\n\nBei weiteren Fragen stehen wir Ihnen zur Verfügung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nCheck-in starts at 3:00 PM, and check-out is by 10:00 AM.\n\nIf you have further questions you can always contact us."
                        }
                    },
                    {
                        title: "Parking Options",
                        tags: ["parking"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nLeider können wir keinen hoteleigenen Parkplatz anbieten. Eine alternative Parkmöglichkeit finden Sie unter: http://www.parkopedia.de\n\nBei weiteren Fragen stehen wir Ihnen zur Verfügung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nUnfortunately, we cannot offer on-site hotel parking. You can find alternative parking at: http://www.parkopedia.de\n\nIf you have further questions you can always contact us."
                        }
                    },
                    {
                        title: "Delayed Response Apology",
                        tags: ["apology", "delayed"],
                        text: {
                            DE: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Nachricht.\n\nWir entschuldigen uns für die verspätete Antwort. Aufgrund eines hohen Anfrageaufkommens sind unsere Reaktionszeiten länger als üblich.\n\nWir freuen uns auf Ihre Rückmeldung.",
                            EN: "Dear Sir or Madam,\n\nThank you for your message.\n\nWe apologize for the delayed response. Due to high volume, our response times are longer than usual.\n\nWe are looking forward to hearing from you."
                        }
                    }
                ],
                closings: [
                    { de: "Bei weiteren Fragen stehen wir Ihnen zur Verfügung.", en: "If you have further questions you can always contact us." },
                    { de: "Wir freuen uns auf Ihre Rückmeldung.", en: "We are looking forward to hearing from you." }
                ]
            };
            window.fetch = function(url, opts) {
                if (typeof url === 'string' && url.includes('gist.githubusercontent.com')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_NO_BODYONLY) });
                }
                return oldFetch(url, opts);
            };
            await window.__restartScript();
        });
        await page.waitForTimeout(1000);

        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(200);

        await clickTemplateLang(page, 'Parking Options', 'DE');
        await page.waitForTimeout(200);

        const value = await getTextareaValue(page);

        expect(value).toContain('Sehr geehrte Damen und Herren');
        const greetingMatches = (value.match(/Sehr geehrte Damen und Herren/g) || []).length;
        expect(greetingMatches).toBe(1);

        expect(value).toContain('Der Check-in ist');
        expect(value).toContain('keinen hoteleigenen Parkplatz');

        await page.screenshot({ path: '.omo/evidence/task-12-12-no-bodyonly.png', fullPage: true });
    });

    // 13
    test('13. Contenteditable div', async ({ page }) => {
        await page.click('#test-contenteditable');
        await page.waitForTimeout(200);

        await page.keyboard.press('F4');
        await page.waitForSelector(SEARCH_INPUT_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="Type to filter templates..."]');
            if (input && !input.dataset.__blurSuppressed) {
                input.dataset.__blurSuppressed = '1';
                input.addEventListener('focusout', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            }
        });

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(300);

        const ce = page.locator('#test-contenteditable');
        const html = await ce.innerHTML();
        expect(html).toContain('Sehr geehrte Damen und Herren');
        expect(html).toContain('Der Check-in ist');

        await page.screenshot({ path: '.omo/evidence/task-12-13-contenteditable.png', fullPage: true });
    });

    // 14
    test('14. Iframe contenteditable', async ({ page }) => {
        const frame = page.mainFrame().childFrames()[0];

        await frame.locator('body').click();
        await page.waitForTimeout(300);

        await frame.evaluate(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'F4', code: 'F4', keyCode: 115, which: 115,
                bubbles: true, cancelable: true, composed: true
            }));
        });
        await page.waitForSelector(SEARCH_INPUT_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="Type to filter templates..."]');
            if (input && !input.dataset.__blurSuppressed) {
                input.dataset.__blurSuppressed = '1';
                input.addEventListener('focusout', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            }
        });

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(300);

        const bodyText = await frame.locator('body').innerText();
        expect(bodyText).toContain('Sehr geehrte Damen und Herren');
        expect(bodyText).toContain('Der Check-in ist');

        await page.screenshot({ path: '.omo/evidence/task-12-14-iframe.png', fullPage: true });
    });

    // 15
    test('15. ArrowLeft/Right blocked when locked', async ({ page }) => {
        await openSearchBox(page);

        await clickTemplateLang(page, 'Check-in Times', 'DE');
        await page.waitForTimeout(200);

        await searchInputLocator(page).click();
        await page.waitForTimeout(100);

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        await page.keyboard.press('Enter');
        await page.waitForSelector(CLOSING_PICKER_SEL, { state: 'visible' });
        await page.waitForTimeout(200);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        const value = await getTextareaValue(page);
        expect(value).toContain('Sehr geehrte Damen und Herren');
        expect(value).not.toContain('Dear Sir or Madam');
        expect(value).toContain('Freundliche Grüße');
        expect(value).not.toContain('Kind regards');

        await page.screenshot({ path: '.omo/evidence/task-12-15-arrow-locked.png', fullPage: true });
    });

});
