import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  document.body.insertAdjacentHTML('afterbegin', '<div style="padding:12px;background:#fff0cf;border-bottom:1px solid #ddbd76;font:12px monospace;text-align:center">Добавь VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env.local</div>');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_PUBLISHABLE_KEY || 'placeholder-key');
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₸';
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const escapeAttr = escapeHtml;
const fallbackImage = 'https://placehold.co/700x500/e9eff5/687887?text=GEARHUB';
const orderStatusLabels = {
  new: 'Новый', confirmed: 'Подтверждён', shipping: 'Передан в доставку',
  delivered: 'Доставлен', cancelled: 'Отменён'
};
const orderStatusValues = Object.entries(orderStatusLabels);

let session = null;
let authUser = null;
let profile = null;
let categories = [];
let products = [];
let orders = [];
let reviews = [];
let favorites = new Set(JSON.parse(localStorage.getItem('gh_favorites_guest') || '[]'));
let cart = JSON.parse(localStorage.getItem('gh_cart') || '[]');
let activeProduct = null;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2600);
}

function saveCart() {
  localStorage.setItem('gh_cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  $('#cartCount').textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function goToPage(name) {
  $$('.page').forEach((pageElement) => pageElement.classList.remove('active'));
  const target = $(`#${name}Page`);
  if (!target) return;
  target.classList.add('active');
  $$('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.page === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'catalog') renderCatalog();
  if (name === 'deals') renderSale();
  if (name === 'account') renderAccount();
}

function mapProduct(row) {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    categoryId: row.category_id,
    category: category?.name || categories.find((item) => item.id === row.category_id)?.name || 'Периферия',
    price: Number(row.price),
    oldPrice: Number(row.compare_at_price) || 0,
    badge: row.badge || 'GEAR',
    isNew: Boolean(row.is_new),
    image: row.image_url || fallbackImage,
    description: row.description || '',
    specs: Array.isArray(row.specs) ? row.specs : [],
    stock: Number(row.stock_quantity) || 0,
    isActive: row.is_active !== false,
    createdAt: row.created_at
  };
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,slug,description,sort_order,is_active')
    .order('sort_order');
  if (error) throw error;
  categories = data || [];
}

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name,slug)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  products = (data || []).map(mapProduct);
  renderHome();
  renderCatalog();
  renderSale();
}

async function loadReviews() {
  let query = supabase
    .from('reviews')
    .select('id,reviewer_name,rating,body,status,created_at,product_id')
    .order('created_at', { ascending: false });
  if (profile?.role !== 'admin') query = query.eq('status', 'approved');
  const { data, error } = await query;
  if (error) throw error;
  reviews = data || [];
  renderReviews();
}

async function loadFavorites() {
  if (!authUser) {
    favorites = new Set(JSON.parse(localStorage.getItem('gh_favorites_guest') || '[]'));
    return;
  }
  const { data, error } = await supabase.from('favorites').select('product_id');
  if (error) throw error;
  favorites = new Set((data || []).map((item) => item.product_id));
}

async function loadAccountData() {
  if (!authUser) {
    profile = null;
    orders = [];
    return;
  }
  const { data: profileData, error: profileError } = await supabase
    .from('profiles').select('*').eq('id', authUser.id).maybeSingle();
  if (profileError) throw profileError;
  profile = profileData;

  // Load orders and their lines separately. This avoids relying on a nested
  // PostgREST relationship expansion at checkout/account refresh time.
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id,order_number,user_id,customer_name,phone,shipping_address,comment,status,total,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (orderError) throw orderError;

  const orderRows = orderData || [];
  const orderIds = orderRows.map((order) => order.id);
  let itemRows = [];
  if (orderIds.length) {
    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .select('id,order_id,product_id,product_name,sku,unit_price,quantity,line_total,created_at')
      .in('order_id', orderIds);
    if (itemsError) throw itemsError;
    itemRows = itemsData || [];
  }

  const itemsByOrder = new Map();
  for (const item of itemRows) {
    const current = itemsByOrder.get(item.order_id) || [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }
  orders = orderRows.map((order) => ({ ...order, order_items: itemsByOrder.get(order.id) || [] }));
}

async function refreshStore() {
  try {
    await loadCategories();
    await loadProducts();
    await loadReviews();
    await loadFavorites();
    await loadAccountData();
    updateHeader();
    if ($('#accountPage').classList.contains('active')) renderAccount();
  } catch (error) {
    console.error('GearHub load error:', error);
    toast(`Ошибка загрузки: ${error.message || 'проверь подключение Supabase'}`);
  }
}

function updateHeader() {
  $('#loginBtn').textContent = authUser ? 'account' : 'log in';
  updateCartCount();
}

function priceMarkup(product) {
  return `<span class="product-price">${product.oldPrice > product.price ? `<span class="old-price">${money(product.oldPrice)}</span>` : ''}${money(product.price)}</span>`;
}

function productCard(product) {
  const liked = favorites.has(product.id);
  const discount = product.oldPrice > product.price ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  const badgeText = discount ? `-${discount}%` : product.badge;
  return `
    <article class="product-card">
      <div class="product-image" data-product="${escapeAttr(product.id)}">
        <span class="product-badge ${discount ? 'discount-badge' : ''}">${escapeHtml(badgeText)}</span>
        <button class="heart-btn ${liked ? 'liked' : ''}" data-fav="${escapeAttr(product.id)}" aria-label="В избранное">${liked ? '♥' : '♡'}</button>
        <img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy" onerror="this.src='${fallbackImage}'">
      </div>
      <div class="product-info">
        <div class="product-category">${escapeHtml(product.category)}</div>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-desc">${escapeHtml(product.description)}</p>
        <div class="product-bottom">${priceMarkup(product)}<button class="add-btn" data-add="${escapeAttr(product.id)}" ${product.stock < 1 ? 'disabled' : ''}>${product.stock < 1 ? 'out of stock' : '+ add to bag'}</button></div>
      </div>
    </article>`;
}

function renderHome() {
  $('#homeProducts').innerHTML = products.filter((product) => product.isNew && product.isActive).slice(0, 4).map(productCard).join('');
  if (!$('#homeProducts').innerHTML) $('#homeProducts').innerHTML = '<p class="empty-state">Новинки скоро появятся.</p>';
}

function renderReviews() {
  const list = reviews.filter((review) => review.status === 'approved').slice(0, 3);
  $('#homeReviews').innerHTML = list.length ? list.map((review) => `
    <article class="review-card">
      <div class="review-top"><span>${escapeHtml(review.reviewer_name || 'GearHub customer')}</span><span class="review-date">${new Date(review.created_at).toLocaleDateString('ru-RU')}</span></div>
      <div class="stars">${'★'.repeat(review.rating)}</div>
      <p class="review-text">${escapeHtml(review.body)}</p>
    </article>`).join('') : '<div class="review-card"><p class="review-text">Пока нет опубликованных отзывов. Стань первым, кто поделится впечатлениями!</p></div>';
}

function getFilteredProducts() {
  let list = products.filter((product) => product.isActive || profile?.role === 'admin');
  const category = $('input[name="category"]:checked')?.value || 'all';
  const search = $('#searchInput').value.trim().toLowerCase();
  const min = Number($('#minPrice').value) || 0;
  const max = Number($('#maxPrice').value) || Infinity;
  if (category !== 'all') list = list.filter((product) => product.category === category);
  if (search) list = list.filter((product) => `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search));
  list = list.filter((product) => product.price >= min && product.price <= max);
  if ($('#saleOnly').checked) list = list.filter((product) => product.oldPrice > product.price);
  const sort = $('#sortSelect').value;
  if (sort === 'priceAsc') list.sort((a, b) => a.price - b.price);
  if (sort === 'priceDesc') list.sort((a, b) => b.price - a.price);
  if (sort === 'newest') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

function renderCatalog() {
  const list = getFilteredProducts();
  $('#catalogProducts').innerHTML = list.map(productCard).join('');
  $('#resultCount').textContent = `${list.length} products`;
  $('#emptyState').classList.toggle('hidden', list.length > 0);
}

function renderSale() {
  const list = products.filter((product) => product.isActive && product.oldPrice > product.price);
  $('#saleProducts').innerHTML = list.length ? list.map(productCard).join('') : '<p class="empty-state">Скоро появятся новые предложения.</p>';
}

function openModal(content) {
  $('#modalContent').innerHTML = content;
  $('#modalOverlay').classList.remove('hidden');
}

function closeModal() {
  $('#modalOverlay').classList.add('hidden');
}

function addToCart(productId, quantity = 1) {
  const product = products.find((item) => item.id === productId);
  if (!product) return toast('Товар не найден');
  if (product.stock < 1) return toast('Товара пока нет в наличии');
  const current = cart.find((item) => item.productId === productId);
  const nextQuantity = (current?.quantity || 0) + quantity;
  if (nextQuantity > product.stock) return toast(`Доступно только ${product.stock} шт.`);
  if (current) current.quantity = nextQuantity;
  else cart.push({ productId, quantity });
  saveCart();
  toast('Добавлено в корзину ✓');
}

function showProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  activeProduct = product;
  openModal(`
    <div class="product-modal-layout">
      <div class="product-modal-image"><img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" onerror="this.src='${fallbackImage}'"></div>
      <div>
        <div class="product-category">${escapeHtml(product.category)} / GEARHUB DROP</div>
        <h2>${escapeHtml(product.name)}</h2>
        <p class="modal-desc">${escapeHtml(product.description)}</p>
        <div class="spec-list">${product.specs.map((spec) => `• ${escapeHtml(spec)}`).join('<br>')}<br>• В наличии: ${product.stock}</div>
        <div class="modal-price">${priceMarkup(product)}</div>
        <div class="modal-actions"><input id="modalQty" type="number" min="1" max="${Math.max(1, product.stock)}" value="1"><button class="black-btn" data-add="${escapeAttr(product.id)}" ${product.stock < 1 ? 'disabled' : ''}>add to bag ↗</button></div>
        ${authUser ? `<form id="reviewForm" class="review-form"><h3>leave a review</h3><label>rating<select name="rating" required><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></label><textarea name="body" rows="3" maxlength="1000" required placeholder="Расскажи о товаре..."></textarea><button class="blue-btn">send for moderation</button></form>` : '<p class="modal-desc">Войди в аккаунт, чтобы оставить отзыв.</p>'}
      </div>
    </div>`);
}

function cartItems() {
  return cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item) => item.product);
}

function showCart() {
  const items = cartItems();
  if (!items.length) {
    openModal('<div class="auth-form"><h2>your bag.</h2><p>Корзина пока пустая. Самое время найти что-нибудь для своего сетапа.</p><button class="black-btn" data-close>go shopping ↗</button></div>');
    return;
  }
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const rows = items.map(({ product, quantity }) => `
    <div class="cart-row"><img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}">
      <div><strong>${escapeHtml(product.name)}</strong><br>${money(product.price)} × ${quantity}<br><button data-remove="${escapeAttr(product.id)}">remove</button></div>
      <div>${money(product.price * quantity)}</div>
    </div>`).join('');
  openModal(`<h2>your bag.</h2><div class="cart-list">${rows}</div><div class="cart-total"><span>total</span><strong>${money(total)}</strong></div><button class="black-btn" id="checkoutBtn">checkout ↗</button>`);
}

function showAuth(mode = 'login') {
  const signup = mode === 'signup';
  openModal(`
    <div class="auth-form"><p class="eyebrow">WELCOME TO GEARHUB</p><h2>${signup ? 'create account.' : 'log in.'}</h2>
      <p>${signup ? 'Создай аккаунт, чтобы сохранять заказы и адрес доставки.' : 'Войди, чтобы посмотреть заказы и личный кабинет.'}</p>
      <form id="authForm" novalidate>
        ${signup ? '<label>name<input name="name" required maxlength="100" autocomplete="name" placeholder="Your name"></label>' : ''}
        <label>email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <label>password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required placeholder="${signup ? 'Не менее 8 символов' : 'Пароль'}"></label>
        <button class="black-btn auth-submit" id="authSubmitBtn" type="submit">${signup ? 'create account' : 'log in'} ↗</button>
        <p class="auth-feedback" id="authFeedback" role="status" aria-live="polite"></p>
      </form>
      ${!signup ? '<div class="auth-helpers"><button type="button" data-auth-action="reset">Забыли пароль?</button><button type="button" data-auth-action="resend">Отправить подтверждение ещё раз</button></div>' : ''}
      <button class="auth-switch" id="authSwitch" type="button">${signup ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
    </div>`);

  // Bind directly to the newly-created form. The previous delegated submit
  // listener was fragile when modal contents were replaced during auth flows.
  const authForm = $('#authForm');
  if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
}

function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'Неверный email или пароль. Проверь данные или восстанови пароль.';
  if (message.includes('email not confirmed')) return 'Email ещё не подтверждён. Открой письмо Supabase или запроси повторную отправку.';
  if (message.includes('user already registered')) return 'Этот email уже зарегистрирован. Переключись на вход в аккаунт.';
  if (message.includes('password should be at least')) return 'Пароль слишком короткий. Используй не менее 8 символов.';
  if (message.includes('rate limit') || message.includes('over_email_send_rate_limit')) return 'Слишком много попыток или писем. Подожди немного и попробуй снова.';
  if (message.includes('redirect') && (message.includes('allow') || message.includes('not allowed'))) return 'Адрес возврата не добавлен в Supabase Auth → URL Configuration. Добавь текущий адрес сайта в Redirect URLs.';
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')) return 'Не удалось связаться с Supabase. Проверь интернет и значения VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY в .env.local.';
  if (message.includes('signup is disabled') || message.includes('signups not allowed')) return 'Регистрация отключена в Supabase. Включи Email provider и разреши новые регистрации в Authentication → Sign In / Providers.';
  if (message.includes('database error saving new user')) return 'Supabase не смог создать профиль. Проверь триггер регистрации в Database → Functions и повтори попытку.';
  return error?.message || 'Не удалось выполнить авторизацию. Проверь подключение и настройки Supabase Auth.';
}

async function resendSignupEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return toast('Сначала введи email в поле выше');
  const { error } = await supabase.auth.resend({
    type: 'signup', email: value,
    options: { emailRedirectTo: `${window.location.origin}/` }
  });
  if (error) return toast(authErrorMessage(error));
  toast('Письмо для подтверждения отправлено повторно ✓');
}

async function sendPasswordReset(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return toast('Сначала введи email в поле выше');
  const { error } = await supabase.auth.resetPasswordForEmail(value, {
    redirectTo: `${window.location.origin}/`
  });
  if (error) return toast(authErrorMessage(error));
  toast('Ссылка для сброса пароля отправлена на почту ✓');
}

function showPasswordRecovery() {
  openModal(`<div class="auth-form"><p class="eyebrow">ACCOUNT RECOVERY</p><h2>new password.</h2><p>Задай новый пароль для своего GearHub аккаунта.</p><form id="passwordRecoveryForm"><label>new password<input name="password" type="password" minlength="8" autocomplete="new-password" required placeholder="Не менее 8 символов"></label><button class="black-btn" type="submit">save new password ↗</button></form></div>`);
}

async function submitPasswordRecovery(event) {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get('password');
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const { error } = await supabase.auth.updateUser({ password: String(password) });
  if (error) {
    button.disabled = false;
    return toast(authErrorMessage(error));
  }
  closeModal();
  toast('Пароль обновлён ✓');
}

function showCheckout() {
  if (!authUser) {
    closeModal();
    showAuth('login');
    return toast('Для оформления заказа войди в аккаунт');
  }
  if (!cartItems().length) return toast('Корзина пуста');

  const customer = profile || {};
  openModal(`
    <div class="auth-form"><p class="eyebrow">ONE LAST STEP</p><h2>checkout.</h2>
      <p>Проверь контакты и адрес доставки перед подтверждением заказа.</p>
      <form id="checkoutForm" class="checkout-form" novalidate>
        <label>name<input name="name" autocomplete="name" required maxlength="100" value="${escapeAttr(customer.full_name || '')}"></label>
        <label>phone<input name="phone" type="tel" autocomplete="tel" required maxlength="40" placeholder="+7 7__ ___ __ __" value="${escapeAttr(customer.phone || '')}"></label>
        <label>delivery address<textarea name="address" autocomplete="street-address" rows="3" required maxlength="500">${escapeHtml(customer.address || '')}</textarea></label>
        <label>comment<input name="comment" maxlength="500" placeholder="Необязательно"></label>
        <button class="black-btn" id="checkoutSubmitBtn" type="submit">confirm order ↗</button>
        <p class="auth-feedback checkout-feedback" id="checkoutFeedback" role="status" aria-live="polite"></p>
      </form>
    </div>`);

  // Bind directly to the checkout form just like the stable auth form handler.
  // This avoids relying on delegated submit events after the modal DOM is replaced.
  const checkoutForm = $('#checkoutForm');
  checkoutForm?.addEventListener('submit', submitCheckout);
}

function renderDeliveryCard(order, isActive) {
  const steps = [
    ['new', 'Принят'],
    ['confirmed', 'Подтверждён'],
    ['shipping', 'В доставке'],
    ['delivered', 'Доставлен']
  ];
  const currentStep = steps.findIndex(([status]) => status === order.status);
  const items = order.order_items || [];
  const progress = order.status === 'cancelled' ? '' : `
    <div class="delivery-progress" aria-label="Статус доставки">
      ${steps.map(([status, label], index) => `
        <div class="delivery-step ${index <= currentStep ? 'done' : ''} ${index === currentStep ? 'current' : ''}">
          <i></i><span>${label}</span>
        </div>`).join('')}
    </div>`;
  return `
    <article class="delivery-card">
      <div class="delivery-card-top">
        <div><span class="delivery-kicker">${isActive ? 'CURRENT DELIVERY' : 'LATEST ORDER'}</span><strong>#${escapeHtml(order.order_number)}</strong></div>
        <strong class="delivery-total">${money(order.total)}</strong>
      </div>
      <div class="delivery-status-row"><span class="delivery-status status-${escapeAttr(order.status)}">${orderStatusLabels[order.status] || escapeHtml(order.status)}</span><span class="delivery-date">${new Date(order.created_at).toLocaleString('ru-RU')}</span></div>
      ${progress}
      <div class="delivery-details">
        <div><span>Получатель</span><strong>${escapeHtml(order.customer_name || '')}</strong></div>
        <div><span>Телефон</span><strong>${escapeHtml(order.phone || '')}</strong></div>
        <div class="delivery-address"><span>Адрес доставки</span><strong>${escapeHtml(order.shipping_address || '')}</strong></div>
      </div>
      <div class="delivery-items"><span>Состав заказа</span>${items.length ? items.map((item) => `<div>${escapeHtml(item.product_name)} <b>× ${item.quantity}</b></div>`).join('') : '<div>Состав заказа загружается…</div>'}</div>
    </article>`;
}

function renderAccount() {
  if (!authUser) {
    showAuth('login');
    return;
  }
  $('#profileName').value = profile?.full_name || authUser.user_metadata?.full_name || '';
  $('#profilePhone').value = profile?.phone || '';
  $('#profileAddress').value = profile?.address || '';
  $('#accountRole').textContent = `signed in as ${authUser.email} · ${profile?.role === 'admin' ? 'administrator' : 'customer'}`;
  $('#adminPanel').classList.toggle('hidden', profile?.role !== 'admin');

  const myOrders = (profile?.role === 'admin' ? orders : orders.filter((order) => order.user_id === authUser.id))
    .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  $('#orderHistory').innerHTML = myOrders.length ? myOrders.map((order) => `
    <div class="history-item">
      <span><b>#${escapeHtml(order.order_number)}</b> · ${new Date(order.created_at).toLocaleDateString('ru-RU')}<br>
      ${(order.order_items || []).map((item) => `${escapeHtml(item.product_name)} × ${item.quantity}`).join(', ')}</span>
      <strong>${money(order.total)}<br><small>${orderStatusLabels[order.status] || escapeHtml(order.status)}</small></strong>
    </div>`).join('') : 'История заказов пока пуста. После оформления заказа он появится здесь.';

  const activeOrder = myOrders.find((order) => !['delivered', 'cancelled'].includes(order.status));
  const latestOrder = activeOrder || myOrders[0];
  $('#deliveryPanel').innerHTML = latestOrder
    ? renderDeliveryCard(latestOrder, Boolean(activeOrder))
    : '<div class="delivery-empty"><span class="delivery-empty-icon">↗</span><strong>Пока нет активных доставок</strong><p>Когда оформишь заказ, здесь появятся его номер, адрес, состав и статус доставки.</p><button type="button" class="outline-btn" data-page="catalog">go shopping ↗</button></div>';
  if (profile?.role === 'admin') renderAdmin();
}

async function renderAdmin() {
  const revenue = orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total), 0);
  $('#adminStats').innerHTML = `
    <div class="stat"><strong>${products.length}</strong><span>products</span></div>
    <div class="stat"><strong>${orders.length}</strong><span>orders</span></div>
    <div class="stat"><strong>${money(revenue)}</strong><span>revenue / KZT</span></div>`;
  $('#adminProductList').innerHTML = products.map((product) => `
    <div class="admin-product-row"><img src="${escapeAttr(product.image)}" alt="">
      <div><strong>${escapeHtml(product.name)}</strong><br>${money(product.price)} · ${escapeHtml(product.category)} · ${product.stock} pcs${product.isActive ? '' : ' · hidden'}</div>
      <div class="admin-product-actions"><button data-edit="${escapeAttr(product.id)}">edit</button><button data-delete="${escapeAttr(product.id)}">×</button></div>
    </div>`).join('');

  $('#adminOrderList').innerHTML = orders.length ? orders.map((order) => `
    <div class="order-row"><span><b>#${escapeHtml(order.order_number)}</b> · ${escapeHtml(order.customer_name)}<br>${escapeHtml(order.phone)} · ${money(order.total)}<br><small>${escapeHtml(order.shipping_address)}</small></span>
      <select data-status="${escapeAttr(order.id)}">${orderStatusValues.map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select>
    </div>`).join('') : 'Пока заказов нет.';

  const { data: reviewData, error } = await supabase.from('reviews')
    .select('id,reviewer_name,rating,body,status,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    $('#adminReviewList').textContent = 'Не удалось загрузить отзывы.';
  } else {
    $('#adminReviewList').innerHTML = (reviewData || []).map((review) => `
      <div class="review-admin-row"><span><b>${escapeHtml(review.reviewer_name || 'customer')}</b> · ${'★'.repeat(review.rating)}<br>${escapeHtml(review.body)}<br><small>${new Date(review.created_at).toLocaleDateString('ru-RU')}</small></span>
        <select data-review-status="${escapeAttr(review.id)}">${['pending','approved','rejected'].map((status) => `<option value="${status}" ${status === review.status ? 'selected' : ''}>${status}</option>`).join('')}</select>
      </div>`).join('') || 'Отзывов пока нет.';
  }

  const { data: userRows, error: usersError } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,created_at')
    .order('created_at', { ascending: false });
  if (usersError) {
    console.error('Admin user list error:', usersError);
    $('#adminUserList').textContent = `Не удалось загрузить пользователей: ${usersError.message}`;
  } else {
    $('#adminUserList').innerHTML = (userRows || []).map((userRow) => `
      <div class="admin-user-row">
        <div class="admin-user-meta"><strong>${escapeHtml(userRow.full_name || 'Без имени')}</strong><span>${escapeHtml(userRow.email || 'email не указан')}</span><small>${userRow.id === authUser?.id ? 'Это ваш аккаунт' : new Date(userRow.created_at).toLocaleDateString('ru-RU')}</small></div>
        <select data-user-role="${escapeAttr(userRow.id)}" data-current-role="${escapeAttr(userRow.role)}" aria-label="Роль пользователя" ${userRow.id === authUser?.id ? 'disabled' : ''}>
          <option value="customer" ${userRow.role === 'customer' ? 'selected' : ''}>Покупатель</option>
          <option value="admin" ${userRow.role === 'admin' ? 'selected' : ''}>Администратор</option>
        </select>
      </div>`).join('') || 'Пользователи пока не зарегистрировались.';
  }
}

async function updateUserRole(userId, role, selectElement) {
  if (profile?.role !== 'admin') return toast('Нет доступа');
  if (!['admin', 'customer'].includes(role)) return toast('Недопустимая роль');
  if (userId === authUser?.id) return toast('Нельзя менять собственную роль');
  const previousRole = selectElement?.dataset.currentRole || (role === 'admin' ? 'customer' : 'admin');
  if (!confirm(`Изменить роль пользователя на «${role === 'admin' ? 'Администратор' : 'Покупатель'}»?`)) {
    if (selectElement) selectElement.value = previousRole;
    return;
  }
  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role
  });
  if (error) {
    if (selectElement) selectElement.value = previousRole;
    return toast(`Не удалось изменить роль: ${error.message}`);
  }
  await renderAdmin();
  toast(role === 'admin' ? 'Права администратора выданы ✓' : 'Права администратора сняты ✓');
}

function slugify(value) {
  const slug = String(value).toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
  return `${slug || 'gear'}-${Math.random().toString(36).slice(2, 6)}`;
}

function resetProductForm() {
  $('#productForm').reset();
  $('#editProductId').value = '';
  $('#productFormTitle').textContent = 'add product +';
  $('#cancelEdit').classList.add('hidden');
}

function startEdit(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  $('#editProductId').value = product.id;
  $('#pName').value = product.name;
  $('#pCategory').value = product.category;
  $('#pPrice').value = product.price;
  $('#pOldPrice').value = product.oldPrice || '';
  $('#pImage').value = product.image;
  $('#pDescription').value = product.description;
  $('#pSpecs').value = product.specs.join('\n');
  $('#pBadge').value = product.badge || '';
  $('#pStock').value = product.stock;
  $('#productFormTitle').textContent = 'edit product';
  $('#cancelEdit').classList.remove('hidden');
  $('#productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveProduct(event) {
  event.preventDefault();
  if (profile?.role !== 'admin') return toast('Нет доступа');
  const id = $('#editProductId').value;
  const previous = products.find((item) => item.id === id);
  const category = categories.find((item) => item.name === $('#pCategory').value);
  if (!category) return toast('Категория не найдена');
  const price = Number($('#pPrice').value);
  const oldPrice = Number($('#pOldPrice').value) || null;
  if (oldPrice && oldPrice < price) return toast('Старая цена должна быть выше текущей');

  let imageUrl = $('#pImage').value.trim() || previous?.image || null;
  const file = $('#pImageFile')?.files?.[0];
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, {
      upsert: false, contentType: file.type
    });
    if (uploadError) return toast(`Ошибка загрузки фото: ${uploadError.message}`);
    imageUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  const payload = {
    name: $('#pName').value.trim(),
    slug: previous?.slug || slugify($('#pName').value),
    category_id: category.id,
    sku: previous?.sku || `GH-${Date.now().toString().slice(-8)}`,
    price,
    compare_at_price: oldPrice,
    stock_quantity: Number($('#pStock').value) || 0,
    image_url: imageUrl,
    description: $('#pDescription').value.trim(),
    specs: $('#pSpecs').value.split('\n').map((item) => item.trim()).filter(Boolean),
    badge: $('#pBadge').value.trim() || 'GEAR',
    is_new: previous?.isNew ?? true,
    is_active: previous?.isActive ?? true
  };

  const result = previous
    ? await supabase.from('products').update(payload).eq('id', id)
    : await supabase.from('products').insert(payload);
  if (result.error) return toast(`Не удалось сохранить: ${result.error.message}`);
  resetProductForm();
  await loadProducts();
  renderAdmin();
  toast(previous ? 'Товар обновлён ✓' : 'Товар добавлен ✓');
}

async function deleteProduct(productId) {
  if (profile?.role !== 'admin' || !confirm('Удалить этот товар?')) return;
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) return toast(`Не удалось удалить: ${error.message}`);
  await loadProducts();
  renderAdmin();
  toast('Товар удалён');
}

async function toggleFavorite(productId) {
  if (!authUser) return showAuth('login');
  const wasFavorite = favorites.has(productId);
  const result = wasFavorite
    ? await supabase.from('favorites').delete().eq('product_id', productId)
    : await supabase.from('favorites').insert({ product_id: productId, user_id: authUser.id });
  if (result.error) return toast(result.error.message);
  if (wasFavorite) favorites.delete(productId); else favorites.add(productId);
  renderHome(); renderCatalog(); renderSale();
}

async function submitReview(event) {
  event.preventDefault();
  if (!authUser || !activeProduct) return;
  const form = new FormData(event.currentTarget);
  const { error } = await supabase.from('reviews').insert({
    user_id: authUser.id,
    product_id: activeProduct.id,
    rating: Number(form.get('rating')),
    body: String(form.get('body')).trim(),
    reviewer_name: profile?.full_name || authUser.email?.split('@')[0] || 'customer'
  });
  if (error) return toast(`Не удалось отправить отзыв: ${error.message}`);
  toast('Отзыв отправлен на модерацию ✓');
  event.currentTarget.reset();
}

async function updateOrderStatus(orderId, status) {
  if (profile?.role !== 'admin') return;
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) return toast(`Не удалось обновить заказ: ${error.message}`);
  await loadAccountData();
  renderAccount();
  toast('Статус заказа обновлён ✓');
}

async function updateReviewStatus(reviewId, status) {
  if (profile?.role !== 'admin') return;
  const { error } = await supabase.from('reviews').update({ status }).eq('id', reviewId);
  if (error) return toast(`Не удалось обновить отзыв: ${error.message}`);
  await loadReviews();
  renderAdmin();
  toast('Модерация сохранена ✓');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const nameField = formElement.querySelector('[name="name"]');
  const signup = Boolean(nameField);
  const fullName = String(form.get('name') || '').trim();
  const button = formElement.querySelector('button[type="submit"]');
  const feedback = formElement.querySelector('#authFeedback');
  const originalButtonText = button?.textContent || (signup ? 'create account ↗' : 'log in ↗');

  const setFeedback = (message, kind = 'error') => {
    if (feedback) {
      feedback.textContent = message;
      feedback.dataset.kind = kind;
    }
    if (message && kind === 'error') console.warn('[GearHub auth]', message);
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFeedback('Введи корректный email.');
    formElement.querySelector('[name="email"]')?.focus();
    return;
  }
  if (signup && !fullName) {
    setFeedback('Укажи имя.');
    nameField?.focus();
    return;
  }
  if (password.length < 8) {
    setFeedback('Пароль должен содержать не менее 8 символов.');
    formElement.querySelector('[name="password"]')?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = signup ? 'creating account…' : 'signing in…';
    button.setAttribute('aria-busy', 'true');
  }
  setFeedback(signup ? 'Создаём аккаунт…' : 'Проверяем данные…', 'pending');

  try {
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      if (error) throw error;

      // Supabase returns no session while email confirmation is enabled.
      if (data?.user && !data.session) {
        openModal(`<div class="auth-form"><p class="eyebrow">ONE MORE STEP</p><h2>check your email.</h2><p>Аккаунт создан. Supabase отправил письмо на <b>${escapeHtml(email)}</b>. Открой письмо и подтверди адрес, затем вернись сюда и войди. Проверь также папку «Спам».</p><p class="auth-feedback" data-kind="success">Регистрация прошла успешно ✓</p><button class="blue-btn" type="button" data-auth-resend="${escapeAttr(email)}">Отправить письмо ещё раз</button><button class="auth-switch" type="button" data-auth-switch="login">Перейти ко входу</button></div>`);
        return;
      }

      if (!data?.user) throw new Error('Supabase не вернул созданного пользователя. Проверь настройки Email provider.');
      closeModal();
      toast('Аккаунт создан ✓');
      await refreshStore();
      goToPage('account');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error('Вход не завершён: Supabase не создал сессию. Проверь подтверждение email.');
      closeModal();
      await refreshStore();
      toast('С возвращением ✓');
      goToPage('account');
    }
  } catch (error) {
    const message = authErrorMessage(error);
    setFeedback(message, 'error');
    toast(message);
    console.error('GearHub auth request failed:', error);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = originalButtonText;
      button.removeAttribute('aria-busy');
    }
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  event.stopPropagation();

  const formElement = event.currentTarget;
  const button = formElement.querySelector('#checkoutSubmitBtn');
  const feedback = formElement.querySelector('#checkoutFeedback');
  const originalButtonText = button?.textContent || 'confirm order ↗';
  const setFeedback = (message, kind = 'error') => {
    if (feedback) {
      feedback.textContent = message;
      feedback.dataset.kind = kind;
    }
  };

  if (!authUser) {
    setFeedback('Сеанс входа не найден. Войди в аккаунт и повтори оформление.');
    return;
  }

  const form = new FormData(formElement);
  const customerName = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const address = String(form.get('address') || '').trim();
  const comment = String(form.get('comment') || '').trim();
  if (customerName.length < 2) return setFeedback('Укажи имя получателя (минимум 2 символа).');
  if (phone.replace(/\D/g, '').length < 7) return setFeedback('Проверь номер телефона — нужно минимум 7 цифр.');
  if (address.length < 5) return setFeedback('Укажи полный адрес доставки.');

  const items = cartItems();
  if (!items.length) return setFeedback('Корзина пуста. Вернись в каталог и добавь товар.');
  const outOfStock = items.find((item) => item.quantity < 1 || item.quantity > item.product.stock);
  if (outOfStock) return setFeedback(`Недостаточно товара «${outOfStock.product.name}». Измени количество в корзине.`);

  const payload = {
    p_customer_name: customerName,
    p_phone: phone,
    p_shipping_address: address,
    p_comment: comment,
    p_items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity }))
  };

  if (button) {
    button.disabled = true;
    button.textContent = 'placing order…';
    button.setAttribute('aria-busy', 'true');
  }
  setFeedback('Проверяем остатки и оформляем заказ…', 'pending');

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData?.session?.user) throw new Error('Сеанс входа истёк. Войди в аккаунт заново.');
    authUser = sessionData.session.user;
    session = sessionData.session;

    const { data, error } = await supabase.rpc('place_order', payload);
    if (error) throw error;
    const receipt = Array.isArray(data) ? data[0] : data;
    if (!receipt?.order_id || !receipt?.order_number) {
      throw new Error('Сервер не вернул подтверждение заказа. Корзина сохранена — обнови страницу и проверь историю заказов перед повторной отправкой.');
    }

    // Clear the cart only after Supabase confirms that the transaction committed.
    cart = [];
    saveCart();
    profile = { ...(profile || {}), full_name: customerName, phone, address };

    // Keep a local receipt immediately so the account page can still show the
    // delivery if the follow-up read request is temporarily unavailable.
    const confirmedOrder = {
      id: receipt.order_id,
      order_number: receipt.order_number,
      user_id: authUser.id,
      customer_name: customerName,
      phone,
      shipping_address: address,
      comment,
      status: receipt.status || 'new',
      total: Number(receipt.total),
      created_at: new Date().toISOString(),
      order_items: items.map((item) => ({
        product_id: item.productId,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        line_total: item.product.price * item.quantity
      }))
    };
    orders = [confirmedOrder, ...orders.filter((order) => order.id !== confirmedOrder.id)];
    closeModal();

    // Refresh account orders and stock independently. A refresh error must not
    // turn a successfully placed order into a misleading checkout failure.
    const [accountRefresh, productRefresh] = await Promise.allSettled([
      loadAccountData(),
      loadProducts()
    ]);
    if (accountRefresh.status === 'rejected') {
      console.error('Account order list refresh failed:', accountRefresh.reason);
      // Restore the just-confirmed receipt after a failed server read.
      orders = [confirmedOrder, ...orders.filter((order) => order.id !== confirmedOrder.id)];
    }
    goToPage('account');

    if (accountRefresh.status === 'rejected') {
      console.error('Order placed but account refresh failed:', accountRefresh.reason);
      toast(`Заказ ${receipt.order_number} принят. Обнови страницу, чтобы увидеть доставку.`);
    } else {
      if (productRefresh.status === 'rejected') console.warn('Product refresh failed:', productRefresh.reason);
      toast(`Заказ ${receipt.order_number} оформлен ✓`);
    }
  } catch (error) {
    console.error('GearHub checkout failed:', error);
    const message = error?.message || 'Не удалось оформить заказ. Попробуй ещё раз.';
    setFeedback(message, 'error');
    toast(`Заказ не оформлен: ${message}`);
    if (button) {
      button.disabled = false;
      button.textContent = originalButtonText;
      button.removeAttribute('aria-busy');
    }
  }
}

// Global event delegation for navigation, product cards, cart and admin actions.
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-page],[data-product],[data-add],[data-fav],[data-remove],[data-edit],[data-delete],[data-close],[data-category]');
  if (!target) return;
  if (target.dataset.page) { event.preventDefault(); goToPage(target.dataset.page); }
  if (target.dataset.category) {
    const radio = $$('input[name="category"]').find((input) => input.value === target.dataset.category);
    if (radio) radio.checked = true;
    goToPage('catalog');
    renderCatalog();
  }
  if (target.dataset.product) showProduct(target.dataset.product);
  if (target.dataset.add) {
    const quantity = Number($('#modalQty')?.value) || 1;
    addToCart(target.dataset.add, quantity);
    if (!$('#modalOverlay').classList.contains('hidden')) closeModal();
  }
  if (target.dataset.fav) await toggleFavorite(target.dataset.fav);
  if (target.dataset.remove) {
    cart = cart.filter((item) => item.productId !== target.dataset.remove);
    saveCart();
    showCart();
  }
  if (target.dataset.edit) startEdit(target.dataset.edit);
  if (target.dataset.delete) await deleteProduct(target.dataset.delete);
  if (target.dataset.close) closeModal();
});

$('#modalClose').addEventListener('click', closeModal);
$('#modalOverlay').addEventListener('click', (event) => {
  if (event.target.id === 'modalOverlay') closeModal();
});
$('#modalContent').addEventListener('click', async (event) => {
  if (event.target.id === 'authSwitch') showAuth(event.target.textContent.includes('Создать') ? 'signup' : 'login');
  if (event.target.dataset.authSwitch) showAuth(event.target.dataset.authSwitch);
  if (event.target.id === 'checkoutBtn') showCheckout();
  if (event.target.dataset.authResend) await resendSignupEmail(event.target.dataset.authResend);
  if (event.target.dataset.authAction === 'resend') await resendSignupEmail($('#authForm [name="email"]')?.value);
  if (event.target.dataset.authAction === 'reset') await sendPasswordReset($('#authForm [name="email"]')?.value);
});
$('#modalContent').addEventListener('submit', async (event) => {
  // authForm is handled by the direct listener installed in showAuth().
  if (event.target.id === 'reviewForm') await submitReview(event);
  if (event.target.id === 'passwordRecoveryForm') await submitPasswordRecovery(event);
});

$('#loginBtn').addEventListener('click', () => authUser ? goToPage('account') : showAuth('login'));
$('#accountBtn').addEventListener('click', () => authUser ? goToPage('account') : showAuth('login'));
$('#cartBtn').addEventListener('click', showCart);
$('#logoutBtn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) return toast(error.message);
  goToPage('home');
  toast('Ты вышел из аккаунта');
});

$('#profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authUser) return;
  const values = {
    full_name: $('#profileName').value.trim(),
    phone: $('#profilePhone').value.trim(),
    address: $('#profileAddress').value.trim()
  };
  const { error } = await supabase.from('profiles').update(values).eq('id', authUser.id);
  if (error) return toast(`Не удалось сохранить: ${error.message}`);
  profile = { ...profile, ...values };
  renderAccount();
  toast('Данные сохранены ✓');
});

$('#productForm').addEventListener('submit', saveProduct);
$('#cancelEdit').addEventListener('click', resetProductForm);
$('#adminProductList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-edit],[data-delete]');
  if (!button) return;
  if (button.dataset.edit) startEdit(button.dataset.edit);
  if (button.dataset.delete) await deleteProduct(button.dataset.delete);
});
$('#adminOrderList').addEventListener('change', async (event) => {
  if (event.target.dataset.status) await updateOrderStatus(event.target.dataset.status, event.target.value);
});
$('#adminReviewList').addEventListener('change', async (event) => {
  if (event.target.dataset.reviewStatus) await updateReviewStatus(event.target.dataset.reviewStatus, event.target.value);
});
$('#adminUserList').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-user-role]');
  if (!select) return;
  const previousRole = select.dataset.currentRole || (select.value === 'admin' ? 'customer' : 'admin');
  await updateUserRole(select.dataset.userRole, select.value, select);
});

$('#searchInput').addEventListener('input', renderCatalog);
$('#sortSelect').addEventListener('change', renderCatalog);
$$('input[name="category"]').forEach((input) => input.addEventListener('change', renderCatalog));
$('#applyPrice').addEventListener('click', renderCatalog);
$('#saleOnly').addEventListener('change', renderCatalog);
$('#resetFilters').addEventListener('click', () => {
  $('#searchInput').value = '';
  $('#minPrice').value = '';
  $('#maxPrice').value = '';
  $('#saleOnly').checked = false;
  $('input[name="category"][value="all"]').checked = true;
  renderCatalog();
});

async function init() {
  updateCartCount();
  // Subscribe before reading the session so a sign-in event cannot be missed during boot.
  supabase.auth.onAuthStateChange((eventName, nextSession) => {
    session = nextSession;
    authUser = nextSession?.user || null;
    // Defer database work outside the auth callback to avoid locking the Auth client.
    window.setTimeout(async () => {
      await refreshStore();
      if (eventName === 'PASSWORD_RECOVERY') showPasswordRecovery();
      if ($('#accountPage').classList.contains('active')) renderAccount();
    }, 0);
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error('Auth session error:', error);
  session = data?.session || session || null;
  authUser = session?.user || authUser || null;
  await refreshStore();
}

init();
