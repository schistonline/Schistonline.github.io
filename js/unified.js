// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE
// ============================================
let suppliers = [];
let filteredSuppliers = [];
let banners = [];
let hotSuppliers = [];
let currentPage = 1;
const itemsPerPage = 9;
let hasMore = true;
let isLoading = false;
let swiperInstances = {};

// Placeholder SVG for progressive images
const PLACEHOLDER_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect width="200" height="200" fill="%23f3f4f6"/%3E%3C/svg%3E';

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Unified page loading...');

    // Show skeletons
    showSkeletons();

    // Load data
    await Promise.all([
        loadBanners(),
        loadHotSuppliers(),
        loadSuppliers()
    ]);

    // Render
    renderBanners();
    renderHotSuppliers();
    renderSuppliers();

    // Init swiper
    setTimeout(initSwiper, 100);

    // Setup events
    setupEventListeners();

    // Lazy load images
    setTimeout(initLazyLoading, 300);

    console.log('✅ Unified page loaded');
});

// ============================================
// SHOW SKELETONS
// ============================================
function showSkeletons() {
    // Banners skeleton
    const bannerWrapper = document.getElementById('bannerWrapper');
    if (bannerWrapper) {
        bannerWrapper.innerHTML = `
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
        `;
    }

    // Hot suppliers skeleton
    const hotWrapper = document.getElementById('hotSuppliersWrapper');
    if (hotWrapper) {
        let html = '';
        for (let i = 0; i < 8; i++) {
            html += `
                <div class="swiper-slide">
                    <div class="hot-supplier-card">
                        <div class="hot-supplier-avatar skeleton"></div>
                        <div class="skeleton-text" style="width:60px;height:12px;margin-top:6px;"></div>
                    </div>
                </div>
            `;
        }
        hotWrapper.innerHTML = html;
    }

    // Suppliers grid skeleton
    const grid = document.getElementById('suppliersGrid');
    if (grid) {
        let html = '';
        for (let i = 0; i < 6; i++) {
            html += `
                <div class="skeleton-card" style="padding:12px;">
                    <div style="display:flex;gap:12px;margin-bottom:12px;">
                        <div class="skeleton" style="width:56px;height:56px;border-radius:8px;flex-shrink:0;"></div>
                        <div style="flex:1;">
                            <div class="skeleton-text" style="width:70%;height:16px;margin-bottom:6px;"></div>
                            <div class="skeleton-text" style="width:50%;height:12px;margin-bottom:4px;"></div>
                            <div class="skeleton-text" style="width:40%;height:10px;"></div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:12px;border-top:1px solid var(--gray-200);">
                        <div><div class="skeleton" style="aspect-ratio:1;border-radius:6px;"></div></div>
                        <div><div class="skeleton" style="aspect-ratio:1;border-radius:6px;"></div></div>
                        <div><div class="skeleton" style="aspect-ratio:1;border-radius:6px;"></div></div>
                    </div>
                </div>
            `;
        }
        grid.innerHTML = html;
    }
}

// ============================================
// LAZY LOADING
// ============================================
function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src && src !== PLACEHOLDER_SVG) {
                        img.src = src;
                        img.removeAttribute('data-src');
                        img.classList.add('image-loaded');
                    }
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.01
        });

        document.querySelectorAll('.lazy-image').forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // Fallback
        document.querySelectorAll('.lazy-image').forEach(img => {
            const src = img.getAttribute('data-src');
            if (src && src !== PLACEHOLDER_SVG) {
                img.src = src;
                img.classList.add('image-loaded');
            }
        });
    }
}

// ============================================
// LOAD BANNERS
// ============================================
async function loadBanners() {
    try {
        const now = new Date().toISOString();
        const { data, error } = await sb
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', now)
            .gte('end_date', now)
            .order('display_order', { ascending: true });

        if (error) throw error;
        banners = data || [];
        console.log(`✅ Loaded ${banners.length} banners`);
    } catch (error) {
        console.error('Error loading banners:', error);
        banners = [];
    }
}

// ============================================
// LOAD HOT SUPPLIERS
// ============================================
async function loadHotSuppliers() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select(`
                id,
                business_name,
                verification_status,
                total_orders,
                completion_rate,
                profile_id,
                profiles!suppliers_profile_id_fkey (
                    avatar_url,
                    full_name
                )
            `)
            .eq('verification_status', 'verified')
            .order('total_orders', { ascending: false })
            .limit(12);

        if (error) throw error;

        // Get spotlight status
        const supplierIds = data?.map(s => s.id) || [];
        let spotlightSet = new Set();
        if (supplierIds.length > 0) {
            const { data: spotlightData } = await sb
                .from('supplier_spotlights')
                .select('supplier_id')
                .in('supplier_id', supplierIds)
                .eq('is_active', true);
            if (spotlightData) {
                spotlightData.forEach(s => spotlightSet.add(s.supplier_id));
            }
        }

        // Get products for each supplier
        hotSuppliers = await Promise.all(
            (data || []).map(async (supplier) => {
                const products = await getSupplierProducts(supplier.id, 3);
                return {
                    ...supplier,
                    isHot: spotlightSet.has(supplier.id),
                    products: products || []
                };
            })
        );

        console.log(`✅ Loaded ${hotSuppliers.length} hot suppliers`);
    } catch (error) {
        console.error('Error loading hot suppliers:', error);
        hotSuppliers = [];
    }
}

// ============================================
// GET SUPPLIER PRODUCTS
// ============================================
async function getSupplierProducts(supplierId, limit = 3) {
    try {
        const { data, error } = await sb
            .from('ads')
            .select('id, title, wholesale_price, price, image_urls, moq')
            .eq('supplier_id', supplierId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) return [];
        return data || [];
    } catch {
        return [];
    }
}

// ============================================
// LOAD SUPPLIERS (ONLY THOSE WITH PRODUCTS)
// ============================================
async function loadSuppliers(reset = true) {
    if (isLoading) return;
    isLoading = true;

    if (reset) {
        currentPage = 1;
        hasMore = true;
        const grid = document.getElementById('suppliersGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="loading-grid">
                    <div class="spinner"></div>
                    <p>Loading suppliers...</p>
                </div>
            `;
        }
    }

    try {
        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        // First get suppliers with products using a different approach
        // Get all suppliers with their product count
        const { data: supplierData, error: supplierError } = await sb
            .from('suppliers')
            .select(`
                id,
                business_name,
                business_type,
                verification_status,
                is_featured,
                year_established,
                warehouse_location,
                warehouse_district,
                profile_id,
                total_orders,
                completion_rate,
                response_time_hours,
                profiles!suppliers_profile_id_fkey (
                    avatar_url,
                    full_name,
                    location
                )
            `)
            .order('is_featured', { ascending: false })
            .order('total_orders', { ascending: false })
            .range(from, to);

        if (supplierError) throw supplierError;

        // Filter suppliers that have products
        const suppliersWithProducts = [];
        for (const supplier of (supplierData || [])) {
            const products = await getSupplierProducts(supplier.id, 3);
            if (products.length > 0) {
                const years = supplier.year_established ?
                    `${new Date().getFullYear() - parseInt(supplier.year_established)} yrs` : '6 yrs';
                const staff = '20+ staff';
                const area = supplier.warehouse_location ? '2,700+ m²' : '25,000+ m²';
                const revenue = 'USh 21.1B+';

                suppliersWithProducts.push({
                    ...supplier,
                    products: products,
                    displayStats: { years, staff, area, revenue }
                });
            }
        }

        // If we got fewer than itemsPerPage, try to load more
        const remainingNeeded = itemsPerPage - suppliersWithProducts.length;
        if (remainingNeeded > 0 && currentPage === 1) {
            // Try one more page
            const nextFrom = (currentPage) * itemsPerPage;
            const nextTo = nextFrom + itemsPerPage - 1;
            const { data: extraData } = await sb
                .from('suppliers')
                .select(`
                    id,
                    business_name,
                    business_type,
                    verification_status,
                    is_featured,
                    year_established,
                    warehouse_location,
                    warehouse_district,
                    profile_id,
                    total_orders,
                    completion_rate,
                    response_time_hours,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        full_name,
                        location
                    )
                `)
                .order('is_featured', { ascending: false })
                .order('total_orders', { ascending: false })
                .range(nextFrom, nextTo);

            if (extraData) {
                for (const supplier of extraData) {
                    if (suppliersWithProducts.length >= itemsPerPage) break;
                    const products = await getSupplierProducts(supplier.id, 3);
                    if (products.length > 0) {
                        const years = supplier.year_established ?
                            `${new Date().getFullYear() - parseInt(supplier.year_established)} yrs` : '6 yrs';
                        const staff = '20+ staff';
                        const area = supplier.warehouse_location ? '2,700+ m²' : '25,000+ m²';
                        const revenue = 'USh 21.1B+';

                        suppliersWithProducts.push({
                            ...supplier,
                            products: products,
                            displayStats: { years, staff, area, revenue }
                        });
                    }
                }
            }
        }

        if (reset) {
            suppliers = suppliersWithProducts;
        } else {
            suppliers = [...suppliers, ...suppliersWithProducts];
        }

        filteredSuppliers = [...suppliers];
        hasMore = suppliersWithProducts.length >= itemsPerPage;

        console.log(`✅ Loaded ${suppliers.length} suppliers with products`);
    } catch (error) {
        console.error('Error loading suppliers:', error);
    } finally {
        isLoading = false;
    }
}

// ============================================
// RENDER BANNERS
// ============================================
function renderBanners() {
    const wrapper = document.getElementById('bannerWrapper');
    if (!wrapper) return;

    if (banners.length === 0) {
        wrapper.innerHTML = `
            <div class="swiper-slide">
                <div class="banner-slide" style="background: linear-gradient(135deg, #6B21E5, #9B4DFF);">
                    <div class="banner-content" style="color:white;">
                        <h3 class="banner-title">Welcome to BuyUganda</h3>
                        <p class="banner-subtitle">Connect with verified suppliers across Uganda</p>
                        <span class="banner-btn">Explore Now</span>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    wrapper.innerHTML = banners.map(banner => {
        const bgColor = banner.background_color || '#6B21E5';
        const textColor = banner.text_color || '#FFFFFF';

        let linkUrl = '#';
        if (banner.link_type && banner.link_value) {
            switch (banner.link_type) {
                case 'internal':
                case 'external':
                    linkUrl = banner.link_value;
                    break;
                case 'category':
                    linkUrl = 'category.html?id=' + banner.link_value;
                    break;
                case 'ad':
                    linkUrl = 'B2B-product-detail.html?id=' + banner.link_value;
                    break;
                case 'supplier':
                    linkUrl = 'supplier-profile.html?id=' + banner.link_value;
                    break;
            }
        }

        const imageHtml = banner.image_url ?
            `<img src="${PLACEHOLDER_SVG}" data-src="${banner.image_url}" alt="${escapeHtml(banner.title)}" class="lazy-image">` :
            '';

        return `
            <div class="swiper-slide">
                <a href="${linkUrl}" class="banner-slide" style="background-color:${bgColor};">
                    ${imageHtml}
                    <div class="banner-content" style="color:${textColor};">
                        <h3 class="banner-title">${escapeHtml(banner.title)}</h3>
                        ${banner.description ? `<p class="banner-subtitle">${escapeHtml(banner.description)}</p>` : ''}
                        ${banner.button_text ? `<span class="banner-btn" style="color:${bgColor};">${escapeHtml(banner.button_text)}</span>` : ''}
                    </div>
                </a>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDER HOT SUPPLIERS
// ============================================
function renderHotSuppliers() {
    const wrapper = document.getElementById('hotSuppliersWrapper');
    if (!wrapper) return;

    if (hotSuppliers.length === 0) {
        wrapper.innerHTML = `<div class="swiper-slide" style="padding:20px;text-align:center;color:var(--gray-500);">No hot suppliers yet</div>`;
        return;
    }

    wrapper.innerHTML = hotSuppliers.map(supplier => {
        const profile = supplier.profiles || {};
        const name = supplier.business_name || 'Supplier';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const avatarHtml = profile.avatar_url ?
            `<img src="${PLACEHOLDER_SVG}" data-src="${profile.avatar_url}" alt="${escapeHtml(name)}" class="lazy-image">` :
            `<span>${initials}</span>`;

        const hotBadgeHtml = supplier.isHot ? '<div class="hot-badge">🔥</div>' : '';

        return `
            <div class="swiper-slide">
                <a href="supplier-profile.html?id=${supplier.id}" class="hot-supplier-card">
                    <div class="hot-supplier-avatar">
                        ${avatarHtml}
                        ${hotBadgeHtml}
                        ${supplier.verification_status === 'verified' ? '<div class="verified-badge-small">✓</div>' : ''}
                    </div>
                    <div class="hot-supplier-name">${escapeHtml(name)}</div>
                </a>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDER SUPPLIERS
// ============================================
function renderSuppliers() {
    const grid = document.getElementById('suppliersGrid');
    if (!grid) return;

    if (filteredSuppliers.length === 0) {
        grid.innerHTML = `
            <div class="loading-grid">
                <i class="fas fa-store" style="font-size:48px;color:var(--gray-300);margin-bottom:16px;"></i>
                <p>No suppliers with products found</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredSuppliers.map(supplier => {
        const profile = supplier.profiles || {};
        const name = supplier.business_name || 'Supplier';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const stats = supplier.displayStats || {
            years: '6 yrs',
            staff: '20+ staff',
            area: '2,700+ m²',
            revenue: 'USh 21.1B+'
        };

        const avatarHtml = profile.avatar_url ?
            `<img src="${PLACEHOLDER_SVG}" data-src="${profile.avatar_url}" alt="${escapeHtml(name)}" class="lazy-image">` :
            initials;

        return `
            <div class="supplier-card" onclick="window.location.href='supplier-profile.html?id=${supplier.id}'">
                <div class="supplier-header-compact">
                    <div class="supplier-logo-compact">
                        ${avatarHtml}
                    </div>
                    <div class="supplier-info-compact">
                        <div class="supplier-name-compact">
                            ${escapeHtml(name)}
                            ${supplier.verification_status === 'verified' ? 
                                '<span class="verified-badge-compact"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                        </div>
                        <div class="supplier-stats-compact">
                            <span><i class="far fa-calendar-alt"></i> ${stats.years}</span>
                            <span><i class="fas fa-users"></i> ${stats.staff}</span>
                            <span><i class="fas fa-warehouse"></i> ${stats.area}</span>
                            <span><i class="fas fa-chart-line"></i> ${stats.revenue}</span>
                        </div>
                        <div class="supplier-badges-compact">
                            <span class="badge-item"><i class="fas fa-check-circle"></i> 1-year warranty</span>
                            <span class="badge-item"><i class="fas fa-clock"></i> On-time delivery 100%</span>
                        </div>
                    </div>
                </div>
                <div class="supplier-products-compact">
                    <div class="products-row-compact">
                        ${(supplier.products || []).map(p => `
                            <a href="B2B-product-detail.html?id=${p.id}" class="product-item-compact" onclick="event.stopPropagation()">
                                <div class="product-image-compact">
                                    <img src="${PLACEHOLDER_SVG}" data-src="${p.image_urls?.[0] || 'https://via.placeholder.com/100'}" alt="" class="lazy-image">
                                </div>
                                <div class="product-price-compact">USh ${formatNumber(p.wholesale_price || p.price || 0)}</div>
                                <div class="product-moq-compact">${p.moq || 1} pieces (MOQ)</div>
                            </a>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Re-init lazy loading for new images
    setTimeout(initLazyLoading, 100);

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = hasMore ? 'block' : 'none';
    }
}

// ============================================
// LOAD MORE
// ============================================
function loadMore() {
    if (!hasMore || isLoading) return;
    currentPage++;
    loadSuppliers(false).then(() => {
        renderSuppliers();
    });
}

// ============================================
// INIT SWIPER (WITH LOOP WARNING FIX)
// ============================================
function initSwiper() {
    // Destroy existing instances
    Object.values(swiperInstances).forEach(s => {
        if (s && s.destroy) s.destroy(true, true);
    });
    swiperInstances = {};

    const bannerSlides = document.querySelectorAll('.banner-swiper .swiper-slide');
    const hasEnoughBanners = bannerSlides.length >= 3;

    // Banner swiper - only loop if enough slides
    if (bannerSlides.length > 0) {
        swiperInstances.banner = new Swiper('.banner-swiper', {
            slidesPerView: 1,
            spaceBetween: 0,
            loop: hasEnoughBanners,
            autoplay: { delay: 5000, disableOnInteraction: false },
            pagination: { el: '#bannerPagination', clickable: true },
            speed: 500
        });
    }

    // Hot suppliers swiper
    if (document.querySelector('.hot-swiper .swiper-slide')) {
        swiperInstances.hot = new Swiper('.hot-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true,
            loop: false
        });
    }
}

// ============================================
// SEARCH
// ============================================
function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    searchBar.classList.toggle('show');
    if (searchBar.classList.contains('show')) {
        document.getElementById('searchInput').focus();
    }
}

function applySearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    if (query) {
        window.location.href = `supplier-results.html?q=${encodeURIComponent(query)}`;
    }
    document.getElementById('searchBar').classList.remove('show');
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Search toggle
    const searchToggle = document.getElementById('searchToggle');
    if (searchToggle) {
        searchToggle.addEventListener('click', toggleSearch);
    }

    // Search close
    const searchClose = document.getElementById('searchClose');
    if (searchClose) {
        searchClose.addEventListener('click', () => {
            document.getElementById('searchBar').classList.remove('show');
        });
    }

    // Search input enter key
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') applySearch();
        });
    }

    // Load more
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMore);
    }
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (!num) return '0';
    return parseInt(num).toLocaleString('en-UG');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#6B21E5',
        warning: '#F59E0B'
    };

    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make functions global
window.loadMore = loadMore;
window.toggleSearch = toggleSearch;