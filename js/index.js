// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let swiperInstances = {};
let currentUser = null;
let userInterests = {
    viewedCategories: [],
    recentSearches: [],
    viewedProducts: []
};

// Reason icons for recommendations
const REASON_ICONS = {
    'category_match': '🔍',
    'similar_users': '👥',
    'trending': '🔥',
    'recently_viewed': '👁️',
    'purchase_history': '🛒',
    'popular': '📈'
};

const REASON_LABELS = {
    'category_match': 'Based on categories you viewed',
    'similar_users': 'Popular with similar buyers',
    'trending': 'Trending now',
    'recently_viewed': 'You might also like',
    'purchase_history': 'Based on your purchases',
    'popular': 'Popular products'
};

// Placeholder SVG for progressive images
const PLACEHOLDER_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect width="200" height="200" fill="%23f3f4f6"/%3E%3C/svg%3E';

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 BuyUganda.online loading...');
    
    showSkeletons();
    await checkAuth();
    
    var savedPosition = localStorage.getItem('homeScrollPosition');
    if (savedPosition) {
        setTimeout(function() {
            window.scrollTo(0, parseInt(savedPosition));
        }, 100);
    }
    
    await loadContentProgressively();
    
    setTimeout(function() {
        initSwiper();
    }, 100);
    
    window.addEventListener('scroll', function() {
        localStorage.setItem('homeScrollPosition', window.scrollY);
    });
    
    var searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            window.location.href = 'B2B-search.html';
        });
    }
});

// ============================================
// PROGRESSIVE IMAGE LOADER
// ============================================
function createProgressiveImage(imageUrl, productTitle, size = 'medium') {
    if (!imageUrl || imageUrl === '') {
        imageUrl = 'https://via.placeholder.com/200x200?text=No+Image';
    }
    
    return `
        <img 
            src="${PLACEHOLDER_SVG}"
            data-src="${imageUrl}"
            alt="${escapeHtml(productTitle)}"
            class="lazy-image"
            loading="lazy"
            onerror="this.src='https://via.placeholder.com/200x200?text=No+Image'">
    `;
}

function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src && src !== PLACEHOLDER_SVG) {
                        img.src = src;
                        img.removeAttribute('data-src');
                        img.classList.add('image-loaded');
                    }
                    observer.unobserve(img);
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
// SHOW SKELETONS
// ============================================
function showSkeletons() {
    // Banners skeleton
    var bannerWrapper = document.getElementById('bannerWrapper');
    if (bannerWrapper) {
        bannerWrapper.innerHTML = `
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
            <div class="swiper-slide"><div class="banner-slide skeleton"></div></div>
        `;
    }
    
    // Quick actions skeleton
    var quickWrapper = document.getElementById('quickActionsWrapper');
    if (quickWrapper) {
        quickWrapper.innerHTML = getSkeletonItems(5, 'quick');
    }
    
    // Featured deals skeleton
    var featuredWrapper = document.getElementById('featuredDealsWrapper');
    if (featuredWrapper) {
        featuredWrapper.innerHTML = getSkeletonItems(5, 'product');
    }
    
    // Categories skeleton
    var categoriesWrapper = document.getElementById('categoriesWrapper');
    if (categoriesWrapper) {
        categoriesWrapper.innerHTML = getSkeletonItems(8, 'category');
    }
    
    // Hot suppliers skeleton
    var suppliersWrapper = document.getElementById('hotSuppliersWrapper');
    if (suppliersWrapper) {
        suppliersWrapper.innerHTML = getSkeletonItems(8, 'supplier');
    }
    
    // Videos skeleton
    var videosWrapper = document.getElementById('videosWrapper');
    if (videosWrapper) {
        videosWrapper.innerHTML = getSkeletonItems(4, 'video');
    }
    
    // Recent items skeleton
    var recentWrapper = document.getElementById('recentItemsWrapper');
    if (recentWrapper) {
        recentWrapper.innerHTML = getSkeletonItems(5, 'product');
    }
}

function getSkeletonItems(count, type) {
    var html = '';
    for (var i = 0; i < count; i++) {
        if (type === 'quick') {
            html += `
                <div class="swiper-slide">
                    <div class="quick-action-item">
                        <div class="quick-action-icon skeleton"></div>
                        <div class="skeleton-text" style="width: 60px; height: 12px; margin-top: 6px;"></div>
                    </div>
                </div>
            `;
        } else if (type === 'product') {
            html += `
                <div class="swiper-slide">
                    <div class="product-card skeleton-card">
                        <div class="product-image skeleton" style="background: #e5e7eb; min-height: 160px;"></div>
                        <div class="product-info">
                            <div class="skeleton-text" style="width: 90%; height: 16px; margin-bottom: 8px;"></div>
                            <div class="skeleton-text" style="width: 60%; height: 20px; margin-bottom: 4px;"></div>
                            <div class="skeleton-text" style="width: 40%; height: 12px;"></div>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'category' || type === 'supplier') {
            html += `
                <div class="swiper-slide">
                    <div class="category-item">
                        <div class="category-image skeleton"></div>
                        <div class="skeleton-text" style="width: 60px; height: 12px; margin-top: 6px;"></div>
                    </div>
                </div>
            `;
        } else if (type === 'video') {
            html += `
                <div class="swiper-slide">
                    <div class="video-card skeleton-card">
                        <div class="video-thumbnail-wrapper skeleton" style="aspect-ratio: 16/9; background: #e5e7eb; border-radius: 12px 12px 0 0;"></div>
                        <div class="video-info" style="padding: 12px;">
                            <div class="skeleton-text" style="width: 90%; height: 16px; margin-bottom: 8px;"></div>
                            <div class="skeleton-text" style="width: 60%; height: 12px; margin-bottom: 4px;"></div>
                            <div class="skeleton-text" style="width: 40%; height: 10px;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    return html;
}

// ============================================
// LOAD CONTENT PROGRESSIVELY
// ============================================
async function loadContentProgressively() {
    await loadBanners();
    await loadQuickActions();
    
    setTimeout(() => loadFeaturedDeals(), 50);
    setTimeout(() => loadCategories(), 100);
    setTimeout(() => loadHotSuppliers(), 150);
    setTimeout(() => loadVideos(), 175);  // Videos load here
    setTimeout(() => loadRecentItems(), 200);
    setTimeout(() => loadCategoryProducts(), 300);
    
    if (currentUser) {
        setTimeout(() => loadRecommendations(), 500);
    } else {
        setTimeout(() => loadPopularProducts(), 400);
    }
    
    setTimeout(() => initLazyLoading(), 500);
}

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        var userData = await sb.auth.getUser();
        currentUser = userData.data.user;
        
        if (currentUser) {
            console.log('✅ User logged in:', currentUser.id);
            await loadUserInterests();
            await trackPageView();
            var authContainer = document.getElementById('authPromptContainer');
            if (authContainer) {
                authContainer.innerHTML = '';
            }
        } else {
            console.log('👤 User not logged in');
            showAuthPrompt();
        }
    } catch (error) {
        console.error('❌ Auth error:', error);
        currentUser = null;
        showAuthPrompt();
    }
}

async function trackPageView() {
    if (!currentUser) return;
    try {
        await sb
            .from('user_activity_log')
            .insert([{
                user_id: currentUser.id,
                activity_type: 'page_view',
                page: 'homepage',
                timestamp: new Date().toISOString()
            }]);
    } catch (error) {
        console.error('Error in trackPageView:', error);
    }
}

async function trackProductView(productId) {
    if (!currentUser) return;
    try {
        await sb
            .from('user_product_interactions')
            .insert([{
                user_id: currentUser.id,
                ad_id: productId,
                interaction_type: 'view',
                created_at: new Date().toISOString()
            }]);
    } catch (error) {
        console.error('Error tracking product view:', error);
    }
}

async function trackVideoView(videoId) {
    try {
        await sb
            .from('videos')
            .update({ view_count: sb.r('view_count + 1') })
            .eq('youtube_id', videoId);
    } catch (error) {
        console.error('Error tracking video view:', error);
    }
}

// ============================================
// SHOW AUTH PROMPT
// ============================================
function showAuthPrompt() {
    var quickActions = document.querySelector('.quick-actions-section');
    if (!quickActions) return;
    
    var authHTML = `
        <div class="auth-prompt-section" id="authPrompt">
            <div class="auth-prompt-content">
                <h3>👋 Welcome to BuyUganda.online!</h3>
                <p>Sign in for personalized recommendations and faster checkout</p>
                <div class="auth-prompt-actions">
                    <a href="login.html" class="login-btn">
                        <i class="fas fa-sign-in-alt"></i> Sign In
                    </a>
                    <a href="register.html" class="register-btn">
                        <i class="fas fa-user-plus"></i> Register
                    </a>
                </div>
            </div>
        </div>
    `;
    
    var authContainer = document.getElementById('authPromptContainer');
    if (authContainer) {
        authContainer.innerHTML = authHTML;
    }
}

// ============================================
// LOAD USER INTERESTS
// ============================================
async function loadUserInterests() {
    if (!currentUser) return;
    
    try {
        var viewsData = await sb
            .from('user_product_interactions')
            .select('ad_id, created_at')
            .eq('user_id', currentUser.id)
            .eq('interaction_type', 'view')
            .order('created_at', { ascending: false })
            .limit(20);
            
        if (viewsData.error) throw viewsData.error;
        
        if (viewsData.data) {
            userInterests.viewedProducts = viewsData.data.map(function(v) { 
                return v.ad_id; 
            });
        }
        
        var searchesData = await sb
            .from('search_history')
            .select('query, searched_at')
            .eq('user_id', currentUser.id)
            .order('searched_at', { ascending: false })
            .limit(10);
            
        if (searchesData.error) throw searchesData.error;
        
        if (searchesData.data) {
            userInterests.recentSearches = searchesData.data.map(function(s) { 
                return s.query; 
            });
        }
        
        if (userInterests.viewedProducts.length > 0) {
            var productsData = await sb
                .from('ads')
                .select('category_id')
                .in('id', userInterests.viewedProducts);
                
            if (productsData.error) throw productsData.error;
                
            if (productsData.data) {
                var categories = productsData.data.map(function(p) { 
                    return p.category_id; 
                });
                userInterests.viewedCategories = [...new Set(categories)];
            }
        }
        
        console.log('📊 User interests loaded:', userInterests);
        
    } catch (error) {
        console.error('Error loading user interests:', error);
    }
}

// ============================================
// LOAD BANNERS
// ============================================
async function loadBanners() {
    try {
        var bannersData = await sb
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('display_order');

        if (bannersData.error) throw bannersData.error;

        var wrapper = document.getElementById('bannerWrapper');
        if (!wrapper) return;
        
        if (!bannersData.data || bannersData.data.length === 0) {
            wrapper.innerHTML = '';
            return;
        }

        var bannersHtml = bannersData.data.map(function(banner) {
            var bgColor = banner.background_color || '#6B21E5';
            var textColor = banner.text_color || '#FFFFFF';
            
            var linkUrl = '#';
            if (banner.link_type && banner.link_value) {
                switch(banner.link_type) {
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
                    case 'search':
                        linkUrl = 'B2B-search.html?q=' + encodeURIComponent(banner.link_value);
                        break;
                }
            }
            
            var buttonText = banner.button_text;
            
            var imageHtml = banner.image_url ? 
                '<img src="' + banner.image_url + '" alt="' + escapeHtml(banner.title) + '" loading="lazy" style="opacity:0.8;">' : '';
            
            var buttonHtml = (buttonText && linkUrl !== '#') ? 
                '<a href="' + linkUrl + '" class="banner-btn" style="background: white; color: ' + bgColor + ';">' + escapeHtml(buttonText) + '</a>' : '';
            
            return `
                <div class="swiper-slide">
                    <div class="banner-slide" style="background-color: ${bgColor};">
                        ${imageHtml}
                        <div class="banner-content" style="color: ${textColor}; background: linear-gradient(90deg, ${bgColor}CC 0%, ${bgColor}00 100%);">
                            <h3 class="banner-title">${escapeHtml(banner.title)}</h3>
                            ${banner.description ? '<p class="banner-subtitle">' + escapeHtml(banner.description) + '</p>' : ''}
                            ${buttonHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = bannersHtml;
        
        setTimeout(function() {
            if (document.querySelector('.banner-swiper') && document.querySelector('.banner-swiper .swiper-slide')) {
                if (swiperInstances.banner) swiperInstances.banner.destroy(true, true);
                swiperInstances.banner = new Swiper('.banner-swiper', {
                    autoplay: { delay: 3000 },
                    pagination: { el: '.swiper-pagination', clickable: true },
                    loop: true,
                    speed: 500
                });
            }
        }, 50);
        
    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

// ============================================
// LOAD QUICK ACTIONS
// ============================================
async function loadQuickActions() {
    try {
        var actions = [
            { icon: 'fa-search', label: 'Source by Category', link: 'categories.html', color: '#6B21E5' },
            { icon: 'fa-file-invoice', label: 'Request Quote', link: 'request-quote.html', color: '#10B981' },
            { icon: 'fa-bolt', label: 'Instant Purchase', link: 'instant-purchase-order.html', color: '#F59E0B' },
            { icon: 'fa-fire', label: 'Featured Deals', link: 'featured-deals.html', color: '#EF4444' },
            { icon: 'fa-handshake', label: 'Hot Suppliers', link: 'suppliers.html', color: '#8B5CF6' }
        ];

        var wrapper = document.getElementById('quickActionsWrapper');
        if (!wrapper) return;

        var actionsHtml = actions.map(function(action) {
            return `
                <div class="swiper-slide">
                    <a href="${action.link}" class="quick-action-item">
                        <div class="quick-action-icon" style="color: ${action.color};">
                            <i class="fas ${action.icon}"></i>
                        </div>
                        <span class="quick-action-label">${action.label}</span>
                    </a>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = actionsHtml;
        
    } catch (error) {
        console.error('Error loading quick actions:', error);
    }
}

// ============================================
// LOAD FEATURED DEALS
// ============================================
async function loadFeaturedDeals() {
    try {
        var dealsData = await sb
            .from('ads')
            .select(`
                id,
                title,
                wholesale_price,
                price,
                image_urls,
                moq
            `)
            .eq('status', 'active')
            .eq('is_featured', true)
            .not('wholesale_price', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

        if (dealsData.error) throw dealsData.error;

        var wrapper = document.getElementById('featuredDealsWrapper');
        if (!wrapper) return;
        
        if (!dealsData.data || dealsData.data.length === 0) {
            wrapper.innerHTML = '';
            return;
        }

        var dealsHtml = dealsData.data.map(function(deal) {
            var imageUrl = (deal.image_urls && deal.image_urls[0]) ? deal.image_urls[0] : 'https://via.placeholder.com/200x200?text=No+Image';
            var progressiveImage = createProgressiveImage(imageUrl, deal.title, 'medium');
            var moqHtml = deal.moq ? '<div class="product-moq">MOQ: ' + deal.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${deal.id}" class="product-card" onclick="trackProductView(${deal.id})">
                        <div class="product-image">
                            ${progressiveImage}
                            <span class="product-badge featured">FEATURED</span>
                        </div>
                        <div class="product-info">
                            <div class="product-title">${escapeHtml(deal.title.substring(0, 25))}${deal.title.length > 25 ? '...' : ''}</div>
                            <div class="product-price">UGX ${formatNumber(deal.wholesale_price || deal.price)}</div>
                            ${moqHtml}
                        </div>
                    </a>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = dealsHtml;
        
    } catch (error) {
        console.error('Error loading featured deals:', error);
    }
}

// ============================================
// LOAD CATEGORIES
// ============================================
async function loadCategories() {
    try {
        var categoriesData = await sb
            .from('categories')
            .select('id, name, image_url, icon, color_hex')
            .eq('is_active', true)
            .order('display_order')
            .limit(12);

        if (categoriesData.error) throw categoriesData.error;

        var wrapper = document.getElementById('categoriesWrapper');
        if (!wrapper) return;
        
        if (!categoriesData.data || categoriesData.data.length === 0) {
            wrapper.innerHTML = '';
            return;
        }

        var categoriesHtml = categoriesData.data.map(function(cat) {
            var imageHtml = '';
            if (cat.image_url) {
                imageHtml = `<img src="${cat.image_url}" alt="${escapeHtml(cat.name)}" loading="lazy" class="lazy-category-image" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                var iconColor = cat.color_hex || '#6B21E5';
                var iconClass = cat.icon || 'fa-tag';
                imageHtml = '<i class="fas ' + iconClass + '" style="color: ' + iconColor + ';"></i>';
            }
            
            return `
                <div class="swiper-slide">
                    <a href="category.html?id=${cat.id}" class="category-item">
                        <div class="category-image">
                            ${imageHtml}
                        </div>
                        <span class="category-name">${escapeHtml(cat.name)}</span>
                    </a>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = categoriesHtml;
        
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// ============================================
// LOAD HOT SUPPLIERS
// ============================================
async function loadHotSuppliers() {
    try {
        var suppliersData = await sb
            .from('suppliers')
            .select(`
                id,
                business_name,
                verification_status,
                profiles!suppliers_profile_id_fkey (
                    avatar_url
                )
            `)
            .eq('verification_status', 'verified')
            .limit(12);

        if (suppliersData.error) throw suppliersData.error;

        var wrapper = document.getElementById('hotSuppliersWrapper');
        if (!wrapper) return;
        
        if (!suppliersData.data || suppliersData.data.length === 0) {
            wrapper.innerHTML = '';
            return;
        }

        var supplierIds = suppliersData.data.map(function(s) { return s.id; });
        var spotlightsData = await sb
            .from('supplier_spotlights')
            .select('supplier_id')
            .in('supplier_id', supplierIds)
            .eq('is_active', true);

        var spotlightSet = new Set();
        if (spotlightsData.data) {
            spotlightsData.data.forEach(function(s) { 
                spotlightSet.add(s.supplier_id); 
            });
        }

        var suppliersHtml = suppliersData.data.map(function(supplier) {
            var isHot = spotlightSet.has(supplier.id);
            var avatarUrl = supplier.profiles ? supplier.profiles.avatar_url : null;
            var initials = supplier.business_name
                .split(' ')
                .map(function(n) { return n[0]; })
                .join('')
                .substring(0, 2)
                .toUpperCase();

            var avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = `<img src="${PLACEHOLDER_SVG}" data-src="${avatarUrl}" alt="${escapeHtml(supplier.business_name)}" class="lazy-image" style="border-radius:50%;">`;
            } else {
                avatarHtml = '<span>' + initials + '</span>';
            }
            
            var hotBadgeHtml = isHot ? '<div class="hot-badge">🔥</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="supplier-profile.html?id=${supplier.id}" class="hot-supplier-card">
                        <div class="hot-supplier-avatar">
                            ${avatarHtml}
                            ${hotBadgeHtml}
                            <div class="verified-badge-small">✓</div>
                        </div>
                        <div class="hot-supplier-name">${escapeHtml(supplier.business_name)}</div>
                    </a>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = suppliersHtml;
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// ============================================
// LOAD YOUTUBE HELP VIDEOS - FIXED CAROUSEL
// ============================================
async function loadVideos() {
    try {
        console.log('🎬 Loading videos for carousel...');
        
        var videosData = await sb
            .from('videos')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: false })
            .limit(10);

        if (videosData.error) throw videosData.error;

        var wrapper = document.getElementById('videosWrapper');
        if (!wrapper) {
            console.warn('⚠️ videosWrapper not found in DOM');
            return;
        }
        
        // If no videos, show placeholder
        if (!videosData.data || videosData.data.length === 0) {
            wrapper.innerHTML = `
                <div class="swiper-slide">
                    <div class="video-card-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; background: var(--gray-50); border-radius: 12px; border: 2px dashed var(--gray-300); min-height: 200px;">
                        <i class="fas fa-video" style="font-size: 32px; color: var(--gray-300);"></i>
                        <p style="color: var(--gray-500); margin-top: 8px;">No videos available yet</p>
                    </div>
                </div>
            `;
            return;
        }

        var videosHtml = videosData.data.map(function(video) {
            var thumbnailUrl = video.thumbnail_url || 'https://img.youtube.com/vi/' + video.youtube_id + '/mqdefault.jpg';
            
            return `
                <div class="swiper-slide">
                    <div class="video-card" onclick="openVideoModal('${video.youtube_id}', '${escapeHtml(video.title)}', '${escapeHtml(video.description || '')}')" style="flex: 0 0 260px; background: white; border-radius: 12px; overflow: hidden; cursor: pointer; border: 1px solid var(--gray-200); transition: all 0.3s;">
                        <div class="video-thumbnail-wrapper" style="position: relative; aspect-ratio: 16/9; background: var(--gray-200); overflow: hidden;">
                            <img src="${thumbnailUrl}" 
                                 alt="${escapeHtml(video.title)}" 
                                 loading="lazy"
                                 style="width: 100%; height: 100%; object-fit: cover;"
                                 onerror="this.src='https://img.youtube.com/vi/${video.youtube_id}/default.jpg'">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 48px; opacity: 0.9; text-shadow: 0 2px 12px rgba(0,0,0,0.3);">
                                <i class="fas fa-play-circle"></i>
                            </div>
                            ${video.duration ? `
                                <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.85); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">
                                    <i class="fas fa-clock"></i> ${formatDuration(video.duration)}
                                </span>
                            ` : ''}
                            <span style="position: absolute; top: 10px; left: 10px; background: rgba(11, 79, 108, 0.9); color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 500; text-transform: capitalize;">
                                ${video.category || 'General'}
                            </span>
                        </div>
                        <div style="padding: 12px 14px;">
                            <h4 style="font-size: 14px; font-weight: 600; color: var(--gray-800); margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3;">
                                ${escapeHtml(video.title)}
                            </h4>
                            <p style="font-size: 12px; color: var(--gray-500); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
                                ${escapeHtml((video.description || '').substring(0, 60))}${video.description?.length > 60 ? '...' : ''}
                            </p>
                            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--gray-400);">
                                <span><i class="fas fa-eye"></i> ${formatNumber(video.view_count || 0)} views</span>
                                <span><i class="fas fa-calendar"></i> ${formatDate(video.created_at)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = videosHtml;
        console.log('✅ Videos loaded into carousel:', videosData.data.length);
        
        // Initialize videos swiper
        setTimeout(function() {
            if (document.querySelector('.videos-swiper')) {
                if (swiperInstances.videos) swiperInstances.videos.destroy(true, true);
                swiperInstances.videos = new Swiper('.videos-swiper', {
                    slidesPerView: 1.2,
                    spaceBetween: 12,
                    freeMode: true,
                    pagination: {
                        el: '.videos-pagination',
                        clickable: true
                    },
                    breakpoints: {
                        480: { slidesPerView: 1.5 },
                        640: { slidesPerView: 2.2 },
                        768: { slidesPerView: 2.8 },
                        1024: { slidesPerView: 3.5 }
                    }
                });
                console.log('✅ Videos swiper initialized');
            }
        }, 200);
        
    } catch (error) {
        console.error('Error loading videos:', error);
        var wrapper = document.getElementById('videosWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
    }
}

// ============================================
// VIDEO MODAL FUNCTIONS
// ============================================
function openVideoModal(videoId, title, description) {
    // Check if modal exists, if not create it
    var modal = document.getElementById('videoModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'videoModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="closeVideoModal()"></div>
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h3 class="modal-title"><i class="fab fa-youtube" style="color: #FF0000;"></i> <span id="videoModalTitle">Video</span></h3>
                    <button class="modal-close" onclick="closeVideoModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="video-container" style="position: relative; padding-bottom: 56.25%; height: 0; border-radius: 8px; background: #000;">
                        <iframe id="videoIframe" 
                                width="100%" 
                                height="400" 
                                frameborder="0" 
                                allow="autoplay; encrypted-media" 
                                allowfullscreen
                                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;">
                        </iframe>
                    </div>
                    <div class="video-description-container" style="padding: 16px 0 8px;">
                        <p id="videoModalDescription" style="color: var(--gray-700); font-size: 14px; line-height: 1.6;"></p>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--gray-200); display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="btn btn-outline" onclick="closeVideoModal()">Close</button>
                    <a href="#" target="_blank" class="btn btn-primary" id="watchOnYoutubeBtn">
                        <i class="fab fa-youtube" style="color: #FF0000;"></i> Watch on YouTube
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Update modal content
    document.getElementById('videoModalTitle').textContent = title;
    document.getElementById('videoIframe').src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
    document.getElementById('videoModalDescription').textContent = description || 'No description available.';
    document.getElementById('watchOnYoutubeBtn').href = 'https://www.youtube.com/watch?v=' + videoId;
    
    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Track video view
    trackVideoView(videoId);
}

function closeVideoModal() {
    var modal = document.getElementById('videoModal');
    if (modal) {
        modal.classList.remove('show');
        var iframe = document.getElementById('videoIframe');
        if (iframe) {
            iframe.src = '';
        }
        document.body.style.overflow = '';
    }
}

// ============================================
// LOAD RECENT ITEMS
// ============================================
async function loadRecentItems() {
    try {
        var productsData = await sb
            .from('ads')
            .select(`
                id,
                title,
                wholesale_price,
                price,
                image_urls,
                moq,
                created_at
            `)
            .eq('status', 'active')
            .not('wholesale_price', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

        if (productsData.error) throw productsData.error;

        var wrapper = document.getElementById('recentItemsWrapper');
        if (!wrapper) return;
        
        if (!productsData.data || productsData.data.length === 0) {
            wrapper.innerHTML = '';
            return;
        }

        var productsHtml = productsData.data.map(function(product) {
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200x200?text=No+Image';
            var progressiveImage = createProgressiveImage(imageUrl, product.title, 'medium');
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            ${progressiveImage}
                            <span class="product-badge new">NEW</span>
                        </div>
                        <div class="product-info">
                            <div class="product-title">${escapeHtml(product.title.substring(0, 25))}${product.title.length > 25 ? '...' : ''}</div>
                            <div class="product-price">UGX ${formatNumber(product.wholesale_price || product.price)}</div>
                            ${moqHtml}
                        </div>
                    </a>
                </div>
            `;
        }).join('');
        
        wrapper.innerHTML = productsHtml;
        
    } catch (error) {
        console.error('Error loading recent items:', error);
    }
}

// ============================================
// LOAD RECOMMENDATIONS
// ============================================
async function loadRecommendations() {
    if (!currentUser) return;
    
    try {
        var recommendations = [];
        var recommendationReason = 'category_match';
        
        if (userInterests.viewedCategories.length > 0) {
            var productsData = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    image_urls,
                    moq
                `)
                .eq('status', 'active')
                .in('category_id', userInterests.viewedCategories)
                .not('wholesale_price', 'is', null)
                .order('view_count', { ascending: false })
                .limit(10);

            if (!productsData.error && productsData.data && productsData.data.length > 0) {
                recommendations = productsData.data;
                recommendationReason = 'category_match';
            }
        }
        
        if (recommendations.length === 0) {
            var trendingData = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    image_urls,
                    moq,
                    view_count
                `)
                .eq('status', 'active')
                .not('wholesale_price', 'is', null)
                .order('view_count', { ascending: false })
                .limit(10);

            if (!trendingData.error && trendingData.data && trendingData.data.length > 0) {
                recommendations = trendingData.data;
                recommendationReason = 'trending';
            }
        }
        
        if (recommendations.length === 0) {
            var recentData = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    image_urls,
                    moq
                `)
                .eq('status', 'active')
                .not('wholesale_price', 'is', null)
                .order('created_at', { ascending: false })
                .limit(10);

            if (!recentData.error && recentData.data && recentData.data.length > 0) {
                recommendations = recentData.data;
                recommendationReason = 'recently_viewed';
            }
        }
        
        var container = document.getElementById('recommendationsContainer');
        if (!container) return;
        
        if (recommendations.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        var sectionTitle = 'Recommended for You';
        var sectionIcon = 'fa-magic';
        
        if (recommendationReason === 'trending') {
            sectionTitle = 'Trending Now';
            sectionIcon = 'fa-fire';
        } else if (recommendationReason === 'recently_viewed') {
            sectionTitle = 'Just For You';
            sectionIcon = 'fa-clock';
        }
        
        var recommendationsHtml = recommendations.map(function(product) {
            var reasonIcon = REASON_ICONS[recommendationReason] || '✨';
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200x200?text=No+Image';
            var progressiveImage = createProgressiveImage(imageUrl, product.title, 'medium');
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            ${progressiveImage}
                            <span class="product-badge recommendation" title="${REASON_LABELS[recommendationReason]}">${reasonIcon}</span>
                        </div>
                        <div class="product-info">
                            <div class="product-title">${escapeHtml(product.title.substring(0, 25))}${product.title.length > 25 ? '...' : ''}</div>
                            <div class="product-price">UGX ${formatNumber(product.wholesale_price || product.price)}</div>
                            ${moqHtml}
                        </div>
                    </a>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <section class="category-product-section">
                <div class="section-header-with-link">
                    <h2><i class="fas ${sectionIcon}"></i> ${sectionTitle}</h2>
                    <a href="recommendations.html" class="section-link">
                        View All <i class="fas fa-chevron-right"></i>
                    </a>
                </div>
                <div class="swiper recommendations-swiper">
                    <div class="swiper-wrapper">
                        ${recommendationsHtml}
                    </div>
                </div>
            </section>
        `;
        
        setTimeout(function() {
            if (document.querySelector('.recommendations-swiper')) {
                swiperInstances.recommendations = new Swiper('.recommendations-swiper', {
                    slidesPerView: 2.2,
                    spaceBetween: 12,
                    freeMode: true
                });
            }
            initLazyLoading();
        }, 100);
        
    } catch (error) {
        console.error('Error loading recommendations:', error);
        await loadPopularProducts();
    }
}

// ============================================
// LOAD POPULAR PRODUCTS
// ============================================
async function loadPopularProducts() {
    try {
        var productsData = await sb
            .from('ads')
            .select(`
                id,
                title,
                wholesale_price,
                price,
                image_urls,
                moq,
                view_count,
                click_count
            `)
            .eq('status', 'active')
            .not('wholesale_price', 'is', null)
            .order('view_count', { ascending: false })
            .limit(10);
            
        if (productsData.error) throw productsData.error;
            
        var container = document.getElementById('recommendationsContainer');
        if (!container) return;
        
        if (!productsData.data || productsData.data.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        var productsHtml = productsData.data.map(function(product) {
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200x200?text=No+Image';
            var progressiveImage = createProgressiveImage(imageUrl, product.title, 'medium');
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            ${progressiveImage}
                            <span class="product-badge recommendation" title="Popular products">🔥</span>
                        </div>
                        <div class="product-info">
                            <div class="product-title">${escapeHtml(product.title.substring(0, 25))}${product.title.length > 25 ? '...' : ''}</div>
                            <div class="product-price">UGX ${formatNumber(product.wholesale_price || product.price)}</div>
                            ${moqHtml}
                        </div>
                    </a>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <section class="category-product-section">
                <div class="section-header-with-link">
                    <h2><i class="fas fa-fire"></i> Popular Products</h2>
                    <a href="popular.html" class="section-link">
                        View All <i class="fas fa-chevron-right"></i>
                    </a>
                </div>
                <div class="swiper recommendations-swiper">
                    <div class="swiper-wrapper">
                        ${productsHtml}
                    </div>
                </div>
            </section>
        `;
        
        setTimeout(function() {
            if (document.querySelector('.recommendations-swiper')) {
                swiperInstances.recommendations = new Swiper('.recommendations-swiper', {
                    slidesPerView: 2.2,
                    spaceBetween: 12,
                    freeMode: true
                });
            }
            initLazyLoading();
        }, 100);
        
    } catch (error) {
        console.error('Error loading popular products:', error);
    }
}

// ============================================
// LOAD CATEGORY PRODUCTS
// ============================================
async function loadCategoryProducts() {
    try {
        var categoriesData = await sb
            .from('categories')
            .select('id, name, display_name')
            .eq('is_active', true)
            .order('display_order')
            .limit(4);

        if (categoriesData.error) throw categoriesData.error;

        var container = document.getElementById('categoryProductSections');
        if (!container) return;
        
        var html = '';

        for (var i = 0; i < (categoriesData.data || []).length; i++) {
            var category = categoriesData.data[i];
            
            var productsData = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    image_urls,
                    moq
                `)
                .eq('status', 'active')
                .eq('category_id', category.id)
                .not('wholesale_price', 'is', null)
                .order('created_at', { ascending: false })
                .limit(6);

            if (productsData.error) continue;

            if (productsData.data && productsData.data.length > 0) {
                var productsHtml = productsData.data.map(function(product) {
                    var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200x200?text=No+Image';
                    var progressiveImage = createProgressiveImage(imageUrl, product.title, 'medium');
                    var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
                    
                    return `
                        <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                            <div class="product-image">
                                ${progressiveImage}
                            </div>
                            <div class="product-info">
                                <div class="product-title">${escapeHtml(product.title.substring(0, 20))}${product.title.length > 20 ? '...' : ''}</div>
                                <div class="product-price">UGX ${formatNumber(product.wholesale_price || product.price)}</div>
                                ${moqHtml}
                            </div>
                        </a>
                    `;
                }).join('');
                
                html += `
                    <section class="category-product-section">
                        <div class="section-header-with-link">
                            <h2>${escapeHtml(category.display_name || category.name)}</h2>
                            <a href="category.html?id=${category.id}" class="section-link">
                                View All <i class="fas fa-chevron-right"></i>
                            </a>
                        </div>
                        <div class="products-scroll">
                            <div class="products-track">
                                ${productsHtml}
                            </div>
                        </div>
                    </section>
                `;
            }
        }

        container.innerHTML = html;
        initLazyLoading();
        
    } catch (error) {
        console.error('Error loading category products:', error);
    }
}

// ============================================
// INIT SWIPER
// ============================================
function initSwiper() {
    // Quick Actions Swiper
    if (document.querySelector('.quick-actions-swiper') && document.querySelector('.quick-actions-swiper .swiper-slide')) {
        if (swiperInstances.quick) swiperInstances.quick.destroy(true, true);
        swiperInstances.quick = new Swiper('.quick-actions-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Deals Swiper
    if (document.querySelector('.deals-swiper') && document.querySelector('.deals-swiper .swiper-slide')) {
        if (swiperInstances.deals) swiperInstances.deals.destroy(true, true);
        swiperInstances.deals = new Swiper('.deals-swiper', {
            slidesPerView: 2.2,
            spaceBetween: 12,
            freeMode: true
        });
    }

    // Categories Swiper
    if (document.querySelector('.categories-swiper') && document.querySelector('.categories-swiper .swiper-slide')) {
        if (swiperInstances.categories) swiperInstances.categories.destroy(true, true);
        swiperInstances.categories = new Swiper('.categories-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Suppliers Swiper
    if (document.querySelector('.suppliers-swiper') && document.querySelector('.suppliers-swiper .swiper-slide')) {
        if (swiperInstances.suppliers) swiperInstances.suppliers.destroy(true, true);
        swiperInstances.suppliers = new Swiper('.suppliers-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Videos Swiper
    if (document.querySelector('.videos-swiper') && document.querySelector('.videos-swiper .swiper-slide')) {
        if (swiperInstances.videos) swiperInstances.videos.destroy(true, true);
        swiperInstances.videos = new Swiper('.videos-swiper', {
            slidesPerView: 1.2,
            spaceBetween: 12,
            freeMode: true,
            pagination: {
                el: '.videos-pagination',
                clickable: true
            },
            breakpoints: {
                480: { slidesPerView: 1.5 },
                640: { slidesPerView: 2.2 },
                768: { slidesPerView: 2.8 },
                1024: { slidesPerView: 3.5 }
            }
        });
        console.log('✅ Videos swiper initialized');
    }

    // Recent Items Swiper
    if (document.querySelector('.recent-swiper') && document.querySelector('.recent-swiper .swiper-slide')) {
        if (swiperInstances.recent) swiperInstances.recent.destroy(true, true);
        swiperInstances.recent = new Swiper('.recent-swiper', {
            slidesPerView: 2.2,
            spaceBetween: 12,
            freeMode: true
        });
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function formatDate(dateString) {
    if (!dateString) return 'Recently';
    var date = new Date(dateString);
    var now = new Date();
    var diff = now - date;

    if (diff < 86400000) {
        var hours = Math.floor(diff / 3600000);
        return hours === 0 ? 'Just now' : hours + 'h ago';
    } else if (diff < 604800000) {
        var days = Math.floor(diff / 86400000);
        return days + 'd ago';
    } else {
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

function showToast(message, type) {
    if (!type) type = 'info';
    var toast = document.getElementById('toast');
    if (!toast) return;
    
    var colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#6B21E5',
        warning: '#F59E0B'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (!num) return '0';
    return parseInt(num).toLocaleString('en-UG');
}

// Make functions global
window.trackProductView = trackProductView;
window.trackVideoView = trackVideoView;
window.openVideoModal = openVideoModal;
window.closeVideoModal = closeVideoModal;
window.escapeHtml = escapeHtml;
window.formatNumber = formatNumber;
window.formatDuration = formatDuration;
window.formatDate = formatDate;