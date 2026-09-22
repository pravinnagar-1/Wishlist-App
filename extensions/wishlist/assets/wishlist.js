/**
 * wishlist.js — single CDN-served asset
 * Covers: popup/modal, product-page heart button, count badge, toast notification.
 * Loaded via app-configuration.liquid with `defer`.
 */
(function wishlistApp() {

  // Guard against double-execution (e.g. multiple blocks each loading this file)
  if (window._wishlistJsLoaded) return;
  window._wishlistJsLoaded = true;

  if (!window.WishlistConfigApp?.enabled) return;

  console.log('Wishlist script loaded');

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1 — GLOBALS THAT DO NOT NEED SETTINGS
  // Defined BEFORE the settings await so block DOMContentLoaded handlers can use them.
  // ─────────────────────────────────────────────────────────────────────────────

  const _customerId = window.wishlistCustomerId
    ? String(window.wishlistCustomerId)
    : window.ShopifyAnalytics?.meta?.page?.customerId
      ? String(window.ShopifyAnalytics.meta.page.customerId)
      : null;

  /**
   * Check whether a product is already in the customer's wishlist
   * and update the button state accordingly.
   */
  window.checkWishlist = async function (btn, productId, cId) {
    // No customer ID means guest — show button but never mark as added
    if (!cId) {
      btn.classList.remove('product-in-wishlist');
      btn.dataset.added = 'false';
      btn.style.visibility = 'visible';
      return;
    }

    try {
      const res  = await fetch(
        `/apps/wishlist/api/wishlist-check?productId=${productId}&customerId=${cId}`,
         { cache: 'no-store' }
      );
      const data = await res.json();
      btn.classList.toggle('product-in-wishlist', !!data.exists);
      btn.dataset.added = data.exists ? 'true' : 'false';
    } catch (err) {
      console.error('[Wishlist] checkWishlist:', err);
    } finally {
      btn.style.visibility = 'visible';
    }
  };

  /**
   * Refresh the wishlist count badge(s) in the header / floating button.
   */
  window.loadWishlistCount = async function () {
    if (!_customerId) return;
    try {
      const res  = await fetch(
        `/apps/wishlist/api/wishlist-count?customerId=${_customerId}`
      );
      const data = await res.json();
      document.querySelectorAll('.wishlist-count').forEach((badge) => {
        badge.textContent      = data.count;
        badge.style.visibility = data.count === 0 ? 'hidden' : 'visible';
      });
    } catch (err) {
      console.error('[Wishlist] loadWishlistCount:', err);
    }
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2 — ASYNC INIT (awaits settings, then builds everything)
  // ─────────────────────────────────────────────────────────────────────────────

  async function initApp() {

    // Use the shared promise from app-configuration.liquid.
    // Fallback fetch is only triggered if this script loads without that block.
    const settingsPromise = window.wishlistSettingsPromise
      || fetch('/apps/wishlist/api/wishlist-settings').then(r => r.json()).catch(() => ({}));

    let settings = {};
    try {
      settings = await settingsPromise;
    } catch {
      console.warn('[Wishlist] Could not load settings, using defaults.');
    }

    // ── Config from settings ──────────────────────────────────────────────────
console.log(settings);
    const wishlistType   = settings.wishlist_content_type || 'pop-up';
    const wishlistTitle  = settings.wishlist_page_title   || 'My Wishlist';
    const cssClass       = window.wishlistCustomClass     || '';
    const showVendor    =  settings.show_vendor     || false;
    const showAddBtn    =  settings.show_add_to_cart     || true;
    const showSoldOut   =  settings.show_sold_out     || false;
    const stayOnPage  =   settings.stay_on_page     || false;
    const removeAfterCart  =   settings.remove_after_cart   || false;
    const shareEnabled  =  settings.enable_share ?? true;   // merchant on/off switch for "Share wishlist"
    // The wishlist "page" is served directly from the app proxy base URL
    // (/apps/wishlist) — no Shopify Page record involved. Shopify renders our
    // proxy response through the theme's normal layout (header/footer/
    // announcement bar included), and the URL in the browser stays
    // /apps/wishlist, so this path check is all that's needed.
    // Exact-match (with optional trailing slash or locale prefix like
    // /fr/apps/wishlist) — not a loose .includes(), which would also match
    // an unrelated proxy path like /apps/wishlist-something.
    const isWishlistPage = /\/apps\/wishlist\/?$/.test(window.location.pathname);
    const main           = document.querySelector('main') || document.body;

    // Currency — use store's active currency, not hardcoded USD
    const currency = window.Shopify?.currency?.active || 'USD';
    const locale   = (window.Shopify?.locale || navigator.language || 'en').replace('_', '-');

    // Toast config — read once here, never re-fetched on each add
    const toastEnabled  = settings.notification_show ?? true;   // ?? not || (false must work)
    const toastPosition = settings.notification_postion  || 'top_left';
    const toastDuration = settings.notification_duration || '1';

    // Internal state
    let wishlistCache = { items: [], loaded: false };


    // ── SECTION 3 — BUILD POPUP DOM (once only) ──────────────────────────────

    if (!document.querySelector('.wishlisthero-popup-display-container')) {
      const popup = document.createElement('div');
      popup.className = `wishlisthero-popup-display-container ${cssClass} wishlist-${wishlistType}`;

      if (wishlistType !== 'separate_page') {
        // Pop-up / side drawer: always in the DOM, hidden by CSS by default,
        // shown via the .show-wishlist class when the trigger is clicked.
        popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;z-index:9999;';
      } else if (isWishlistPage) {
        // Separate page mode, and we ARE on /apps/wishlist — show it.
        popup.style.cssText = 'position:relative;width:100%;height:100%;display:flex;';
      } else {
        // Separate page mode, but this is some OTHER page (home, product,
        // etc.) — the container still gets built (so preloadWishlist/
        // loadWishlist/DOM.* keep working without null-reference errors),
        // but it must stay invisible here. Only the dedicated wishlist page
        // should ever show wishlist content.
        popup.style.cssText = 'display:none;';
      }

      // Buttons shared by all three layouts — the separate-page header, and
      // the action row under the header in pop-up / side-drawer mode (only
      // one layout is ever built per page load, so the #shareWishlist /
      // #addAllToCart ids stay unique).
      const isPage = wishlistType === 'separate_page';

      const shareBtnHtml = shareEnabled ? `
        <button id="shareWishlist" class="wishlist-page-share-btn shareWishlist" type="button" aria-label="Share wishlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>Share wishlist</span>
        </button>
      ` : '';

      const addAllBtnHtml = showAddBtn ? `
        <button id="addAllToCart" class="wishlist-page-add-all-btn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span>Add all to cart</span>
        </button>
      ` : '';

      const closeBtnHtml = `
        <button id="closeWishlist" class="closeWishlist wishlist-button" aria-label="Close wishlist">
          <svg width="20" height="20" focusable="false" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;

      const titleRowHtml = `
        <div class="wishlist-page-title-row">
          <h2>${wishlistTitle}</h2>
          <span class="wishlist-count-badge">0</span>
        </div>
      `;

      popup.innerHTML = `
        <div
          id="wishlist_overlay"
          class="wishlist_overlay"
          style="position:fixed;top:0;right:0;bottom:0;left:0;display:none;background:rgba(0,0,0,0.2);"
          aria-hidden="true"
        ></div>
        ${isPage ? `
          <a href="/" class="wishlist-back-home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to home
          </a>
        ` : ''}
        <div class="wishlist-popup" role="dialog" aria-modal="true" aria-label="${wishlistTitle}">
          <div class="popup-header">
            <div class="popup-header-container">
              ${isPage ? `
                ${titleRowHtml}
                <div class="wishlist-page-actions">${shareBtnHtml}${addAllBtnHtml}</div>
              ` : `
                ${titleRowHtml}
                ${closeBtnHtml}
              `}
            </div>
            ${!isPage ? `<div class="wishlist-header-actions">${shareBtnHtml}${addAllBtnHtml}</div>` : ''}
          </div>
          <div class="MuiDialogContent-dividers">
            <div class="MuiDialogContentText-root">
              <div class="wishlist-hero-list-header" style="display:none;" role="alert">
                <h3>Login Required</h3>
                <p>Please login to add items to your wishlist.</p>
              </div>
              <div
                class="wishlist-hero-list-loading"
                style="display:none;text-align:center;padding:7%;"
                role="status"
                aria-live="polite"
              >
                <div class="wishlist-spinner">
                </div>
                <span>Loading your wishlist...</span>
              </div>
              <div
                class="wishlist-hero-list-no-items-text"
                style="display:none;text-align:center;padding:8%;font-size: 18px;"
                role="status"
                aria-live="polite"
              >
              <div class="wishlist-hero-list-no-items-text-content"
              
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="37" height="33" viewBox="0 0 37 33" fill="none">
                  <path d="M18.1999 31.5344C18.1999 31.5344 1.3999 21.7344 1.3999 10.1344C1.41481 8.13203 2.11218 6.19462 3.37684 4.64211C4.64151 3.0896 6.39783 2.01482 8.3558 1.59525C10.3138 1.17569 12.3563 1.43643 14.1461 2.33442C15.9358 3.23241 17.3658 4.71395 18.1999 6.53439C19.034 4.71395 20.464 3.23241 22.2537 2.33442C24.0435 1.43643 26.086 1.17569 28.044 1.59525C30.002 2.01482 31.7583 3.0896 33.023 4.64211C34.2876 6.19462 34.985 8.13203 34.9999 10.1344C34.9999 21.7344 18.1999 31.5344 18.1999 31.5344Z" stroke="black" stroke-width="2.8" stroke-linejoin="round"/>
                </svg>
                <h3>There are no items in this wishlist</h3>
                <p class="wishlist-empty-subtext">Tap the heart on any product to save it here for later.</p>
                <a href="/collections/all">Continue Shopping</a>
              </div>
              </div>
              <div class="wishlist-items" role="list"></div>
            </div>
          </div>
        </div>
      `;

      if (wishlistType === 'separate_page' && isWishlistPage) {
        // The theme renders its own page heading (e.g. "<h1>Wishlist</h1>")
        // above the page content — our popup already has its own header
        // (using the merchant-configured title), so showing both would be a
        // duplicate "Wishlist / Wishlist". This page's body is intentionally
        // empty (we create it that way), so any <h1> inside <main> at this
        // point can only be the theme's own auto title — hide it.
        const themePageHeading = main.querySelector('section');
        if (themePageHeading) themePageHeading.style.display = 'none';

        // NOTE: the server-rendered loading placeholder (#wishlist-proxy-page-
        // marker, from wishlist-proxy-page.server.js) is intentionally NOT
        // removed here — it stays up until loadWishlist() has real content
        // ready to show (see removeProxyPageMarker() calls below). Removing
        // it this early caused a double "Loading your wishlist..." flash:
        // this marker disappearing, then our own popup's loader appearing
        // for the data fetch that was still in flight.
        main.appendChild(popup);
      } else {
        document.body.appendChild(popup);
      }
    }


    // ── SECTION 4 — DOM CACHE ──────────────────────────────────────────────────

    const DOM = {
      popup:      document.querySelector('.wishlisthero-popup-display-container'),
      itemsBox:   document.querySelector('.wishlist-items'),
      emptyBox:   document.querySelector('.wishlist-hero-list-no-items-text'),
      loginBox:   document.querySelector('.wishlist-hero-list-header'),
      loadingBox: document.querySelector('.wishlist-hero-list-loading'),
    };


    // ── SECTION 5 — PRELOAD WISHLIST DATA ─────────────────────────────────────

    window.preloadWishlist = async function () {
      if (!_customerId) return;

      try {
        const res  = await fetch(
          `/apps/wishlist/api/wishlist-items?customerId=${_customerId}`
        );
        const data = await res.json();

        const productsData = await Promise.all(
          (data.items || []).map(async (item) => {
            try {
              const r       = await fetch(`/products/${item.productHandle}.js`);
              const product = await r.json();
              return { item, product };
            } catch {
              return { item, product: null };
            }
          })
        );

        wishlistCache.items  = productsData;
        wishlistCache.loaded = true;
        loadWishlist();
      } catch (e) {
        console.error('[Wishlist] preloadWishlist:', e);
        // Don't leave the spinner running forever if the fetch failed —
        // fall back to the empty state.
        DOM.loadingBox.style.display = 'none';
        DOM.emptyBox.style.display   = 'block';
        removeProxyPageMarker();
      }
    };


    // ── SECTION 6 — LOAD & RENDER ─────────────────────────────────────────────

    // Removes the server-rendered loading placeholder from
    // wishlist-proxy-page.server.js (only present on the /apps/wishlist
    // "separate page" — a no-op everywhere else). Called once real, final
    // content is ready to show (items, empty state, or the login prompt) so
    // there's exactly one loading indicator, not two shown back to back.
    function removeProxyPageMarker() {
      document.getElementById('wishlist-proxy-page-marker')?.remove();
    }

    async function loadWishlist() {
      DOM.loginBox.style.display   = 'none';
      DOM.emptyBox.style.display   = 'none';
      DOM.itemsBox.style.display   = 'none';
      DOM.loadingBox.style.display = 'none';

      if (!_customerId) {
        DOM.loginBox.style.display = 'flex';
        removeProxyPageMarker();
        return;
      }

      if (!wishlistCache.loaded) {
        // On the /apps/wishlist page the server-rendered marker is already
        // showing a loading spinner — don't stack our own on top of it too.
        if (!document.getElementById('wishlist-proxy-page-marker')) {
          DOM.loadingBox.style.display = 'block'; // show loader while data/products fetch
        }
        await window.preloadWishlist();
        return; // preloadWishlist calls loadWishlist itself after loading
      }

      renderWishlist(wishlistCache.items);
    }

    function formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    }

    function formatPrice(cents) {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
      } catch {
        return (cents / 100).toFixed(2);
      }
    }

    function renderWishlist(productsData) {
      removeProxyPageMarker();

      const countBadge = document.querySelector('.wishlist-count-badge');
      if (countBadge) countBadge.textContent = String(productsData.length);

      // The page/drawer headers (title, count, Share, Add all) only make
      // sense when there are items — the empty state is just the centered
      // message. CSS keys off this class.
      DOM.popup?.classList.toggle('wishlist-has-items', productsData.length > 0);

      if (!productsData.length) {
        DOM.emptyBox.style.display = 'block';
        return;
      }

      DOM.itemsBox.style.display = 'grid';
      let html = '';

      productsData.forEach(({ product, item }) => {
        if (!product) return;

        // Sanitise strings that go into HTML
        const safeTitle = product.title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

        html += `
          <div class="wishlist-item" role="listitem">
            <div class="wishlist-item-content">
              <div class="wishlist-product-image" style="display:flex;position:relative;">
                <img
                  src="${product.featured_image}"
                  alt="${safeTitle}"
                  width="100%"
                  loading="lazy"
                  style="border-radius:10px;"
                >
                ${
                  showSoldOut && !product.available
                    ? `
                      <div
                        class="wishlist-sold-out"
                        style="font-size: 11px;font-weight:400;color:#fff;background-color:#000;position: absolute;padding: 0px 10px;left: 0px;top: 0px;letter-spacing: 0;"
                      >
                        Sold Out
                      </div>
                    `
                    : ""
                }
              </div>
              <div class="wishlist-item-head">
                ${
                  showVendor
                    ? `
                      <span class="wishlist-product-vendor"
                        style="font-size:13px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;text-decoration:none;color:#000;"
                      >
                        ${product.vendor}
                      </span>
                    `
                    : ""
                }
                <span class="wishlist-product-title">
                  <a
                    href="${product.url}"
                    style="font-size:14px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;text-decoration:none;color:#000;"
                  >${safeTitle}</a>
                </span>
                <span class="wishlist-header-added-on" style="font-size:10px;display:none;">
                  ${formatDate(item.createdAt)}
                </span>
                <div class="wishlist-product-price" style="color:#000;font-size:15px;font-weight:600;letter-spacing:0;">
                  ${formatPrice(product.price)}
                </div>
              </div>
              <div class="wishlist-add-remove-button">
               ${ showAddBtn ? `
                <button
                  data-id="${item.variantId}"
                  data-product-id="${item.productId}"
                  class="wishlist-add-cart"
                  aria-label="Add ${safeTitle} to cart"
                  style="font-size:12px;width:100%;background-color:rgb(18,18,18);color:#fff;border:none;border-radius:6px;padding:12px 16px;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;"
                >
                  <span>Add to Cart</span>
                  <div class="loading__spinner hidden" style="width:1.6rem;height:1.7rem;" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" class="spinner" viewBox="0 0 66 66">
                      <circle style="stroke:#fff;" stroke-width="6" cx="33" cy="33" r="30" fill="none" class="path"/>
                    </svg>
                  </div>
                </button>` : '' }
                <button
                  data-id="${item.productId}"
                  class="removeBtn wishlist-button"
                  aria-label="Remove ${safeTitle} from wishlist"
                  style="min-width:40px;border:none;background:none;padding:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;position:absolute;top:5px;right:0;"
                >
                  <svg width="17" height="17" focusable="false" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      });

      DOM.itemsBox.innerHTML = html;
    }

    // Bulk-adds every wishlist item to the cart in one request (the
    // "Add all to cart" button on the separate wishlist page).
    async function addAllToCart() {
      const items = (wishlistCache.items || [])
        .filter(({ item }) => item?.variantId)
        .map(({ item }) => ({ id: Number(item.variantId), quantity: 1 }));

      if (!items.length) return;

      const btn      = document.getElementById('addAllToCart');
      const labelEl  = btn?.querySelector('span');
      const oldLabel = labelEl?.textContent;
      if (btn) btn.setAttribute('disabled', 'true');
      if (labelEl) labelEl.textContent = 'Adding...';

      try {
        await fetch('/cart/add.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ items }),
        });
        window.location.href = '/cart';
      } catch (err) {
        console.error('[Wishlist] addAllToCart:', err);
        if (btn) btn.removeAttribute('disabled');
        if (labelEl && oldLabel) labelEl.textContent = oldLabel;
      }
    }

    // ── SECTION 7 — POPUP OPEN / CLOSE EVENTS ────────────────────────────────

    document.addEventListener('click', (e) => {
      if (e.target.closest('.openWishlist')) {
        e.preventDefault();
        if (wishlistType === 'separate_page') {
          window.location.href = '/apps/wishlist';
          return;
        }
        DOM.popup.classList.add('show-wishlist');
        window.preloadWishlist?.();
        loadWishlist();
      }

      if (e.target.closest('.closeWishlist')) {
        DOM.popup.classList.remove('show-wishlist');
      }

      // Close on overlay click
      if (e.target.id === 'wishlist_overlay') {
        DOM.popup.classList.remove('show-wishlist');
      }

      // openWishlist / closeWishlist share
      if (e.target.closest('#shareWishlist')) {
        e.preventDefault();
        openSharePopup();
      }

      if (e.target.closest('#addAllToCart')) {
        e.preventDefault();
        addAllToCart();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') DOM.popup.classList.remove('show-wishlist');
    });


    // ── SECTION 8 — POPUP ITEM EVENTS (remove / add to cart) ─────────────────

    DOM.itemsBox.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('.removeBtn');
      const addBtn    = e.target.closest('.wishlist-add-cart');

      if (removeBtn) {
        const productId = removeBtn.dataset.id;
        removeBtn.setAttribute('disabled', 'true');

        // Grab the product info straight from the card being removed —
        // it's already on screen, no need for an extra product fetch.
        const card      = removeBtn.closest('.wishlist-item');
        const imgEl     = card?.querySelector('.wishlist-product-image img');
        const titleLink = card?.querySelector('.wishlist-product-title a');

        try {
          await fetch('/apps/wishlist/api/wishlist-remove', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ shop: Shopify.shop, productId, customerId: _customerId }),
          });

          if (titleLink) {
            window.showWishlistPopup({
              title: titleLink.textContent.trim(),
              image: imgEl?.src || '',
              url:   titleLink.href,
            }, 'removed');
          }

          wishlistCache.loaded = false;
          window.preloadWishlist?.();
          window.loadWishlistCount?.();
          window.initWishlist?.();
        } finally {
          removeBtn.removeAttribute('disabled');
        }
      }

      if (addBtn) {
        const variantId = addBtn.dataset.id;
        const productId = addBtn.dataset.productId;
        addBtn.querySelector('.loading__spinner')?.classList.remove('hidden');
        if (variantId) addToCartWishlist(variantId, addBtn, productId);
      }
    });


    // ── SECTION 9 — ADD TO CART + CART DRAWER UPDATE ──────────────────────────

    function addToCartWishlist(variantId, btn, productId) {
      fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      })
      .then(r => r.json())
      .then(() => {
        DOM.popup.style.display = 'none';
        if(!stayOnPage){ cartUpdate(); };
        if(removeAfterCart){ rmveAftrCart(productId); };
        btn.querySelector('.loading__spinner')?.classList.add('hidden');
      })
      .catch((err) => {
        console.error('[Wishlist] addToCart:', err);
        btn.querySelector('.loading__spinner')?.classList.add('hidden');
      });
    }

    function cartUpdate() {
      setTimeout(()=>{
        window.location.href = '/cart'; 
         return;
      }, 200);
    }

    async function rmveAftrCart(productId) {
      try {

        const response = await fetch("/apps/wishlist/api/wishlist-remove", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shop: Shopify.shop,
            productId: productId,
            customerId: _customerId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to remove wishlist item");
        }

        wishlistCache.loaded = false;

        await window.preloadWishlist?.();
        window.loadWishlistCount?.();
        window.initWishlist?.();

      } catch (error) {
        console.error("Wishlist remove error:", error);
      }
    }

    // ── SECTION 10 — HEART BUTTON (product page) ──────────────────────────────

    /**
     * Binds wishlist click behaviour to every .wishlist-btn on the page.
     * querySelectorAll handles collection pages, quick-view, etc.
     * Called on bootstrap and after wishlist changes.
     */
    window.initWishlist = function () {
      document.querySelectorAll('.wishlist-btn').forEach((btn) => {
        if (btn.dataset.listenerAdded) return;
        btn.dataset.listenerAdded = 'true';

        const productId     = btn.dataset.productId;
        const variantId     = btn.dataset.variantId;
        const btnCustomerId = btn.dataset.customerId;
        const productHandle = btn.dataset.productHandle;

        window.checkWishlist?.(btn, productId, btnCustomerId);

        btn.addEventListener('click', async () => {
          if (!btnCustomerId) {
            if (wishlistType === 'separate_page' && !isWishlistPage) {
              // The popup is intentionally hidden on every page except the
              // dedicated wishlist page in this mode — send them there
              // instead of opening a container nothing can see.
              window.location.href = '/apps/wishlist';
              return;
            }
            DOM.popup?.classList.add('show-wishlist');
            DOM.loginBox.style.display = 'flex';
            return;
          }

          const added = btn.dataset.added === 'true';
          btn.setAttribute('disabled', 'true');

          try {
            if (!added) {
              const res = await fetch('/apps/wishlist/api/wishlist-add', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  shop: Shopify.shop,
                  productId,
                  variantId,
                  customerId: btnCustomerId,
                  productHandle,
                }),
              });

              const data = await res.json();

              if (!data.success) {
                // Plan limit reached (or some other server-side rejection) —
                // show it instead of crashing on data.data being undefined.
                alert(data.error || 'Could not add this item to your wishlist.');
                return;
              }

              const productRes = await fetch(`/products/${data.data.productHandle}.js`);
              const product    = await productRes.json();

              window.showWishlistPopup({
                title: product.title,
                image: product.featured_image,
                url:   product.url,
              });

              btn.classList.add('product-in-wishlist');
              btn.dataset.added = 'true';
            } else {
              await fetch('/apps/wishlist/api/wishlist-remove', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  shop:       Shopify.shop,
                  productId,
                  customerId: btnCustomerId,
                }),
              });
              btn.classList.remove('product-in-wishlist');
              btn.dataset.added = 'false';

              try {
                const productRes = await fetch(`/products/${productHandle}.js`);
                const product    = await productRes.json();
                window.showWishlistPopup({
                  title: product.title,
                  image: product.featured_image,
                  url:   product.url,
                }, 'removed');
              } catch { /* toast is a nice-to-have — don't block removal on it */ }
            }

            window.loadWishlistCount?.();
            window.preloadWishlist?.();
          } catch (err) {
            console.error('[Wishlist] toggle:', err);
          } finally {
            btn.removeAttribute('disabled');
          }
        });
      });
    };


    // ── SECTION 11 — TOAST NOTIFICATION ──────────────────────────────────────
    // Settings are already loaded — no inner fetch needed.
    // Exposed on window so collection-icon.liquid can call it too.

    window.showWishlistPopup = function (product, action) {
      if (!toastEnabled) return;

      // Remove existing toast if any
      document.querySelector('.add-to-wishlist-notification')?.remove();

      const toast = document.createElement('div');
      toast.className = `add-to-wishlist-notification ${toastPosition}`;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      const safeTitle = (product.title || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const message = action === 'removed'
        ? 'has been removed from wishlist'
        : 'has been added to wishlist successfully';

      toast.innerHTML = `
        <div class="wishlist-toast-popup">
          <div class="wishlist-toast-image">
            <img src="${product.image}" alt="${safeTitle}" loading="lazy">
          </div>
          <div class="wishlist-toast-content">
            <span class="wishlist-toast-title">
              <a href="${product.url}">${safeTitle}</a>
            </span>
            <span class="wishlist-toast-message">${message}</span>
          </div>
        </div>
      `;

      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('show'));

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, Math.max(1, Number(toastDuration)) * 1000);
    };

    // ── SECTION 5B — SHARE POPUP ──────────────────────────────────────────────

    // Build the share overlay once and append to body
    let _shareOverlay = null;
    let _shareUrlBox  = null;

    function buildSharePopup() {
      if (_shareOverlay) return; // already built

      const overlay = document.createElement('div');
      overlay.className = 'wishlist-share-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Share wishlist');

      overlay.innerHTML = `
        <div class="wishlist-share-modal">

          <div class="wishlist-share-modal-header">
            <h3>Share your wishlist</h3>
            <button class="wishlist-share-close" aria-label="Close share popup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="wishlist-share-modal-body">

            <p class="wishlist-share-label">Share via</p>

            <div class="wishlist-share-socials">
              <a
                class="wishlist-share-social-btn"
                id="share-whatsapp"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on WhatsApp"
              >
                <div class="wishlist-share-social-icon" style="background:#25D366;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <span class="wishlist-share-social-name">WhatsApp</span>
              </a>
              <a
                class="wishlist-share-social-btn"
                id="share-facebook"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on Facebook"
              >
                <div class="wishlist-share-social-icon" style="background:#1877F2;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span class="wishlist-share-social-name">Facebook</span>
              </a>
              <a
                class="wishlist-share-social-btn"
                id="share-twitter"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on X"
              >
                <div class="wishlist-share-social-icon" style="background:#000;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <span class="wishlist-share-social-name">X</span>
              </a>
              <a
                class="wishlist-share-social-btn"
                id="share-email"
                href="#"
                aria-label="Share via Email"
              >
                <div class="wishlist-share-social-icon" style="background:#6366f1;">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                    stroke="white" stroke-width="2" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <span class="wishlist-share-social-name">Email</span>
              </a>
              <a
                class="wishlist-share-social-btn"
                id="share-pinterest"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Share on Pinterest"
              >
                <div class="wishlist-share-social-icon" style="background:#E60023;">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
                  </svg>
                </div>
                <span class="wishlist-share-social-name">Pinterest</span>
              </a>

            </div>

            <p class="wishlist-share-label" style="margin-top:0;">Or copy link</p>
            <div class="wishlist-share-copy-row">
              <div class="wishlist-share-url-box" id="wishlist-share-url-display">
                Generating link...
              </div>
              <button class="wishlist-share-copy-btn" id="wishlist-share-copy-btn" aria-label="Copy link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy
              </button>
            </div>

          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      _shareOverlay = overlay;
      _shareUrlBox  = overlay.querySelector('#wishlist-share-url-display');

      // Close on overlay background click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSharePopup();
      });

      // Close on X button
      overlay.querySelector('.wishlist-share-close').addEventListener('click', closeSharePopup);

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('show')) closeSharePopup();
      });

      // Copy button
      overlay.querySelector('#wishlist-share-copy-btn').addEventListener('click', async function() {
        const url = _shareUrlBox.dataset.url;
        if (!url) return;

        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard API blocked — use execCommand fallback
          const tmp = document.createElement('textarea');
          tmp.value = url;
          tmp.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand('copy');
          document.body.removeChild(tmp);
        }

        this.textContent = '✓ Copied!';
        this.classList.add('copied');
        setTimeout(() => {
          this.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy
          `;
          this.classList.remove('copied');
        }, 2500);
      });
    }

    function closeSharePopup() {
      if (_shareOverlay) _shareOverlay.classList.remove('show');
    }

    async function openSharePopup() {
      buildSharePopup(); // builds only once

      // Show overlay immediately — URL populates while it's visible
      _shareOverlay.classList.add('show');
      _shareUrlBox.textContent     = 'Generating link...';
      _shareUrlBox.dataset.url     = '';

      // Disable all social buttons while URL is loading
      _shareOverlay.querySelectorAll('.wishlist-share-social-btn').forEach(a => {
        a.style.pointerEvents = 'none';
        a.style.opacity       = '0.5';
      });

      // Generate the share URL
      let shareUrl = null;
      try {
        const res  = await fetch(
          `/apps/wishlist/api/wishlist-share-create`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        shareUrl   = data.url ?? null;
      } catch (err) {
        console.error('[Wishlist] openSharePopup:', err);
      }

      if (!shareUrl) {
        _shareUrlBox.textContent = 'Could not generate link. Please try again.';
        return;
      }

      // Populate URL display
      _shareUrlBox.textContent  = shareUrl;
      _shareUrlBox.dataset.url  = shareUrl;

      const encodedUrl  = encodeURIComponent(shareUrl);
      const encodedText = encodeURIComponent('Check out my wishlist!');

      // Set social share hrefs
      _shareOverlay.querySelector('#share-whatsapp').href =
        `https://wa.me/?text=${encodedText}%20${encodedUrl}`;

      _shareOverlay.querySelector('#share-facebook').href =
        `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

      _shareOverlay.querySelector('#share-twitter').href =
        `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;

      _shareOverlay.querySelector('#share-email').href =
        `mailto:?subject=${encodedText}&body=${encodedText}%20${encodedUrl}`;

      _shareOverlay.querySelector('#share-pinterest').href =
        `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`;

      // Re-enable social buttons
      _shareOverlay.querySelectorAll('.wishlist-share-social-btn').forEach(a => {
        a.style.pointerEvents = '';
        a.style.opacity       = '';
      });
    }

    // ── SECTION 12 — BOOTSTRAP ────────────────────────────────────────────────

    // loadWishlist() calls preloadWishlist() itself when the cache isn't
    // loaded yet (and shows the loading spinner while it does) — calling
    // preloadWishlist() separately here too used to kick off two concurrent
    // fetches for the same data on every page load.
    window.loadWishlistCount();
    window.initWishlist();
    loadWishlist();

  } // end initApp()


  // ─────────────────────────────────────────────────────────────────────────────
  // ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})(); // end IIFE