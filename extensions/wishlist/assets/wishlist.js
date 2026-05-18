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

  const _customerId = window.ShopifyAnalytics?.meta?.page?.customerId
                   || window.ShopifyAnalytics?.meta?.customerId
                   || null;

  /**
   * Check whether a product is already in the customer's wishlist
   * and update the button state accordingly.
   */
  window.checkWishlist = async function (btn, productId, cId) {
    try {
      const res  = await fetch(
        `/apps/wishlist/api/wishlist-check?productId=${productId}&customerId=${cId}&shop=${Shopify.shop}`
      );
      const data = await res.json();
      btn.classList.toggle('product-in-wishlist', !!data.exists);
      btn.dataset.added = data.exists ? 'true' : 'false';
    } catch (err) {
      console.error('[Wishlist] checkWishlist:', err);
    } finally {
      btn.style.visibility = 'visible'; // always show, even on error
    }
  };

  /**
   * Refresh the wishlist count badge(s) in the header / floating button.
   */
  window.loadWishlistCount = async function () {
    if (!_customerId) return;
    try {
      const res  = await fetch(
        `/apps/wishlist/api/wishlist-count?shop=${Shopify.shop}&customerId=${_customerId}`
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

    const wishlistType   = settings.wishlist_content_type || 'pop-up';
    const wishlistTitle  = settings.wishlist_page_title   || 'My Wishlist';
    const cssClass       = window.wishlistCustomClass     || '';
    const isWishlistPage = window.location.pathname.includes('/pages/wishlist');
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
        popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;z-index:9999;';
      } else {
        popup.style.cssText = 'position:relative;width:100%;height:100%;display:flex;';
      }

      popup.innerHTML = `
        <div
          id="wishlist_overlay"
          class="wishlist_overlay"
          style="position:fixed;top:0;right:0;bottom:0;left:0;display:none;background:rgba(0,0,0,0.2);"
          aria-hidden="true"
        ></div>
        <div class="wishlist-popup" role="dialog" aria-modal="true" aria-label="${wishlistTitle}">
          <div class="popup-header">
            <div class="popup-header-container">
              <h2>${wishlistTitle}</h2>
              <button id="closeWishlist" class="closeWishlist wishlist-button" aria-label="Close wishlist">
                <svg width="20" height="20" focusable="false" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="MuiDialogContent-dividers">
            <div class="MuiDialogContentText-root">
              <div class="wishlist-hero-list-header" style="display:none;font-size:20px;max-width:100%;justify-content:center;" role="alert">
                <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                  <path fill="currentColor" d="M416 448h-84c-6.6 0-12-5.4-12-12v-40c0-6.6 5.4-12 12-12h84c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32h-84c-6.6 0-12-5.4-12-12V76c0-6.6 5.4-12 12-12h84c53 0 96 43 96 96v192c0 53-43 96-96 96zm-47-201L201 79c-15-15-41-4.5-41 17v96H24c-13.3 0-24 10.7-24 24v96c0 13.3 10.7 24 24 24h136v96c0 21.5 26 32 41 17l168-168c9.3-9.4 9.3-24.6 0-34z"/>
                </svg>
                Please login to save your wishlist across devices.
                <button class="wishlist-hero-list-header-login wishlist-button" type="button" aria-label="Login to save wishlist">
                  <a href="${window.location.origin}/account/login" style="color:#007ace;">Login</a>
                </button>
              </div>
              <div
                class="wishlist-hero-list-no-items-text"
                style="display:none;text-align:center;padding:8%;"
                role="status"
                aria-live="polite"
              >
                There are no items in this wishlist
              </div>
              <div class="wishlist-items" role="list"></div>
            </div>
          </div>
        </div>
      `;

      if (wishlistType === 'separate_page' && isWishlistPage) {
        main.appendChild(popup);
      } else {
        document.body.appendChild(popup);
      }
    }


    // ── SECTION 4 — DOM CACHE ──────────────────────────────────────────────────

    const DOM = {
      popup:    document.querySelector('.wishlisthero-popup-display-container'),
      itemsBox: document.querySelector('.wishlist-items'),
      emptyBox: document.querySelector('.wishlist-hero-list-no-items-text'),
      loginBox: document.querySelector('.wishlist-hero-list-header'),
    };


    // ── SECTION 5 — PRELOAD WISHLIST DATA ─────────────────────────────────────

    window.preloadWishlist = async function () {
      if (!_customerId) return;

      try {
        const res  = await fetch(
          `/apps/wishlist/api/wishlist-items?shop=${Shopify.shop}&customerId=${_customerId}`
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
      }
    };


    // ── SECTION 6 — LOAD & RENDER ─────────────────────────────────────────────

    async function loadWishlist() {
      DOM.loginBox.style.display = 'none';
      DOM.emptyBox.style.display = 'none';
      DOM.itemsBox.style.display = 'none';

      if (!_customerId) {
        DOM.loginBox.style.display = 'block';
        return;
      }

      if (!wishlistCache.loaded) {
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
              <div class="wishlist-product-image" style="display:flex;">
                <img
                  src="${product.featured_image}"
                  alt="${safeTitle}"
                  width="100%"
                  loading="lazy"
                  style="border-radius:10px;"
                >
              </div>
              <div class="wishlist-item-head">
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
                <button
                  data-id="${item.variantId}"
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
                </button>
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


    // ── SECTION 7 — POPUP OPEN / CLOSE EVENTS ────────────────────────────────

    document.addEventListener('click', (e) => {
      if (e.target.closest('.openWishlist')) {
        e.preventDefault();
        if (wishlistType === 'separate_page') {
          window.location.href = '/pages/wishlist';
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

        try {
          await fetch('/apps/wishlist/api/wishlist-remove', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ shop: Shopify.shop, productId, customerId: _customerId }),
          });
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
        addBtn.querySelector('.loading__spinner')?.classList.remove('hidden');
        if (variantId) addToCartWishlist(variantId, addBtn);
      }
    });


    // ── SECTION 9 — ADD TO CART + CART DRAWER UPDATE ──────────────────────────

    function addToCartWishlist(variantId, btn) {
      fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      })
      .then(r => r.json())
      .then(() => {
        DOM.popup.style.display = 'none';
        cartUpdate();
        btn.querySelector('.loading__spinner')?.classList.add('hidden');
      })
      .catch((err) => {
        console.error('[Wishlist] addToCart:', err);
        btn.querySelector('.loading__spinner')?.classList.add('hidden');
      });
    }

    function cartUpdate() {
      const drawer = document.querySelector('cart-drawer');
      if (!drawer) { window.location.href = '/cart'; return; }

      fetch('/?sections=cart-drawer')
        .then(r => r.json())
        .then(data => {
          const parser     = new DOMParser();
          const parsed     = parser.parseFromString(data['cart-drawer'], 'text/html');
          const newDrawer  = parsed.querySelector('#CartDrawer');
          const currDrawer = document.querySelector('#CartDrawer');
          if (newDrawer && currDrawer) currDrawer.innerHTML = newDrawer.innerHTML;
        });

      setTimeout(() => {
        drawer.classList.remove('is-empty');
        drawer.classList.add('animate', 'active');
        fetch('/cart.js')
          .then(r => r.json())
          .then(cart => {
            document.querySelectorAll('.cart-item__count').forEach(b => {
              b.textContent = cart.item_count;
            });
          });
      }, 500);
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

              const data       = await res.json();
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

    window.showWishlistPopup = function (product) {
      if (!toastEnabled) return;

      // Remove existing toast if any
      document.querySelector('.add-to-wishlist-notification')?.remove();

      const toast = document.createElement('div');
      toast.className = `add-to-wishlist-notification ${toastPosition}`;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      const safeTitle = (product.title || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      toast.innerHTML = `
        <div class="wishlist-toast-popup">
          <div class="wishlist-toast-image">
            <img src="${product.image}" alt="${safeTitle}" loading="lazy">
          </div>
          <div class="wishlist-toast-content">
            <span class="wishlist-toast-title">
              <a href="${product.url}">${safeTitle}</a>
            </span>
            <span class="wishlist-toast-message">has been added to wishlist successfully</span>
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


    // ── SECTION 12 — BOOTSTRAP ────────────────────────────────────────────────

    window.preloadWishlist();
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