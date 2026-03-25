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

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing Schist.online homepage...');
    
    // Show loading overlay
    showLoading(true, 'Loading Schist.online...');
    
    // Check authentication
    await checkAuth();
    
    // Restore scroll position from localStorage
    var savedPosition = localStorage.getItem('homeScrollPosition');
    if (savedPosition) {
        setTimeout(function() {
            window.scrollTo(0, parseInt(savedPosition));
        }, 100);
    }
    
    // Show loading states
    showLoadingStates();
    
    // Load all sections in parallel for speed
    await Promise.all([
        loadBanners(),
        loadQuickActions(),
        loadFeaturedDeals(),
        loadCategories(),
        loadHotSuppliers(),
        loadRecentItems(),
        loadCategoryProducts()
    ]);
    
    // Load recommendations after user interests are loaded
    if (currentUser) {
        await loadRecommendations();
    } else {
        await loadPopularProducts();
    }
    
    // Hide loading overlay
    showLoading(false);
    
    // Initialize Swiper after content loads
    setTimeout(function() {
        initSwiper();
    }, 200);
    
    // Save scroll position
    window.addEventListener('scroll', function() {
        localStorage.setItem('homeScrollPosition', window.scrollY);
    });
    
    // Search button
    var searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            window.location.href = 'B2B-search.html';
        });
    }
});

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
            // Track this page view
            await trackPageView();
            // Hide auth prompt if it exists
            var authContainer = document.getElementById('authPromptContainer');
            if (authContainer) {
                authContainer.innerHTML = '';
            }
        } else {
            console.log('👤 User not logged in');
            // Show auth prompt after quick actions
            showAuthPrompt();
        }
    } catch (error) {
        console.error('❌ Auth error:', error);
        currentUser = null;
        showAuthPrompt();
    }
}

// ============================================
// TRACK USER ACTIVITY
// ============================================
async function trackPageView() {
    if (!currentUser) return;
    
    try {
        // Track homepage view
        var error = await sb
            .from('user_activity_log')
            .insert([{
                user_id: currentUser.id,
                activity_type: 'page_view',
                page: 'homepage',
                timestamp: new Date().toISOString()
            }]);
            
        if (error.error) console.error('Error tracking page view:', error.error);
    } catch (error) {
        console.error('Error in trackPageView:', error);
    }
}

async function trackProductView(productId) {
    if (!currentUser) return;
    
    try {
        var result = await sb
            .from('user_product_interactions')
            .insert([{
                user_id: currentUser.id,
                ad_id: productId,
                interaction_type: 'view',
                created_at: new Date().toISOString()
            }]);
            
        if (result.error) console.error('Error tracking product view:', result.error);
    } catch (error) {
        console.error('Error in trackProductView:', error);
    }
}

// ============================================
// SHOW AUTH PROMPT (Login/Signup)
// ============================================
function showAuthPrompt() {
    var quickActions = document.querySelector('.quick-actions-section');
    if (!quickActions) return;
    
    var authHTML = `
        <div class="auth-prompt-section" id="authPrompt">
            <div class="auth-prompt-content">
                <h3>👋 Welcome to Schist.online!</h3>
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
// LOAD USER INTERESTS (for recommendations)
// ============================================
async function loadUserInterests() {
    if (!currentUser) return;
    
    try {
        // Load viewed products from user_product_interactions table
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
        
        // Load recent searches
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
        
        // Get categories from viewed products
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
// LOADING STATES
// ============================================
function showLoadingStates() {
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
                    <div class="product-card">
                        <div class="product-image skeleton"></div>
                        <div class="product-info">
                            <div class="skeleton-text" style="width: 90%; height: 16px;"></div>
                            <div class="skeleton-text" style="width: 60%; height: 20px; margin-top: 8px;"></div>
                            <div class="skeleton-text" style="width: 40%; height: 12px; margin-top: 4px;"></div>
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
        }
    }
    return html;
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
            // Use background_color from database, fallback to primary purple
            var bgColor = banner.background_color || '#6B21E5';
            var textColor = banner.text_color || '#FFFFFF';
            
            // Handle link based on link_type
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
            
            // Use button_text from database
            var buttonText = banner.button_text;
            
            var imageHtml = banner.image_url ? 
                '<img src="' + banner.image_url + '" alt="' + escapeHtml(banner.title) + '" loading="lazy">' : '';
            
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
        
    } catch (error) {
        console.error('Error loading banners:', error);
        var wrapper = document.getElementById('bannerWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
    }
}

// ============================================
// LOAD QUICK ACTIONS
// ============================================
async function loadQuickActions() {
    try {
        // You can store quick actions in a database table or use this static list
        var actions = [
            { icon: 'fa-search', label: 'Source by Category', link: 'categories.html', color: '#6B21E5' },
            { icon: 'fa-file-invoice', label: 'request-quote', link: 'request-quote.html', color: '#10B981' },
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
            var imageUrl = (deal.image_urls && deal.image_urls[0]) ? deal.image_urls[0] : 'https://via.placeholder.com/200';
            var moqHtml = deal.moq ? '<div class="product-moq">MOQ: ' + deal.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${deal.id}" class="product-card" onclick="trackProductView(${deal.id})">
                        <div class="product-image">
                            <img src="${imageUrl}" 
                                 alt="${escapeHtml(deal.title)}"
                                 loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/200'">
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
        var wrapper = document.getElementById('featuredDealsWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
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
                imageHtml = '<img src="' + cat.image_url + '" alt="' + escapeHtml(cat.name) + '" loading="lazy">';
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
        var wrapper = document.getElementById('categoriesWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
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

        // Get spotlight data from supplier_spotlights
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
                avatarHtml = '<img src="' + avatarUrl + '" alt="' + escapeHtml(supplier.business_name) + '">';
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
        var wrapper = document.getElementById('hotSuppliersWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
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
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200';
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            <img src="${imageUrl}" 
                                 alt="${escapeHtml(product.title)}"
                                 loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/200'">
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
        var wrapper = document.getElementById('recentItemsWrapper');
        if (wrapper) {
            wrapper.innerHTML = '';
        }
    }
}

// ============================================
// LOAD RECOMMENDATIONS (For logged in users)
// ============================================
async function loadRecommendations() {
    if (!currentUser) return;
    
    try {
        showLoading(true, 'Personalizing your recommendations...');
        
        var recommendations = [];
        var recommendationReason = 'category_match';
        
        // Strategy 1: Based on viewed categories
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
        
        // Strategy 2: If no category-based recommendations, use trending products
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
        
        // Strategy 3: If still no recommendations, use recent products
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
        
        showLoading(false);
        
        var container = document.getElementById('recommendationsContainer');
        if (!container) return;
        
        if (recommendations.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        // Get title based on reason
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
            var reasonLabel = REASON_LABELS[recommendationReason] || 'Recommended for you';
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200';
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            <img src="${imageUrl}" 
                                 alt="${escapeHtml(product.title)}"
                                 loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/200'">
                            <span class="product-badge recommendation" title="${reasonLabel}">${reasonIcon}</span>
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
        
        // Initialize recommendations swiper
        setTimeout(function() {
            if (document.querySelector('.recommendations-swiper')) {
                swiperInstances.recommendations = new Swiper('.recommendations-swiper', {
                    slidesPerView: 2.2,
                    spaceBetween: 12,
                    freeMode: true
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('Error loading recommendations:', error);
        showLoading(false);
        
        // Fallback to popular products
        await loadPopularProducts();
    }
}

// ============================================
// LOAD POPULAR PRODUCTS (Fallback for non-logged in users)
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
            var reasonIcon = REASON_ICONS.popular || '🔥';
            var reasonLabel = REASON_LABELS.popular || 'Popular products';
            var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200';
            var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
            
            return `
                <div class="swiper-slide">
                    <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                        <div class="product-image">
                            <img src="${imageUrl}" 
                                 alt="${escapeHtml(product.title)}"
                                 loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/200'">
                            <span class="product-badge recommendation" title="${reasonLabel}">${reasonIcon}</span>
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
        
        // Initialize swiper
        setTimeout(function() {
            if (document.querySelector('.recommendations-swiper')) {
                swiperInstances.recommendations = new Swiper('.recommendations-swiper', {
                    slidesPerView: 2.2,
                    spaceBetween: 12,
                    freeMode: true
                });
            }
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
                    var imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200';
                    var moqHtml = product.moq ? '<div class="product-moq">MOQ: ' + product.moq + '</div>' : '';
                    
                    return `
                        <a href="B2B-product-detail.html?id=${product.id}" class="product-card" onclick="trackProductView(${product.id})">
                            <div class="product-image">
                                <img src="${imageUrl}" 
                                     alt="${escapeHtml(product.title)}"
                                     loading="lazy"
                                     onerror="this.src='https://via.placeholder.com/200'">
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
        
    } catch (error) {
        console.error('Error loading category products:', error);
        var container = document.getElementById('categoryProductSections');
        if (container) {
            container.innerHTML = '';
        }
    }
}

// ============================================
// INIT SWIPER
// ============================================
function initSwiper() {
    // Destroy existing instances
    for (var key in swiperInstances) {
        if (swiperInstances[key] && swiperInstances[key].destroy) {
            swiperInstances[key].destroy(true, true);
        }
    }

    // Banner Swiper
    if (document.querySelector('.banner-swiper') && document.querySelector('.banner-swiper .swiper-slide')) {
        swiperInstances.banner = new Swiper('.banner-swiper', {
            autoplay: { delay: 3000 },
            pagination: { el: '.swiper-pagination', clickable: true },
            loop: true,
            speed: 500
        });
    }

    // Quick Actions Swiper
    if (document.querySelector('.quick-actions-swiper') && document.querySelector('.quick-actions-swiper .swiper-slide')) {
        swiperInstances.quick = new Swiper('.quick-actions-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Deals Swiper
    if (document.querySelector('.deals-swiper') && document.querySelector('.deals-swiper .swiper-slide')) {
        swiperInstances.deals = new Swiper('.deals-swiper', {
            slidesPerView: 2.2,
            spaceBetween: 12,
            freeMode: true
        });
    }

    // Categories Swiper
    if (document.querySelector('.categories-swiper') && document.querySelector('.categories-swiper .swiper-slide')) {
        swiperInstances.categories = new Swiper('.categories-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Suppliers Swiper
    if (document.querySelector('.suppliers-swiper') && document.querySelector('.suppliers-swiper .swiper-slide')) {
        swiperInstances.suppliers = new Swiper('.suppliers-swiper', {
            slidesPerView: 3.5,
            spaceBetween: 8,
            freeMode: true
        });
    }

    // Recent Items Swiper
    if (document.querySelector('.recent-swiper') && document.querySelector('.recent-swiper .swiper-slide')) {
        swiperInstances.recent = new Swiper('.recent-swiper', {
            slidesPerView: 2.2,
            spaceBetween: 12,
            freeMode: true
        });
    }
}

// ============================================
// UTILITIES
// ============================================
function showLoading(show, message) {
    if (!message) message = 'Loading...';
    var overlay = document.getElementById('loadingOverlay');
    var messageEl = document.getElementById('loadingMessage');
    
    if (!overlay || !messageEl) return;
    
    if (show) {
        messageEl.textContent = message;
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
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

// Make trackProductView globally available
window.trackProductView = trackProductView;

// ============================================
// MAKE FUNCTIONS GLOBAL
// ============================================
window.escapeHtml = escapeHtml;
window.formatNumber = formatNumber;
