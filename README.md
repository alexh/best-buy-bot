# Best Buy Bot Tampermonkey Fork

This repo is a maintained fork of the original Best Buy GPU bot userscript. It keeps the distribution model simple: one Tampermonkey script at the repo root, plus versioned assets for audio and imagery.

Original repo: [kkapuria3/BestBuy-GPU-Bot](https://github.com/kkapuria3/BestBuy-GPU-Bot)  
Fork repo: [alexh/best-buy-bot](https://github.com/alexh/best-buy-bot)

## What This Fork Changes

- Uses a maintained local script base instead of the unmodified upstream file.
- Adds SKU-scoped PDP selection so recommended items cannot satisfy Add to Cart selectors.
- Adds clearer status badge states, including a red `SOLD OUT` state.
- Preserves shipping selection and shipping-address autofill.
- Replaces the single legacy alert sound with event-based audio clips.
- Removes the old GitHub Pages and promo scaffolding from the repo.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Create a new script in the Tampermonkey dashboard.
3. Replace the template with the contents of [`best-buy-tm.js`](https://raw.githubusercontent.com/alexh/best-buy-bot/main/best-buy-tm.js).
4. Save the script.
5. Sign in to Best Buy and allow pop-ups for `https://www.bestbuy.com/`.

## Configure

Edit the constants at the top of `best-buy-tm.js`:

```js
const ITEM_KEYWORD = "5090";
const CREDITCARD_CVV = "***";
const TESTMODE = "Yes";
const SMS_DIGITS = "1111";
const PREFERRED_SHIPPING = "Yes";

const SHIPPING_FIRST_NAME = "John";
const SHIPPING_LAST_NAME = "Smith";
const SHIPPING_ADDRESS_1 = "100 Resellers Beware St";
const SHIPPING_ADDRESS_2 = "Apt 1A";
const SHIPPING_CITY = "Boise";
const SHIPPING_STATE = "IN";
const SHIPPING_ZIP = "83703";

const SOUND_ENABLED = "Yes";
```

Guidance:

- `ITEM_KEYWORD` must match the product title you expect the script to act on.
- `TESTMODE = "Yes"` performs the flow up to the final user confirmation point without placing the order.
- `PREFERRED_SHIPPING = "Yes"` makes the script try to switch fulfillment from pickup to shipping before checkout.
- Shipping constants are used to fill the Best Buy shipping address form when that form appears.
- `SOUND_ENABLED = "Yes"` enables status sounds from the committed fork assets.

## Sound Events

The script plays these clips from `assets/audio/`:

- `stock-detected.mp3` when the real PDP resolves to an in-stock Add to Cart state
- `add-to-cart-clicked.mp3` when the script clicks Add to Cart
- `cart-confirmed.mp3` when the target item is confirmed in cart
- `checkout-page-ready.mp3` when the target item is confirmed on the checkout page
- `manual-confirmation-required.mp3` when `TESTMODE` stops at the final user confirmation step

The sold-out state is visual only. The badge turns red and reads `SOLD OUT`, but no sound is played.

## Behavior Notes

- The installable script is the root-level `best-buy-tm.js`.
- The script is designed around the real PDP purchase module for the current SKU. It should not act on recommended-item buttons.
- Audio clips are loaded from the fork’s raw GitHub asset URLs under `assets/audio/`.
- If Best Buy changes markup again, selectors around fulfillment and checkout may need another update.

## Verification

Static check:

```bash
node --check best-buy-tm.js
```

Recommended browser checks:

- Sold-out PDP shows a red `SOLD OUT` badge and stays idle.
- In-stock PDP for the real SKU plays the stock-detected sound once.
- Checkout in `TESTMODE` stops at the final prompt and plays the manual-confirmation clip once.

## License

This fork keeps the upstream MIT license. See [LICENSE](./LICENSE).
