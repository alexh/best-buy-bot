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
 
const ITEM_KEYWORD= "5090"; // NO SPACES IN KEYWORD - ONLY ONE WORD
const CREDITCARD_CVV = "***"; // BOT will run without changing this value.
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
 const OOS_REFRESH = 10 // (in Seconds) Refresh rate on OOS item.
 
 //____ LAZY FLAGS : WILL NOT AFFECT BOT PERFORMACE _____________________
 
 const MAX_RETRIES = "500" // Fossil of EARTH
 
 //________________________________________________________________________
 
 // Audio
 //________________________________________________________________________
 
const playedSoundGuards = new Set();

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

    const audio = new Audio(`${SOUND_BASE_URL}/${soundFile}`);
    audio.play().catch((err) => console.error("Audio play failed:", err));
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

function getCartShippingEntry() {
    return Array.from(document.querySelectorAll(".availability__entry"))
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

    const shippingInput = Array.from(document.querySelectorAll("input[id^='fulfillment-shipping-']"))
        .find((element) => isVisible(element) || element.offsetParent !== null);
    if (shippingInput) {
        return (
            document.querySelector(`label[for="${shippingInput.id}"]`) ||
            shippingInput.closest("label") ||
            shippingInput.closest('[role="radio"]') ||
            shippingInput
        );
    }

    const shippingRadio = Array.from(document.querySelectorAll('[role="radio"], label, button, div'))
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
    const shippingOption = getShippingOption();
    if (!shippingOption) {
        return false;
    }

    return shippingOption.getAttribute("aria-checked") === "true";
}

function isCartShippingSelected() {
    const selectedShippingInput = document.querySelector("input[id^='fulfillment-shipping-']:checked");
    if (selectedShippingInput) {
        return true;
    }

    const selectedShippingEntry = Array.from(document.querySelectorAll(".availability__entry"))
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

    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
        element.dispatchEvent(new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            view: window
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
             const href = element.getAttribute("href") || "";
             return text.includes("go to cart") || href === "/cart" || href === "https://www.bestbuy.com/cart";
         }) || null
     );
 }
 
function clickShippingThenAddToCart() {
     ensureShippingSelected("pdp", function(selected) {
         if (!selected) {
             console.log("PDP shipping selection did not stick");
         }

         waitForAddToCartAndClick();
     });
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
        clickElement(shippingOption);

        const labelFor = shippingOption.getAttribute("for");
        if (labelFor) {
            const linkedInput = document.getElementById(labelFor);
            if (linkedInput && typeof linkedInput.click === "function") {
                linkedInput.click();
            }
        }

        const nestedInput = shippingOption.querySelector?.("input[type='radio']");
        if (nestedInput && typeof nestedInput.click === "function") {
            nestedInput.click();
        }
    }

    return true;
}

function ensureShippingSelected(context, onComplete, attempt = 1) {
    const selected = context === "cart" ? isCartShippingSelected() : isPdpShippingSelected();
    if (selected) {
        console.log("Shipping already selected on", context);
        onComplete?.(true);
        return;
    }

    const clicked = clickPreferredShippingOption(context);
    if (!clicked) {
        if (attempt < 10) {
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

        if (attempt < 10) {
            ensureShippingSelected(context, onComplete, attempt + 1);
            return;
        }

        console.log("Unable to verify shipping selection on", context);
        onComplete?.(false);
    }, 500);
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
    playSound("addToCartClicked", `addToCartClicked:${sku || location.pathname}`);
    addToCartButton.click();
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
    const textNodes = badge.querySelectorAll("p");
    if (textNodes[1]) {
        textNodes[1].innerText = mode;
    }
    if (textNodes[2]) {
        textNodes[2].innerText = status;
    }
}

function setBadgeColor(badge, color) {
    if (!badge) {
        return;
    }

    badge.style.background = color;
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
            setBadgeStatus(badge, "Auto Detecting Mode", soldOutText || "SOLD OUT");
            return;
        }

        console.log("No purchase button found on PDP, attempt", attempt);
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
        setBadgeStatus(badge, "Auto Detecting Mode", buttonText.toUpperCase());
        console.log('Out of Stock Button is Found: Just Refreshing !');
        setTimeout(function() {
            window.open(window.location.href, '_blank');
            window.close();
        }, OOS_REFRESH * 1000);
        return;
    }

    if (buttonText.includes("add to cart")) {
        setBadgeColor(badge, "#15803d");
        setBadgeStatus(badge, "Auto Detecting Mode", "Selecting shipping then adding to cart");
        playSound("stockDetected", `stockDetected:${sku || location.pathname}`);
        console.log("Selecting shipping, then Add to Cart");
        clickShippingThenAddToCart();
        return;
    }

    if (buttonText.includes("please wait") || buttonText.includes("wait in line")) {
        setBadgeColor(badge, "#b45309");
        setBadgeStatus(badge, "Auto Detecting Mode", "Queue state detected");
        console.log("Queue state detected on PDP");
        instockEventHandler();
        return;
    }

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
 
     const iconUrl = BOT_ICON_URL;
     const $container = document.createElement("div");
     const $bg = document.createElement("div");
     const $link = document.createElement("a");
     const $img = document.createElement("img");
     const $text = document.createElement("P");
     const $mode = document.createElement("P");
     const $status1 = document.createElement("P");
 
 
     $link.setAttribute("href", "https://github.com/alexh/best-buy-bot");
     $link.setAttribute("target", "_blank");
     $link.setAttribute("title", "alexh/best-buy-bot");
     $img.setAttribute("src", iconUrl);
     var MAIN_TITLE = (" alexh/best-buy-bot v5.0 | ◻️TESTMODE: " + TESTMODE + "◻️ITEM KEYWORD: " + ITEM_KEYWORD + "◻️OOS REFRESH: " + OOS_REFRESH);
     $text.innerText = MAIN_TITLE;
     $mode.innerText = mode;
     $status1.innerText = status;
 
     $container.style.cssText = "position:fixed;left:0;bottom:0;width:850px;height:75px;background: black;";
     $bg.style.cssText = "position:absolute;left:-100%;top:0;width:60px;height:55px;background:#1111;box-shadow: 0px 0 10px #060303; border: 1px solid #FFF;";
     $link.style.cssText = "position:absolute;display:block;top:11px;left: 0px; z-index:10;width: 50px;height:50px;border-radius: 1px;overflow:hidden;";
     $img.style.cssText = "display:block;width:100%";
     $text.style.cssText = "position:absolute;display:block;top:3px;left: 50px;background: transperant; color: white;";
     $mode.style.cssText = "position:absolute;display:block;top:22px;left: 50px;background: transperant; color: white;";
     $status1.style.cssText = "position:absolute;display:block;top:43px;left: 50px;background: transperant; color: white;";
 
 
     $link.appendChild($img);
     $container.appendChild($bg);
     $container.appendChild($link);
     $container.appendChild($text);
     $container.appendChild($mode);
     $container.appendChild($status1)
 
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
             // Create and display the badge
             const $badge = createFloatingBadge(
                 "Cart Page 🛑 Do Not Refresh. Only one item can be carted per account.",
                 "Verfying that first item in CART has KEYWORD"
             );
             document.body.appendChild($badge);
             $badge.style.transform = "translate(0, 0)";
 
             // Wait 3 seconds on Cart Page
             setTimeout(() => {
                const CartItemCheck = document.getElementsByClassName("cart-item__title focus-item-0");
                if (CartItemCheck[0] && CartItemCheck[0].innerHTML.includes(ITEM_KEYWORD)) {
                   console.log("Item Has been Confirmed!");
                   playSound("cartConfirmed", `cartConfirmed:${sku || location.pathname}`);
 
                   if (PREFERRED_SHIPPING === "Yes") {
                        console.log("Attempting to select shipping on cart page.");
                        setTimeout(() => {
                            ensureShippingSelected("cart", function(selected) {
                                console.log("Shipping selection attempted. Waiting before checkout.", selected);

                                if (!selected) {
                                    console.log("Shipping was not selected on cart page. Skipping checkout click.");
                                    return;
                                }

                                fillAndApplyShippingAddress(function(applied) {
                                    console.log("Shipping address apply attempted.", applied);

                                    setTimeout(() => {
                                        const checkoutButton = getCheckoutButton();
                                        if (checkoutButton) {
                                            console.log("Clicking Checkout");
                                            checkoutButton.click();
                                        } else {
                                            console.log("Checkout button not found after shipping selection");
                                        }
                                    }, 3000);
                                });
                            });
                        }, 3000);
                    } else {
                        console.log("Shipping button not found. Clicking Checkout immediately.");
                        const checkoutButton = getCheckoutButton();
                        if (checkoutButton) {
                            checkoutButton.click();
                        }
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
             $badge.style.transform = "translate(0, 0)"
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
                         $badge.style.transform = "translate(0, 0)"
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
 
 function contains(a,b) {
     let counter = 0;
     for(var i = 0; i < b.length; i++) {;
                                        if(a.includes(b[i])) counter++;
                                       }
     if(counter === b.length) return true;
     return false;
 }
 
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
 
 if (pagetitle.includes(ITEM_KEYWORD)) {
 
 
     //Create Custom Badge
     //
    const $badge = createFloatingBadge("Auto Detecting Mode", "Initializing ..");
    console.log('BEGIN ')
    document.body.appendChild($badge);
    $badge.style.transform = "translate(0, 0)"
    runPdpFlow($badge);
}
 
 
 
 // CART PAGE OPERATIONS
 else if (location.href.includes("www.bestbuy.com/checkout/r/fast-track") || location.href.includes("www.bestbuy.com/checkout/c/fast-track")) {
     //Create Custom Badge
     //
     const $badge = createFloatingBadge("Final CheckPoint","Verifying and Submitting");
     document.body.appendChild($badge);
     $badge.style.transform = "translate(0, 0)"
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
        if (CartItemCheck[0].innerHTML.includes(ITEM_KEYWORD)){
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
 // SIGN IN OPERATIONS
 else if (location.href.includes("www.bestbuy.com/identity/signin")) {
 
     const $badge = createFloatingBadge("Sign-In Page Detected | Please have your credentials saved ","Clicking Sign-In in 5 Seconds");
     document.body.appendChild($badge);
     $badge.style.transform = "translate(0, 0)"
 
     setTimeout(function(){
 
         var signInButton = document.getElementsByClassName("c-button c-button-secondary c-button-lg c-button-block c-button-icon c-button-icon-leading cia-form__controls__submit")[0];
         signInButton.click()
 
         //
         //
     }, 5000);
 
 }
