// ==UserScript==
// @name     BestBuy-RefreshNoBot
// @include  https://www.bestbuy.com/*
// @updateURL  https://raw.githubusercontent.com/alexh/best-buy-bot/main/best-buy-tm.js
// @downloadURL https://raw.githubusercontent.com/alexh/best-buy-bot/main/best-buy-tm.js
// @version      5.0
// @description  Best Buy Tampermonkey automation fork
// @author       alexh, forked from Karan Kapuria
// @grant        window.close

// ==/UserScript==

"use strict";

//________________________________________________________________________
// User Configuration
//________________________________________________________________________
 
 //____ REQUIRED FLAGS ____________________________________________________
 
const ITEM_KEYWORD= "5090"; // Comma-separated keywords, every term must match. Example: "ASUS,5090"
const CREDITCARD_CVV = "***"; // BOT will run without changing this value.
const BEST_BUY_PASSWORD = "REPLACE_WITH_BB_PASSWORD";
const TESTMODE = "Yes"; // TESTMODE = "No" will buy the card
const SMS_DIGITS = "1111"; // Enter last 4 digits of phone # for SMS verification (required for verification)
const PREFERRED_SHIPPING = "Yes" // "Yes" will select shipping option if available
const SHIPPING_FIRST_NAME = "John";
const SHIPPING_LAST_NAME = "Smith";
const SHIPPING_ADDRESS_1 = "100 Resellers Beware St";
const SHIPPING_ADDRESS_2 = "Apt 1A";
const SHIPPING_CITY = "Boise";
const SHIPPING_STATE = "IN";
const SHIPPING_ZIP = "83703";
const SOUND_ENABLED = "Yes";
const SOUND_BASE_URL = "https://raw.githubusercontent.com/alexh/best-buy-bot/main/assets/audio";
const BOT_ICON_URL = "https://raw.githubusercontent.com/alexh/best-buy-bot/main/assets/images/bot-icon.png";
const SOUND_FILES = {
    addToCartClicked: "add-to-cart-clicked.mp3",
    cartConfirmed: "cart-confirmed.mp3",
    checkoutPageReady: "checkout-page-ready.mp3",
    manualConfirmationRequired: "manual-confirmation-required.mp3",
    stockDetected: "stock-detected.mp3"
};
 
 //____ PLEASE WAIT FLAGS : ADVANCED OPTIONS _____________________________
 
 //const QUEUE_TIME_CUTOFF = 0 // (in Minutes) Keep retrying until queue time is below.
 //onst NEW_QUEUE_TIME_DELAY = 5 // (in Seconds) Ask new queue time set seconds
 const OOS_REFRESH = 10          // (in Seconds) Base refresh rate on OOS item.
const OOS_JITTER_MAX = 5        // (in Seconds) Max random extra delay added to each refresh.
const OOS_DECOY_THRESHOLD = 5   // Consecutive OOS hits before taking a decoy browse trip.
const OOS_DECOY_AWAY_MIN = 15   // (in Seconds) Min time to spend on decoy page.
const OOS_DECOY_AWAY_MAX = 30   // (in Seconds) Max time to spend on decoy page.
 
 //____ LAZY FLAGS : WILL NOT AFFECT BOT PERFORMACE _____________________
 
 const MAX_RETRIES = "500" // Fossil of EARTH
 
 //________________________________________________________________________
 
 // Audio
 //________________________________________________________________________
 
const playedSoundGuards = new Set();
let activeAudio = null;
let consecutiveOosCount = 0;
const REQUIRED_KEYWORDS = String(ITEM_KEYWORD)
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);

function matchesRequiredKeywords(text) {
    if (!REQUIRED_KEYWORDS.length) {
        return true;
    }

    const normalizedText = String(text || "").toLowerCase();
    return REQUIRED_KEYWORDS.every((keyword) => normalizedText.includes(keyword));
}

function playSound(eventName, guardKey = "") {
    if (SOUND_ENABLED !== "Yes") {
        return;
    }

    const soundFile = SOUND_FILES[eventName];
    if (!soundFile) {
        return;
    }

    if (guardKey && playedSoundGuards.has(guardKey)) {
        return;
    }

    if (guardKey) {
        playedSoundGuards.add(guardKey);
    }

    if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio = null;
    }

    const audio = new Audio(`${SOUND_BASE_URL}/${soundFile}`);
    activeAudio = audio;
    audio.addEventListener("ended", () => {
        if (activeAudio === audio) {
            activeAudio = null;
        }
    }, { once: true });
    audio.play().catch((err) => {
        if (activeAudio === audio) {
            activeAudio = null;
        }
        if (err?.name === "NotAllowedError") {
            return;
        }
        console.error("Audio play failed:", err);
    });
}
 
 //________________________________________________________________________
 
 // Queue Timer Functions
 //________________________________________________________________________
 
 function n(e, t) {
     return parseInt(e, t)
 }
 
 function r(e, t) {
     return e[t]
 }
 
 function getQueueTimeFromEncodedString(e) {
     var t = ("-", e.split("-")),
         l = t.map((function (e) {
             return n(e, 16)
         }));
     return function (e) {
         return 1e3 * e
     }(function (e, t) {
         return e / t
     }(n(function (e, t) {
         return e + t
     }(r(t, 2), r(t, 3)), 16), r(l, 1)))
 }
 
 function getRecordForSku(sku){
     const queues= JSON.parse(atob(localStorage.getItem('purchaseTracker')));
     console.log(queues);
 
     const skuQueue = queues[sku];
     if(!skuQueue){
         return null;
     }
     return skuQueue;
 }
 
 function getQueueTimeStartMs(sku){
     return getRecordForSku(sku)[0];
 }
 
function getQueueDurationMs(sku){
    return getQueueTimeFromEncodedString(getRecordForSku(sku)[2]);
}

function getSkuFromPage() {
    const urlSku = new URL(location.href).searchParams.get("skuId");
    if (urlSku) {
        return urlSku;
    }

    const cartSku = Array.from(document.querySelectorAll("section.card[data-test-sku], .fluid-item[data-test-sku]"))
        .find((element) => matchesRequiredKeywords(element.textContent || ""))
        ?.getAttribute("data-test-sku");
    if (cartSku) {
        return cartSku;
    }

    const bodySku = document.body?.innerText?.match(/SKU:\s*(\d{6,})/i)?.[1];
    if (bodySku) {
        return bodySku;
    }

    const pdpAddToCartSku = document.getElementById("a2c")
        ?.querySelector('button[data-testid^="pdp-add-to-cart-"]')
        ?.getAttribute("data-testid")
        ?.match(/(\d{6,})$/)?.[1];
    if (pdpAddToCartSku) {
        return pdpAddToCartSku;
    }

    const pdpShippingSku = document
        .querySelector('[data-testid^="pdp-shipping-"]')
        ?.getAttribute("data-testid")
        ?.match(/(\d{6,})$/)?.[1];
    if (pdpShippingSku) {
        return pdpShippingSku;
    }

    return null;
}
 
function getShippingOption() {
    const shippingSelector = sku
        ? `[data-testid="pdp-shipping-${sku}"]`
        : '[data-testid^="pdp-shipping-"]';
    const shippingLabel = Array.from(document.querySelectorAll(shippingSelector))
        .find((element) => isVisible(element));
    return shippingLabel?.closest('[role="radio"]') ?? shippingLabel ?? null;
}

function getPdpShippingLabel() {
    const shippingSelector = sku
        ? `[data-testid="pdp-shipping-${sku}"]`
        : '[data-testid^="pdp-shipping-"]';

    return Array.from(document.querySelectorAll(shippingSelector))
        .find((element) => isVisible(element)) ?? null;
}

function ensureSku() {
    if (sku) {
        return sku;
    }

    sku = getSkuFromPage();
    console.log("refreshed sku", sku);
    return sku;
}

function getTargetCartTitleElement() {
    ensureSku();

    if (sku) {
        const skuContainer = document.querySelector(`section.card[data-test-sku="${sku}"], .fluid-item[data-test-sku="${sku}"]`);
        const skuTitle = skuContainer?.querySelector(".cart-item__title, .location-fulfillment-item__title");
        if (skuTitle) {
            return skuTitle;
        }
    }

    return Array.from(document.querySelectorAll(".cart-item__title, .location-fulfillment-item__title, a, div"))
        .find((element) => {
            if (!isVisible(element)) {
                return false;
            }

            const text = (element.textContent || "").trim();
            return text.length > 0 && matchesRequiredKeywords(text);
        }) || null;
}

function getTargetCartItemContainer() {
    ensureSku();

    if (sku) {
        const skuContainer = document.querySelector(`section.card[data-test-sku="${sku}"], .fluid-item[data-test-sku="${sku}"]`);
        if (skuContainer) {
            return skuContainer;
        }
    }

    const titleElement = getTargetCartTitleElement();
    if (!titleElement) {
        return null;
    }

    let current = titleElement;
    while (current && current !== document.body) {
        const text = (current.textContent || "").toLowerCase();
        if (text.includes("pickup") || text.includes("shipping")) {
            return current;
        }
        current = current.parentElement;
    }

    return titleElement.parentElement || null;
}

function getCartLineItems() {
    return Array.from(document.querySelectorAll("section.card[data-test-sku], .fluid-item[data-test-sku]"));
}

function getMatchingCartLineItems() {
    return getCartLineItems().filter((element) => matchesRequiredKeywords(element.textContent || ""));
}

function isCartCleanForCheckout() {
    const cartLineItems = getCartLineItems();
    const matchingItems = getMatchingCartLineItems();

    return cartLineItems.length === 1 && matchingItems.length === 1;
}

function getCartShippingEntry() {
    const searchRoot = getTargetCartItemContainer() || document;

    return Array.from(searchRoot.querySelectorAll(".availability__entry"))
        .find((element) => {
            const text = (element.textContent || "").trim().toLowerCase();
            return text.includes("free shipping") || text.includes("shipping to");
        }) || null;
}

function getCartShippingOption() {
    const shippingEntry = getCartShippingEntry();
    if (shippingEntry) {
        return (
            shippingEntry.querySelector(".availability__body") ||
            shippingEntry.querySelector('label[for^="fulfillment-shipping-"]') ||
            shippingEntry.querySelector("input[id^='fulfillment-shipping-']") ||
            shippingEntry
        );
    }

    const searchRoot = getTargetCartItemContainer() || document;

    const shippingInput = Array.from(searchRoot.querySelectorAll("input[id^='fulfillment-shipping-']"))
        .find((element) => isVisible(element) || element.offsetParent !== null);
    if (shippingInput) {
        return (
            searchRoot.querySelector(`label[for="${shippingInput.id}"]`) ||
            shippingInput.closest("label") ||
            shippingInput.closest('[role="radio"]') ||
            shippingInput
        );
    }

    const shippingRadio = Array.from(searchRoot.querySelectorAll('[role="radio"], label, button, div'))
        .find((element) => {
            if (!isVisible(element)) {
                return false;
            }

            const text = (element.textContent || "").trim().toLowerCase();
            if (!text.includes("shipping")) {
                return false;
            }

            if (text.includes("return") || text.includes("exchange")) {
                return false;
            }

            return text.includes("get it by") || text.includes("ship") || text.includes("delivery");
        });

    return shippingRadio ?? null;
}

function isPdpShippingSelected() {
    const shippingLabel = getPdpShippingLabel();
    const shippingOption = getShippingOption();

    if (!shippingLabel && !shippingOption) {
        return false;
    }

    const selectedRadio = shippingLabel?.closest('[role="radio"][aria-checked="true"]');
    if (selectedRadio) {
        return true;
    }

    if (shippingOption?.getAttribute("aria-checked") === "true") {
        return true;
    }

    const selectedContainer =
        shippingLabel?.closest(".border-selected") ||
        shippingLabel?.closest(".border-comp-outline-primary") ||
        shippingOption?.closest?.(".border-selected") ||
        shippingOption?.closest?.(".border-comp-outline-primary");

    return Boolean(selectedContainer);
}

function isCartShippingSelected() {
    const searchRoot = getTargetCartItemContainer() || document;

    const selectedShippingInput = searchRoot.querySelector("input[id^='fulfillment-shipping-']:checked");
    if (selectedShippingInput) {
        return true;
    }

    const selectedShippingEntry = Array.from(searchRoot.querySelectorAll(".availability__entry"))
        .find((element) => {
            const text = (element.textContent || "").trim().toLowerCase();
            const input = element.querySelector("input[id^='fulfillment-shipping-']");
            return (text.includes("free shipping") || text.includes("shipping to")) && Boolean(input?.checked);
        });

    return Boolean(selectedShippingEntry);
}

function clickElement(element) {
    if (!element) {
        return;
    }

    try {
        if (typeof element.scrollIntoView === "function") {
            element.scrollIntoView({ block: "center", inline: "center" });
        }
    } catch (error) {
        console.warn("scrollIntoView failed", error);
    }

    try {
        if (typeof element.focus === "function") {
            element.focus({ preventScroll: true });
        }
    } catch (error) {
        console.warn("focus failed", error);
    }

    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
        try {
            const EventCtor = eventName.startsWith("pointer") && typeof window.PointerEvent === "function"
                ? window.PointerEvent
                : window.MouseEvent;
            element.dispatchEvent(new EventCtor(eventName, {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                buttons: 1
            }));
        } catch (error) {
            console.warn(`Synthetic ${eventName} failed`, error);
        }
    });

}

function activateRadioElement(element) {
    if (!element) {
        return;
    }

    if (typeof element.focus === "function") {
        element.focus();
    }

    [" ", "Enter"].forEach((key) => {
        element.dispatchEvent(new KeyboardEvent("keydown", {
            key,
            code: key === " " ? "Space" : "Enter",
            bubbles: true,
            cancelable: true
        }));
        element.dispatchEvent(new KeyboardEvent("keyup", {
            key,
            code: key === " " ? "Space" : "Enter",
            bubbles: true,
            cancelable: true
        }));
    });
}

function setRadioChecked(input) {
    if (!input) {
        return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked");
    descriptor?.set?.call(input, true);
    input.setAttribute("checked", "checked");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setInputValue(input, value) {
    if (!input) {
        return false;
    }

    const prototype = input.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(input, value);
    input.setAttribute("value", value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
}

function setSelectValue(select, value) {
    if (!select) {
        return false;
    }

    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
}

function getAddress2Input() {
    return (
        document.querySelector("#street2") ||
        document.querySelector("input[name='street2']") ||
        document.querySelector("input[autocomplete='address-line2']") ||
        null
    );
}

function getPasswordInput() {
    return (
        document.getElementById("fld-p1") ||
        document.querySelector('input[type="password"]') ||
        document.querySelector('input[name="fld-p1"]') ||
        document.querySelector('input[name="password"]') ||
        document.getElementById("password") ||
        null
    );
}

function getContinueButton() {
    return (
        Array.from(document.querySelectorAll("button")).find((button) =>
            isVisible(button) &&
            !button.disabled &&
            (button.textContent || "").trim().toLowerCase() === "continue"
        ) ||
        document.querySelector('button[type="submit"]') ||
        null
    );
}

function getSignInButton() {
    return (
        Array.from(document.querySelectorAll("button")).find((button) => {
            if (!isVisible(button) || button.disabled) {
                return false;
            }

            const text = (button.textContent || "").trim().toLowerCase();
            return text === "sign in";
        }) ||
        document.getElementsByClassName("c-button c-button-secondary c-button-lg c-button-block c-button-icon c-button-icon-leading cia-form__controls__submit")[0] ||
        null
    );
}

function selectPasswordSignInMethod() {
    const passwordRadio =
        document.getElementById("password-radio") ||
        document.querySelector('input[type="radio"][name="signin-option-radio"][value="password"]');
    const passwordLabel = passwordRadio?.id
        ? document.querySelector(`label[for="${passwordRadio.id}"]`)
        : null;
    const passwordOption =
        passwordLabel ||
        passwordRadio?.closest(".c-radio-wrapper") ||
        passwordRadio?.closest('[role="radio"]') ||
        Array.from(document.querySelectorAll('[role="radio"], label, button, div'))
            .find((element) => {
                if (!isVisible(element)) {
                    return false;
                }

                const text = (element.textContent || "").trim().toLowerCase();
                return text === "use password" || text.startsWith("use password");
            }) ||
        null;

    if (passwordRadio?.checked || getPasswordInput()) {
        return true;
    }

    if (!passwordOption && !passwordRadio) {
        return false;
    }

    if (passwordLabel) {
        clickElement(passwordLabel);
    }

    if (passwordOption && passwordOption !== passwordLabel) {
        clickElement(passwordOption);
    }

    if (passwordRadio) {
        clickElement(passwordRadio);
        setRadioChecked(passwordRadio);
    }

    const radioTarget = passwordOption?.matches?.('[role="radio"]')
        ? passwordOption
        : passwordRadio?.closest('[role="radio"]');
    if (radioTarget) {
        activateRadioElement(radioTarget);
    }

    return Boolean(passwordRadio?.checked || getPasswordInput());
}

function fillPasswordAndContinue() {
    if (!BEST_BUY_PASSWORD || BEST_BUY_PASSWORD === "REPLACE_IN_LOCAL_ENV") {
        console.log("BEST_BUY_PASSWORD is not configured. Leaving sign-in to manual or saved credentials.");
        return false;
    }

    const passwordInput = getPasswordInput();
    if (!passwordInput) {
        console.log("Password input not found on sign-in page");
        return false;
    }

    setInputValue(passwordInput, BEST_BUY_PASSWORD);

    const continueButton = getContinueButton();
    if (!continueButton) {
        console.log("Continue button not found on sign-in page");
        return false;
    }

    clickElement(continueButton);
    console.log("Filled password and clicked Continue");
    return true;
}

function runSignInFlow(attempt = 1) {
    const canAutofillPassword = BEST_BUY_PASSWORD && BEST_BUY_PASSWORD !== "REPLACE_IN_LOCAL_ENV";

    if (canAutofillPassword && fillPasswordAndContinue()) {
        return;
    }

    if (canAutofillPassword && selectPasswordSignInMethod()) {
        if (attempt < 12) {
            setTimeout(function() {
                runSignInFlow(attempt + 1);
            }, 400);
        }
        return;
    }

    const signInButton = getSignInButton();
    if (signInButton) {
        clickElement(signInButton);
    }

    if (attempt < 12) {
        setTimeout(function() {
            runSignInFlow(attempt + 1);
        }, 800);
    }
}

function fillShippingAddressForm() {
    const firstNameInput = document.getElementById("firstName");
    const lastNameInput = document.getElementById("lastName");
    const streetInput = document.getElementById("street");
    const cityInput = document.getElementById("city");
    const stateSelect = document.getElementById("state");
    const zipInput = document.getElementById("zipcode");

    if (!firstNameInput || !lastNameInput || !streetInput || !cityInput || !stateSelect || !zipInput) {
        console.log("Shipping address form not present");
        return false;
    }

    setInputValue(firstNameInput, SHIPPING_FIRST_NAME);
    setInputValue(lastNameInput, SHIPPING_LAST_NAME);
    setInputValue(streetInput, SHIPPING_ADDRESS_1);

    if (SHIPPING_ADDRESS_2) {
        const showAddress2Button = document.querySelector(".address-form__showAddress2Link");
        if (showAddress2Button) {
            clickElement(showAddress2Button);
        }

        const address2Input = getAddress2Input();
        if (address2Input) {
            setInputValue(address2Input, SHIPPING_ADDRESS_2);
        }
    }

    setInputValue(cityInput, SHIPPING_CITY);
    setSelectValue(stateSelect, SHIPPING_STATE);
    setInputValue(zipInput, SHIPPING_ZIP);

    console.log("Shipping address form filled");
    return true;
}

function clickApplyShippingAddress() {
    const applyButton =
        document.querySelector('button[data-track="Shipping: Save shipping address"]') ||
        Array.from(document.querySelectorAll("button")).find((button) =>
            (button.textContent || "").trim().toLowerCase() === "apply"
        ) ||
        null;

    if (!applyButton) {
        console.log("Shipping address Apply button not found");
        return false;
    }

    clickElement(applyButton);
    console.log("Clicked Apply for shipping address");
    return true;
}

function getFulfillmentContinueButton() {
    return (
        Array.from(document.querySelectorAll("button")).find((button) => {
            if (!isVisible(button) || button.disabled) {
                return false;
            }

            const text = (button.textContent || "").trim().toLowerCase();
            return text.includes("continue to payment information");
        }) || null
    );
}

function clickFulfillmentContinueButton() {
    const continueButton = getFulfillmentContinueButton();
    if (!continueButton) {
        console.log("Continue to Payment Information button not found");
        return false;
    }

    clickElement(continueButton);
    const buttonLabel = continueButton.querySelector("span");
    if (buttonLabel) {
        clickElement(buttonLabel);
    }

    console.log("Clicked Continue to Payment Information");
    return true;
}

function fillAndApplyShippingAddress(onComplete) {
    const filled = fillShippingAddressForm();
    if (!filled) {
        onComplete?.(false);
        return;
    }

    setTimeout(function() {
        const applied = clickApplyShippingAddress();
        onComplete?.(applied);
    }, 600);
}

function runFulfillmentCheckoutFlow(attempt = 1) {
    const hasShippingAddressForm =
        Boolean(document.querySelector(".shipping-location-address-container .address-form")) &&
        Boolean(document.getElementById("firstName"));

    const retryContinue = function() {
        const clickedContinue = clickFulfillmentContinueButton();
        if (!clickedContinue) {
            if (attempt < 15) {
                setTimeout(function() {
                    runFulfillmentCheckoutFlow(attempt + 1);
                }, 1000);
            }
            return;
        }

        setTimeout(function() {
            if (!location.href.includes("/checkout/r/fulfillment") && !location.href.includes("/checkout/c/fulfillment")) {
                console.log("Fulfillment step completed");
                return;
            }

            if (attempt < 15) {
                console.log("Still on fulfillment page after Continue click. Retrying.");
                runFulfillmentCheckoutFlow(attempt + 1);
            }
        }, 1500);
    };

    if (hasShippingAddressForm) {
        fillAndApplyShippingAddress(function(applied) {
            if (applied) {
                console.log("Shipping address applied on fulfillment page");
            }

            setTimeout(function() {
                retryContinue();
            }, 1200);
        });
        return;
    }

    retryContinue();
}

function getAddToCartButton() {
    const exactSkuButton = sku
        ? document.querySelector(`button[data-testid="pdp-add-to-cart-${sku}"]`)
        : null;
    if (exactSkuButton && isVisible(exactSkuButton) && !exactSkuButton.disabled) {
        return exactSkuButton;
    }

    const pdpAddToCartRoot = document.getElementById("a2c") || document.querySelector('[data-component-name="AddToCart"]');
    if (pdpAddToCartRoot) {
        const pdpButton = Array.from(pdpAddToCartRoot.querySelectorAll("button"))
            .find((button) =>
                isVisible(button) &&
                !button.disabled &&
                /add to cart|please wait|wait in line|sold out|coming soon/i.test(button.textContent || "")
            );
        if (pdpButton) {
            return pdpButton;
        }
    }

    return null;
}
 
 function getGoToCartButton() {
     return (
         Array.from(document.querySelectorAll("a, button")).find((element) => {
             const text = (element.textContent || "").trim().toLowerCase();
             return text === "go to cart" || text.includes("go to cart");
         }) || null
     );
 }
 
function clickShippingThenAddToCart() {
    if (PREFERRED_SHIPPING === "Yes") {
        console.log("Skipping PDP shipping selection. Shipping will be enforced on the cart page.");
    } else {
        console.log("PREFERRED_SHIPPING is not enabled. Preserving current fulfillment.");
    }

    waitForAddToCartAndClick();
}

function proceedToCheckoutFromCart() {
    setTimeout(() => {
        const checkoutButton = getCheckoutButton();
        if (checkoutButton) {
            console.log("Clicking Checkout");
            checkoutButton.click();
        } else {
            console.log("Checkout button not found on cart page");
        }
    }, 3000);
}

function clickPreferredShippingOption(context = "any") {
    const shippingOption =
        context === "cart"
            ? getCartShippingOption()
            : context === "pdp"
                ? getShippingOption()
                : (getShippingOption() || getCartShippingOption());

    if (!shippingOption) {
        console.log("Shipping option not found");
        return false;
    }

    shippingOption.scrollIntoView({ behavior: "smooth", block: "center" });
    console.log("Clicking shipping option", shippingOption.getAttribute("data-testid") || shippingOption.textContent?.trim());

    if (context === "cart") {
        const shippingEntry = getCartShippingEntry();
        const shippingLabel = shippingEntry?.querySelector('label[for^="fulfillment-shipping-"]');
        const shippingBody = shippingEntry?.querySelector(".availability__body");
        const shippingInput = shippingEntry?.querySelector("input[id^='fulfillment-shipping-']");

        if (shippingBody) {
            clickElement(shippingBody);
        }
        if (shippingLabel) {
            clickElement(shippingLabel);
        }
        if (shippingInput) {
            shippingInput.focus();
            clickElement(shippingInput);
            setRadioChecked(shippingInput);
        }
    } else {
        const shippingLabel = getPdpShippingLabel();
        const shippingRadio = shippingLabel?.closest('[role="radio"]') || shippingOption;

        if (shippingRadio && shippingRadio !== shippingOption) {
            clickElement(shippingRadio);
            activateRadioElement(shippingRadio);
        }

        if (shippingLabel) {
            clickElement(shippingLabel);
        }

        clickElement(shippingOption);

        const labelFor = shippingLabel?.getAttribute("for") || shippingOption.getAttribute("for");
        if (labelFor) {
            const linkedInput = document.getElementById(labelFor);
            if (linkedInput && typeof linkedInput.click === "function") {
                linkedInput.click();
            }
        }

        const nestedInput =
            shippingLabel?.querySelector?.("input[type='radio']") ||
            shippingOption.querySelector?.("input[type='radio']");
        if (nestedInput && typeof nestedInput.click === "function") {
            nestedInput.click();
        }
    }

    return true;
}

function ensureShippingSelected(context, onComplete, attempt = 1) {
    const maxAttempts = context === "pdp" ? 2 : 10;

    try {
        const selected = context === "cart" ? isCartShippingSelected() : isPdpShippingSelected();
        if (selected) {
            console.log("Shipping already selected on", context);
            onComplete?.(true);
            return;
        }

        const clicked = clickPreferredShippingOption(context);
        if (!clicked) {
            console.log("Shipping option click failed on", context, "attempt", attempt);
            if (attempt < maxAttempts) {
                setTimeout(function() {
                    ensureShippingSelected(context, onComplete, attempt + 1);
                }, 500);
            } else {
                onComplete?.(false);
            }
            return;
        }

        setTimeout(function() {
            const afterClickSelected = context === "cart" ? isCartShippingSelected() : isPdpShippingSelected();
            if (afterClickSelected) {
                console.log("Shipping selected on", context);
                onComplete?.(true);
                return;
            }

            console.log("Shipping not selected on", context, "after attempt", attempt);

            if (attempt < maxAttempts) {
                ensureShippingSelected(context, onComplete, attempt + 1);
                return;
            }

            console.log("Unable to verify shipping selection on", context);
            onComplete?.(false);
        }, 500);
    } catch (error) {
        console.error("ensureShippingSelected failed on", context, error);
        onComplete?.(false);
    }
}

function waitForAddToCartAndClick(attempt = 1) {
    const addToCartButton = getAddToCartButton();
    const buttonText = (addToCartButton?.textContent || "").trim().toLowerCase();

    console.log("Purchase button state:", buttonText);

    if (!addToCartButton || !buttonText || addToCartButton.getAttribute("aria-busy") === "true") {
        if (attempt < 20) {
            setTimeout(function() {
                waitForAddToCartAndClick(attempt + 1);
            }, 400);
        } else {
            console.log("Add to Cart button not ready after shipping selection");
        }
        return;
    }

    if (buttonText.includes("please wait") || buttonText.includes("wait in line")) {
        console.log("Queue state detected after shipping selection");
        instockEventHandler();
        return;
    }

    if (!buttonText.includes("add to cart")) {
        if (attempt < 20) {
            setTimeout(function() {
                waitForAddToCartAndClick(attempt + 1);
            }, 400);
        } else {
            console.log("Unexpected purchase button state after shipping selection:", buttonText);
        }
        return;
    }

    addToCartButton.scrollIntoView({ behavior: "smooth", block: "center" });
    console.log("Clicking Add to Cart");
    setTimeout(function() {
        monitorPostAddToCart();
    }, 800);
    clickElement(addToCartButton);
}

function transitionToCartAfterAdd(element, sourceLabel) {
    console.log(`Post-ATC success detected via ${sourceLabel}. Waiting 1500ms before leaving PDP.`);
    setTimeout(function() {
        if (location.href.includes("www.bestbuy.com/cart")) {
            cartpageoperationsEvenHandler();
            return;
        }

        if (element) {
            clickElement(element);
        }
    }, 1500);
}

function monitorPostAddToCart(attempt = 1) {
    if (location.href.includes("www.bestbuy.com/cart")) {
        console.log("Cart page reached after Add to Cart");
        playSound("addToCartClicked", `addToCartClicked:${sku || location.pathname}`);
        transitionToCartAfterAdd(null, "cart page");
        return;
    }

    const gotoCartButton = getGoToCartButton();
    if (gotoCartButton) {
        console.log("Go to Cart detected after Add to Cart");
        playSound("addToCartClicked", `addToCartClicked:${sku || location.pathname}`);
        transitionToCartAfterAdd(gotoCartButton, "go to cart button");
        return;
    }

    const purchaseButton = getAddToCartButton();
    const buttonText = (purchaseButton?.textContent || "").trim().toLowerCase();
    const isBusy = purchaseButton?.getAttribute("aria-busy") === "true";

    console.log("Post-ATC state:", buttonText || "(empty)", "busy:", Boolean(isBusy), "attempt:", attempt);

    if (buttonText.includes("please wait") || buttonText.includes("wait in line")) {
        console.log("Queue state detected after Add to Cart");
        playSound("addToCartClicked", `addToCartClicked:${sku || location.pathname}`);
        instockEventHandler();
        return;
    }

    if (buttonText.includes("go to cart")) {
        console.log("Purchase button changed to Go to Cart");
        playSound("addToCartClicked", `addToCartClicked:${sku || location.pathname}`);
        transitionToCartAfterAdd(purchaseButton, "purchase button");
        return;
    }

    if (attempt < 30) {
        setTimeout(function() {
            monitorPostAddToCart(attempt + 1);
        }, 500);
        return;
    }

    console.log("Timed out waiting for post-Add-to-Cart state after a single click");
}

function getCheckoutButton() {
    return (
        Array.from(document.querySelectorAll("button, a")).find((element) => {
            if (!isVisible(element)) {
                return false;
            }

            const text = (element.textContent || "").trim().toLowerCase();
            return text.includes("checkout");
        }) || null
    );
}

function isVisible(element) {
    if (!element) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function setBadgeStatus(badge, mode, status) {
    const modeNode = badge.querySelector("[data-bot-mode]");
    const statusNode = badge.querySelector("[data-bot-status]");

    if (modeNode) {
        modeNode.innerText = mode;
    }

    if (statusNode) {
        statusNode.innerText = status;
    }
}

function setBadgeColor(badge, color) {
    if (!badge) {
        return;
    }

    const accentNode = badge.querySelector("[data-bot-accent]");
    const statusNode = badge.querySelector("[data-bot-status]");
    const borderColor = color === "#991b1b" ? "rgba(248, 113, 113, 0.45)" : "rgba(255, 255, 255, 0.1)";

    badge.style.borderColor = borderColor;
    badge.style.boxShadow = `0 18px 40px ${color}33`;

    if (accentNode) {
        accentNode.style.background = color;
    }

    if (statusNode) {
        statusNode.style.color = color === "#000000" ? "#f5f5f5" : "#ffffff";
    }
}

let badgeCountdownTimer = null;

function clearBadgeCountdown() {
    if (badgeCountdownTimer) {
        clearInterval(badgeCountdownTimer);
        badgeCountdownTimer = null;
    }
}

function startBadgeRefreshCountdown(badge, status, seconds) {
    clearBadgeCountdown();

    let remainingSeconds = seconds;
    setBadgeStatus(badge, `Refresh in ${remainingSeconds}s`, status);

    badgeCountdownTimer = setInterval(function() {
        remainingSeconds -= 1;

        if (remainingSeconds <= 0) {
            clearBadgeCountdown();
            setBadgeStatus(badge, "Refreshing now", status);
            return;
        }

        setBadgeStatus(badge, `Refresh in ${remainingSeconds}s`, status);
    }, 1000);
}

function refreshCurrentPageInPlace() {
    window.location.reload();
}

// Returns a jittered OOS delay in ms (OOS_REFRESH + 0..OOS_JITTER_MAX seconds).
function jitteredOosDelay() {
    return (OOS_REFRESH + Math.random() * OOS_JITTER_MAX) * 1000;
}

// Decoy page URLs — innocuous Best Buy browse/category pages.
const DECOY_URLS = [
    "https://www.bestbuy.com/",
    "https://www.bestbuy.com/site/computers-pcs/laptop-computers/abcat0502000.c",
    "https://www.bestbuy.com/site/tvs/all-flat-screen-tvs/abcat0101001.c",
    "https://www.bestbuy.com/site/video-games/abcat0700000.c",
    "https://www.bestbuy.com/site/cell-phones/all-cell-phones/abcat0800000.c",
    "https://www.bestbuy.com/site/sale/todays-deals-pcmcat1563299784494.c",
    "https://www.bestbuy.com/site/headphones/abcat0204000.c",
    "https://www.bestbuy.com/site/cameras-camcorders/abcat0400000.c",
];

// Navigate to a random decoy page, stash the target URL so we can return.
function doDecoyTrip(targetUrl) {
    const decoyUrl = DECOY_URLS[Math.floor(Math.random() * DECOY_URLS.length)];
    console.log("[bot-evasion] Starting decoy trip →", decoyUrl, "| will return to", targetUrl);
    sessionStorage.setItem("bbbot_decoy_target", targetUrl);
    location.href = decoyUrl;
}

// Centralised OOS refresh handler — applies jitter and decoy-trip logic.
function handleOosRefresh(badge, statusText) {
    consecutiveOosCount++;
    const delay = jitteredOosDelay();
    const delaySec = Math.round(delay / 1000);

    startBadgeRefreshCountdown(badge, statusText, delaySec);

    if (consecutiveOosCount >= OOS_DECOY_THRESHOLD) {
        consecutiveOosCount = 0;
        console.log("[bot-evasion] Decoy threshold reached, scheduling decoy trip after", delaySec, "s");
        setTimeout(function() { doDecoyTrip(location.href); }, delay);
    } else {
        setTimeout(refreshCurrentPageInPlace, delay);
    }
}

// Called when we land on a decoy page. Scrolls around randomly, then returns.
// Dispatch a cluster of mousemove events along a jittered path, spread over durationMs.
function simulateMouseWander(durationMs) {
    const steps = 8 + Math.floor(Math.random() * 6);
    // Pick a random anchor point to wander around so movements feel purposeful.
    const anchorX = 100 + Math.random() * (window.innerWidth - 200);
    const anchorY = 100 + Math.random() * (window.innerHeight - 200);
    for (let i = 0; i < steps; i++) {
        setTimeout(function() {
            document.dispatchEvent(new MouseEvent("mousemove", {
                clientX: anchorX + (Math.random() - 0.5) * 300,
                clientY: anchorY + (Math.random() - 0.5) * 200,
                bubbles: true,
            }));
        }, (durationMs / steps) * i + Math.random() * 80);
    }
}

function runDecoyBehavior() {
    const targetUrl = sessionStorage.getItem("bbbot_decoy_target");
    sessionStorage.removeItem("bbbot_decoy_target");

    const awayMs = (OOS_DECOY_AWAY_MIN + Math.random() * (OOS_DECOY_AWAY_MAX - OOS_DECOY_AWAY_MIN)) * 1000;
    console.log("[bot-evasion] On decoy page. Returning to target in", Math.round(awayMs / 1000), "s");

    // Interleave scroll bursts and mouse wander clusters across the away time.
    const scrollSteps = 4;
    for (let i = 1; i <= scrollSteps; i++) {
        const t = (awayMs / (scrollSteps + 1)) * i;
        setTimeout(function() {
            const y = Math.floor(Math.random() * (document.body.scrollHeight || 2000));
            window.scrollTo({ top: y, behavior: "smooth" });
            // Wander the mouse around the same region as the scroll event.
            simulateMouseWander(1500);
        }, t);
    }

    setTimeout(function() {
        console.log("[bot-evasion] Decoy trip done, returning to", targetUrl);
        location.href = targetUrl;
    }, awayMs);
}

function getPdpSoldOutButton() {
    const pdpAddToCartRoot = document.getElementById("a2c") || document.querySelector('[data-component-name="AddToCart"]');
    if (!pdpAddToCartRoot) {
        return null;
    }

    return Array.from(pdpAddToCartRoot.querySelectorAll("button"))
        .find((button) =>
            isVisible(button) &&
            /sold out|coming soon/i.test(button.textContent || "")
        ) || null;
}

function runPdpFlow(badge, attempt = 1) {
    const purchaseButton = getAddToCartButton();
    if (!purchaseButton) {
        const soldOutButton = getPdpSoldOutButton();
        if (soldOutButton) {
            const soldOutText = (soldOutButton.textContent || "").trim().toUpperCase();
            console.log("PDP sold out button:", soldOutText);
            setBadgeColor(badge, "#991b1b");
            handleOosRefresh(badge, soldOutText || "SOLD OUT");
            return;
        }

        console.log("No purchase button found on PDP, attempt", attempt);
        clearBadgeCountdown();
        setBadgeColor(badge, "#000000");
        setBadgeStatus(badge, "Auto Detecting Mode", "Waiting for purchase controls");
        if (attempt < 45) {
            setTimeout(function() {
                runPdpFlow(badge, attempt + 1);
            }, 1000);
        }
        return;
    }

    const buttonText = (purchaseButton.textContent || "").trim().toLowerCase();
    console.log("PDP purchase button:", buttonText);

    if (buttonText.includes("sold out") || buttonText.includes("coming soon")) {
        setBadgeColor(badge, "#991b1b");
        console.log('Out of Stock Button is Found: Just Refreshing !');
        handleOosRefresh(badge, buttonText.toUpperCase());
        return;
    }

    if (buttonText.includes("add to cart")) {
        consecutiveOosCount = 0;
        clearBadgeCountdown();
        setBadgeColor(badge, "#15803d");
        setBadgeStatus(badge, "Auto Detecting Mode", "Adding to cart");
        playSound("stockDetected", `stockDetected:${sku || location.pathname}`);
        console.log("Proceeding to Add to Cart");
        clickShippingThenAddToCart();
        return;
    }

    if (buttonText.includes("please wait") || buttonText.includes("wait in line")) {
        clearBadgeCountdown();
        setBadgeColor(badge, "#b45309");
        setBadgeStatus(badge, "Auto Detecting Mode", "Queue state detected");
        console.log("Queue state detected on PDP");
        instockEventHandler();
        return;
    }

    clearBadgeCountdown();
    setBadgeColor(badge, "#000000");
    setBadgeStatus(badge, "Auto Detecting Mode", "Unhandled purchase state");
    console.log("Unhandled PDP purchase state:", buttonText);
}
 
 var sku = getSkuFromPage();
 console.log('found sku', sku);
 
 // This function will be called when Please wait is detected to return queue time
 let checkQueueTimeRemaining = () => {
     try {
         var startMs = getQueueTimeStartMs(sku);
         var durationMs = getQueueDurationMs(sku);
         var durationMin = Math.trunc(durationMs / 60000);
         var durationSec = Math.trunc((durationMs / 1000) - (durationMin * 60));
         var remainingMs = startMs + durationMs - new Date().getTime();
         var remainingMin = Math.trunc(remainingMs / 60000);
         var remainingSec = Math.trunc((remainingMs / 1000) - (remainingMin * 60));
 
         return [remainingMin, remainingSec]
 
 
     } catch (e) {
     }
 };
 
 //________________________________________________________________________
 
 // Create Floating Status Bar
 //________________________________________________________________________
 
function createFloatingBadge(mode,status) {
    const existingBadge = document.getElementById("best-buy-bot-badge");
    if (existingBadge) {
        setBadgeStatus(existingBadge, mode, status);
        return existingBadge;
    }

    const iconUrl = BOT_ICON_URL;
    const $container = document.createElement("div");
    const $header = document.createElement("div");
    const $link = document.createElement("a");
    const $img = document.createElement("img");
    const $titleWrap = document.createElement("div");
    const $title = document.createElement("div");
    const $meta = document.createElement("div");
    const $testMode = document.createElement("div");
    const $content = document.createElement("div");
    const $accent = document.createElement("div");
    const $body = document.createElement("div");
    const $mode = document.createElement("div");
    const $status = document.createElement("div");

    $container.id = "best-buy-bot-badge";
    $container.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:20px",
        "transform:translateX(-50%)",
        "width:560px",
        "max-width:calc(100vw - 32px)",
        "padding:16px 18px 16px",
        "border:1px solid rgba(255, 255, 255, 0.1)",
        "border-radius:18px",
        "background:rgba(10, 10, 10, 0.9)",
        "backdrop-filter:blur(14px)",
        "-webkit-backdrop-filter:blur(14px)",
        "box-shadow:0 18px 40px rgba(0, 0, 0, 0.32)",
        "color:#f5f5f5",
        "font-family:ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
        "z-index:2147483647"
    ].join(";");

    $link.setAttribute("href", "https://github.com/alexh/best-buy-bot");
    $link.setAttribute("target", "_blank");
    $link.setAttribute("title", "alexh/best-buy-bot");
    $link.style.cssText = [
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "width:40px",
        "height:40px",
        "padding:5px",
        "box-sizing:border-box",
        "border-radius:10px",
        "flex-shrink:0",
        "background:rgba(255, 255, 255, 0.04)"
    ].join(";");

    $img.setAttribute("src", iconUrl);
    $img.setAttribute("alt", "Best Buy bot");
    $img.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";

    $header.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:16px;";
    $titleWrap.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;";
    $title.style.cssText = "font-size:14px;font-weight:700;letter-spacing:0.02em;color:#ffffff;line-height:1.2;";
    $meta.style.cssText = "font-size:12px;line-height:1.45;color:rgba(255,255,255,0.62);white-space:normal;";
    $testMode.setAttribute("data-bot-testmode", "true");
    $testMode.style.cssText = "display:flex;align-items:center;justify-content:center;min-width:120px;padding:10px 14px;border-radius:12px;font-size:16px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#111827;background:#fbbf24;flex-shrink:0;";
    $content.style.cssText = "display:flex;gap:12px;margin-top:14px;align-items:stretch;";
    $accent.setAttribute("data-bot-accent", "true");
    $accent.style.cssText = "width:5px;border-radius:999px;background:#0f172a;flex-shrink:0;";
    $body.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0;";
    $mode.setAttribute("data-bot-mode", "true");
    $mode.style.cssText = "font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.58);";
    $status.setAttribute("data-bot-status", "true");
    $status.style.cssText = "font-size:24px;font-weight:700;line-height:1.15;color:#ffffff;word-break:break-word;";

    $title.innerText = "alexh/best-buy-bot";
    $meta.innerText = `v5.0  KEYWORD ${REQUIRED_KEYWORDS.join(" + ") || ITEM_KEYWORD}  REFRESH ${OOS_REFRESH}s`;
    $testMode.innerText = TESTMODE === "Yes" ? "TEST MODE" : "LIVE MODE";
    $testMode.style.background = TESTMODE === "Yes" ? "#fbbf24" : "#ef4444";
    $testMode.style.color = TESTMODE === "Yes" ? "#111827" : "#ffffff";
    $mode.innerText = mode;
    $status.innerText = status;

    $link.appendChild($img);
    $titleWrap.appendChild($title);
    $titleWrap.appendChild($meta);
    $header.appendChild($link);
    $header.appendChild($titleWrap);
    $header.appendChild($testMode);
    $body.appendChild($mode);
    $body.appendChild($status);
    $content.appendChild($accent);
    $content.appendChild($body);
    $container.appendChild($header);
    $container.appendChild($content);

    return $container;
 }
 
 //________________________________________________________________________
 
 //  FUNCTIONS | Writing seperate EventHandlers so we can prevent memory leak for long running bots
 //________________________________________________________________________
 
 // Ideas developed based on : https://stackoverflow.com/questions/13677589/addeventlistener-memory-leak-due-to-frames/13702786#13702786
 //________________________________________________________________________
 
 //    CART PAGE EventHandler
 //________________________________________________________________________
 
function cartpageoperationsEvenHandler(evt) {
    setTimeout(() => {
        if (location.href.includes("www.bestbuy.com/cart")) {
            ensureSku();
            // Create and display the badge
            const $badge = createFloatingBadge(
                 "Cart Page 🛑 Do Not Refresh. Only one item can be carted per account.",
                 "Verfying that first item in CART has KEYWORD"
             );
            document.body.appendChild($badge);

            // Wait 3 seconds on Cart Page
            setTimeout(() => {
                if (!isCartCleanForCheckout()) {
                    console.log("Cart is not clean. Checkout automation requires exactly one matching item in cart.");
                    setBadgeColor($badge, "#991b1b");
                    setBadgeStatus($badge, "Cart not clean", "Keep only the target item in cart");
                    return;
                }

                const cartItemTitle = getTargetCartTitleElement();
                if (cartItemTitle && matchesRequiredKeywords(cartItemTitle.innerHTML)) {
                   console.log("Item Has been Confirmed!");
                   playSound("cartConfirmed", `cartConfirmed:${sku || location.pathname}`);
 
                   if (PREFERRED_SHIPPING === "Yes") {
                        console.log("Attempting to select shipping on cart page.");
                        setTimeout(() => {
                            ensureShippingSelected("cart", function(selected) {
                                console.log("Shipping selection attempted. Waiting before checkout.", selected);

                                if (!selected) {
                                    console.log("Shipping was not selected on cart page. Proceeding with the current fulfillment.");
                                    proceedToCheckoutFromCart();
                                    return;
                                }

                                fillAndApplyShippingAddress(function(applied) {
                                    console.log("Shipping address apply attempted.", applied);
                                    proceedToCheckoutFromCart();
                                });
                            });
                        }, 3000);
                    } else {
                        console.log("Shipping button not found. Clicking Checkout immediately.");
                        proceedToCheckoutFromCart();
                    }
                }
             }, 3000);
         }
     }, 5000);
 }
 
 
 //________________________________________________________________________
 
 //    VERIFICATION PAGE EventHandler
 //________________________________________________________________________
 
function verificationpageEventHandler (evt) {
     console.log('Verification Step Reached')
     setTimeout(function()
                {
         if (location.href.indexOf("identity/signin/recoveryOptions") > -1) {
             //Create Custom Badge
             //
                 const $badge = createFloatingBadge("Get Ready To Verify 🛑 Do Not Refresh ","Validating and Entering SMS Digits | It will error if you havent updated SMS_DIGITS ");
                 document.body.appendChild($badge);
                 setTimeout(function()
                        {
                 var ContinueButton;
                 const ContinueButton_L1 = "btn btn-secondary btn-lg btn-block c-button-icon c-button-icon-leading cia-form__controls__submit "
                 const ContinueButton_L2 = "c-button c-button-secondary c-button-lg c-button-block c-button-icon c-button-icon-leading cia-form__controls__submit "
                 const ContinueButton_L3 = "c-button c-button-secondary c-button-md c-button-block"
 
                 if (document.getElementsByClassName(ContinueButton_L1).length == 1)
                 {
                     ContinueButton = document.getElementsByClassName(ContinueButton_L1);
                     console.log('ContinueButton Class ID 1 : ' + ContinueButton_L1)
                 } else if (document.getElementsByClassName(ContinueButton_L2).length == 1) {
                     ContinueButton = document.getElementsByClassName(ContinueButton_L2);
                     console.log('ContinueButton Class ID 2 :' + ContinueButton_L2)
 
                 } else if (document.getElementsByClassName(ContinueButton_L3).length == 1) {
                     ContinueButton = document.getElementsByClassName(ContinueButton_L3);
                     console.log('ContinueButton Class ID 2 :' + ContinueButton_L3)
 
                 }
 
                 document.getElementById("smsDigits").focus();
                 document.getElementById("smsDigits").select();
                 if (!document.execCommand('insertText',false, SMS_DIGITS)) {
                     document.getElementById("smsDigits").value = SMS_DIGITS;
                 }
                 if (ContinueButton.length == 1) {
                     ContinueButton[0].click()
                     ContinueButton = null;
                 }
             }, 2500)
         }
     }, 3000)
 }
 
 //________________________________________________________________________
 
 //  SECOND ADD TO CART EventHandler
 //________________________________________________________________________
 
 
function pleasewaitcompletedEventHandler(evt) {
    // Wait 4 seconds before clicking the final "Go to Cart" button
    setTimeout(function() {
        const gotoCartButton = getGoToCartButton();
        if (gotoCartButton) {
            gotoCartButton.onclick = cartpageoperationsEvenHandler;
            gotoCartButton.addEventListener("click", cartpageoperationsEvenHandler, false);
            gotoCartButton.click();
        }
    }, 4000);
}
 
 //________________________________________________________________________
 
 //  ITEM IN STOCK EventHandler
 //________________________________________________________________________
 
function instockEventHandler(evt) {
    const addToCartButton = getAddToCartButton();
    if (!addToCartButton) {
        console.log("instockEventHandler: purchase button not found");
        return;
    }

    setTimeout(function() {
        let MainButtonColor = window.getComputedStyle(addToCartButton).backgroundColor;
        //Code to run After timeout elapses
        console.log('Confirming Button Color : ' + MainButtonColor)
 
         if (MainButtonColor === 'rgb(197, 203, 213)') {
 
            console.log('Button Color Gray. Is it still Adding ?')

            setTimeout(function() {

                var REALLY_PLEASE_WAIT = window.getComputedStyle(addToCartButton).backgroundColor;

                if (REALLY_PLEASE_WAIT === 'rgb(197, 203, 213)') {
 
                     console.log('Its really Please Wait.')
 
                     var MODE = "Do not Refresh 🛑 For new queue time open this link in new firefox container tab"
                     //
                     var RETRY_COUNT = "1"
                     let RETRY_QUEUE_COUNT = 0
                     let QUEUE_TRY_COUNT = 0
                     // Run this every 5 seconds
                     setInterval(function() {
                         // run checkQueueTimeRemaining Function which returns [remainingMin, remainingSec]
                         const [remainingMin, remainingSec] = checkQueueTimeRemaining();
                         //DEBUG//console.log(remainingMin,'m : ', remainingSec,'s')
                                                 const queueBadge = 'Queue Time : ' + remainingMin + 'm : '+ remainingSec+'s'
                                                 const $badge = createFloatingBadge(MODE,queueBadge);
                                                 document.body.appendChild($badge);
                                                 // Run this every 20 seconds
                         setTimeout(function() {
 
                            //Find the Color of Main Button in Firefox
                            const PleaseWait = getAddToCartButton();
                            if (!PleaseWait) {
                                console.log("Please Wait button not found");
                                return;
                            }

                            let MainButtonColor = window.getComputedStyle(PleaseWait).backgroundColor;
                            //console.log(MainButtonColor);
                            console.log("Please Wait Button Detected :" + MainButtonColor + " | Lets keep trying ..");

                            if (MainButtonColor === 'rgb(255, 224, 0)' || MainButtonColor === 'rgb(0, 70, 190)') {
                                // Color of Button Changes to yellow then click again
                                let ATC_Color = window.getComputedStyle(addToCartButton).backgroundColor;
                                // When button turns yellow, we scream bagged !
                                console.log("Add to Cart is available:" + ATC_Color + " | Lets Bag This ! ");
                                const ATCYellowButton = getAddToCartButton();
                                if (!ATCYellowButton) {
                                    console.log("ATC button not found while leaving queue");
                                    return;
                                }

                                // Now we will use event handlers to check for clicks. We have create a function on top defining instockEventhandler.
                                // It is said this this method reduces memory leaks
                                ATCYellowButton.onclick = pleasewaitcompletedEventHandler;
                                ATCYellowButton.addEventListener("click", pleasewaitcompletedEventHandler, false);
                                // When a click event is detected for parsed element, please execute the function from uptop
                                ATCYellowButton.click();

                            } else {
                                 // Is queue bypass available ?
                                 // If available lets check add to cart button instanly
                                 // Press secondary button
                                 console.log("Checking bypass")
                                 var GotoCartButton;
                                 const GotoCartButton_L1 = "c-button c-button-secondary btn btn-secondary btn-sm c-button-sm btn-block c-button-block"
                                 const GotoCartButton_L2 = "c-button c-button-secondary c-button-sm c-button-block "
                                 const GotoCartButton_L3 = "c-button c-button-secondary c-button-md c-button-block"
 
                                 if (document.getElementsByClassName(GotoCartButton_L1).length > 0)
                                 {
                                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L1);
                                     console.log('GotoCartButton Class ID 1 : ' + GotoCartButton_L1)
                                 } else if (document.getElementsByClassName(GotoCartButton_L2).length > 0) {
                                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L2);
                                     console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L2)
 
                                 } else if (document.getElementsByClassName(GotoCartButton_L3).length > 0) {
                                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L3);
                                     console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L3)
 
                                 }
 
                                 if (GotoCartButton != null) {
                                     for (var i=0;i<GotoCartButton.length; i++) {
                                         if (GotoCartButton[i].href == 'https://www.bestbuy.com/cart'){
                                             GotoCartButton[i].onclick = cartpageoperationsEvenHandler;
                                             GotoCartButton[i].addEventListener ("click", cartpageoperationsEvenHandler, false);
                                             // When a click event is detected for parsed element, please execute the function from uptop
                                             GotoCartButton[i].click (cartpageoperationsEvenHandler);
                                             GotoCartButton = null ;
                                         }
                                     }
                                 }
 
                                 /*
                                                                  // OLD CODE {might be useful for later}
 
                                                                  const regex = /(?<=Time Remaining: )(.*)(?= min)/g;
                                                                  const found = time.match(regex);
                                                                  console.log(found[0])
                                                                  if ((found[0] > QUEUE_TIME_CUTOFF) && (RETRY_QUEUE_COUNT < RETRY_COUNT)) {
                                                                          RETRY_QUEUE_COUNT += NEW_QUEUE_TIME_DELAY;
                                                                          let BetterTimeColor = window.getComputedStyle(BetterTime).backgroundColor
                                                                          BetterTime.click()
                                                                          QUEUE_TRY_COUNT++;
                                                                          console.log(BetterTimeColor)
                                                                          if (BetterTimeColor === 'rgb(197, 203, 213)') {
                                                                                  //console.log('refresh')
                                                                                  //window.open(window.location.href, '_blank');
                                                                                  //window.close();
                                                                                  location.reload();
                                                                          }
                                                                  }*/
 
 
                             }
 
                             //
 
                         }, 5 * 1000);
 
                         RETRY_COUNT++;
                         if (RETRY_COUNT > MAX_RETRIES) {
                             location.reload();
                         }
 
                     }, 1000)
 
                 } else {
                     setTimeout(function() {
                         // Press secondary button
                         console.log('Level 2 | Blue Cart Button Appears')
                         var GotoCartButton;
                         const GotoCartButton_L1 = "c-button c-button-secondary btn btn-secondary btn-sm c-button-sm btn-block c-button-block"
                         const GotoCartButton_L2 = "c-button c-button-secondary c-button-sm c-button-block "
                         const GotoCartButton_L3 = "c-button c-button-secondary c-button-md c-button-block"
 
                         if (document.getElementsByClassName(GotoCartButton_L1).length > 0)
                         {
                             GotoCartButton = document.getElementsByClassName(GotoCartButton_L1);
                             console.log('GotoCartButton Class ID 1 : ' + GotoCartButton_L1)
                         } else if (document.getElementsByClassName(GotoCartButton_L2).length > 0) {
                             GotoCartButton = document.getElementsByClassName(GotoCartButton_L2);
                             console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L2)
 
                         } else if (document.getElementsByClassName(GotoCartButton_L3).length > 0) {
                             GotoCartButton = document.getElementsByClassName(GotoCartButton_L3);
                             console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L3)
 
                         }
 
                         if (GotoCartButton != null) {
                             for (var i=0;i<GotoCartButton.length; i++) {
                                 if (GotoCartButton[i].href == 'https://www.bestbuy.com/cart'){
                                     GotoCartButton[i].onclick = cartpageoperationsEvenHandler;
                                     GotoCartButton[i].addEventListener ("click", cartpageoperationsEvenHandler, false);
                                     // When a click event is detected for parsed element, please execute the function from uptop
                                     GotoCartButton[i].click (cartpageoperationsEvenHandler);
                                     GotoCartButton = null ;
                                 }
                             }
                         }
                     }, 6000) // If item is not please waited then it will open go to cart again. This only happens for in stock items
 
                 }
 
             }, 3000)
 
         } else {
             setTimeout(function() {
                 // Press secondary button
                 console.log('Level 1 | Blue Cart Button Appears')
                 var GotoCartButton;
                 const GotoCartButton_L1 = "c-button c-button-secondary btn btn-secondary btn-sm c-button-sm btn-block c-button-block"
                 const GotoCartButton_L2 = "c-button c-button-secondary c-button-sm c-button-block "
                 const GotoCartButton_L3 = "c-button c-button-secondary c-button-md c-button-block"
 
                 if (document.getElementsByClassName(GotoCartButton_L1).length > 0)
                 {
                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L1);
                     console.log('GotoCartButton Class ID 1 : ' + GotoCartButton_L1)
                 } else if (document.getElementsByClassName(GotoCartButton_L2).length > 0) {
                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L2);
                     console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L2)
 
                 } else if (document.getElementsByClassName(GotoCartButton_L3).length > 0) {
                     GotoCartButton = document.getElementsByClassName(GotoCartButton_L3);
                     console.log('GotoCartButton Class ID 2 :' + GotoCartButton_L3)
 
                 }
 
                 if (GotoCartButton != null) {
                     for (var i=0;i<GotoCartButton.length; i++) {
                         if (GotoCartButton[i].href == 'https://www.bestbuy.com/cart'){
                             GotoCartButton[i].onclick = cartpageoperationsEvenHandler;
                             GotoCartButton[i].addEventListener ("click", cartpageoperationsEvenHandler, false);
                             // When a click event is detected for parsed element, please execute the function from uptop
                             GotoCartButton[i].click (cartpageoperationsEvenHandler);
                             GotoCartButton = null ;
                         }
                     }
                 }
             }, 3000) // If item is not please waited then it will open go to cart again. This only happens for in stock items
 
         }
 
 
 
     }, 2000); //Two seconds will elapse and Code will execute.
     //
 }
 //________________________________________________________________________
 
 //  Main Code
 //________________________________________________________________________
 
// Get Page Title
var pagetitle = String(document.title);
 
 if (location.href.includes("www.bestbuy.com/cart")) {
 
     cartpageoperationsEvenHandler();
 
 }
 
 // Refresh page if Sign In page is encountered to recheck for Verification Page
 if (pagetitle.includes("Sign In to Best Buy")) {
     setInterval(function() {
         console.log('Waiting for Sign in')
         var Recovery_pagetitle = String(document.title);
         if (Recovery_pagetitle.includes("Recovery")) {
             verificationpageEventHandler();
         }
     }, 1000);
 }
 
 // Check for Verification Page
 if (pagetitle.includes("Recovery")) {
 
     verificationpageEventHandler();
 
 }
 
// Decoy trip detection: if we navigated here as part of an evasion trip, run
// the scroll-and-return behavior instead of the normal PDP flow.
if (sessionStorage.getItem("bbbot_decoy_target")) {
    runDecoyBehavior();
} else if (matchesRequiredKeywords(pagetitle)) {

     //Create Custom Badge
     //
    const $badge = createFloatingBadge("Auto Detecting Mode", "Initializing ..");
    console.log('BEGIN ')
    document.body.appendChild($badge);
    runPdpFlow($badge);
}
 
 
 
 // CART PAGE OPERATIONS
 else if (location.href.includes("www.bestbuy.com/checkout/r/fast-track") || location.href.includes("www.bestbuy.com/checkout/c/fast-track")) {
     //Create Custom Badge
     //
     const $badge = createFloatingBadge("Final CheckPoint","Verifying and Submitting");
     document.body.appendChild($badge);
     //
     //
     setTimeout(function() {
         fillAndApplyShippingAddress(function(applied) {
             if (applied) {
                 console.log("Shipping address applied on checkout page");
             }
         });

         //We will verify that the item in final checkout screen matches the Keyword so we don't have any issues when running multiple scripts for multiple keyword.
         //In that case the Place Order button is clicked.
         //
         var CartItemCheck = document.getElementsByClassName("d-flex items-start flex-column gap-100");
         //console.log(CartItemCheck[0])
         //
         //
        if (CartItemCheck[0] && matchesRequiredKeywords(CartItemCheck[0].innerHTML)){
            //
            console.log('Item Has been Confirmed !')
            playSound("checkoutPageReady", `checkoutPageReady:${sku || location.pathname}`);
            //console.log('Click Place Order')
 
             //
             //document.getElementById("blah").src = "http://......"
             // CVV Number of Saved Card
             // CVV field handling remains defensive because Best Buy varies the field id.
 
             // CVV Field ID Layers
             var CVV_ID;
             const CVV_ID_L1 = "cvv"
             const CVV_ID_L2 = "credit-card-cvv"
 
             if (document.getElementById(CVV_ID_L1) != null)
             {
                 CVV_ID = CVV_ID_L1;
                 console.log('CVV ID 1 : ' + CVV_ID_L1)
 
             } else if (document.getElementById(CVV_ID_L2) != null) {
 
                 CVV_ID = CVV_ID_L2;
                 console.log('CVV ID 2 :' + CVV_ID_L2)
 
             }
             if(document.getElementById(CVV_ID) != null) {
                 document.getElementById(CVV_ID).focus();
                 document.getElementById(CVV_ID).select();
                 if (!document.execCommand('insertText',false, CREDITCARD_CVV)) {
                     document.getElementById(CVV_ID).value = CREDITCARD_CVV;
                     console.log('CVV Entered')
                 }
             }
 
             if(document.getElementById("text-updates") != null)
             {
                 //
                 var TextUpdates = document.getElementById("text-updates").click();
                 console.log('Text Updates checked')
             }
             if(document.getElementById("smsOptIn") != null)
             {
                 //
                 var SMSUpdates = document.getElementById("smsOptIn").click();
                 console.log('SMS Updates checked')
             }
             if (TESTMODE === "No"){
                 //Is test mode is OFF go press place order button
                 //
                 console.log("Placing order ...")
                 document.getElementsByClassName("c-button-unstyled rounded-lg border-comp-outline-secondary h-600 bg-comp-surface-secondary-emphasis px-400")[0].click()
                 //
             } else {
                 playSound("manualConfirmationRequired", `manualConfirmationRequired:${sku || location.pathname}`);
                 console.log('Test Mode is ON.  Ready to Place Order Manually')
             }
             //
             //
         }
     }, 3000); //Three seconds will elapse and Code will execute.
 
 
 
 
 }
 else if (location.href.includes("www.bestbuy.com/checkout/r/fulfillment") || location.href.includes("www.bestbuy.com/checkout/c/fulfillment")) {

     const $badge = createFloatingBadge("Fulfillment Checkpoint","Applying shipping details");
     document.body.appendChild($badge);

     setTimeout(function(){
         runFulfillmentCheckoutFlow();
     }, 3000);

 }
 // SIGN IN OPERATIONS
 else if (location.href.includes("www.bestbuy.com/identity/signin")) {

     const $badge = createFloatingBadge("Sign-In Page Detected | Please have your credentials saved ","Clicking Sign-In in 5 Seconds");
     document.body.appendChild($badge);
 
     setTimeout(function(){
         runSignInFlow();
 
         //
         //
     }, 5000);
 
 }
