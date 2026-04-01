// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let categories = [];
let currentCategory = null;
let isMobile = window.innerWidth <= 768;

// Cache keys
const CACHE_KEYS = {
    CATEGORIES: 'categories_data',
    SUBCATEGORIES_PREFIX: 'subcategories_',
    PRODUCT_COUNTS: 'product_counts'
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    renderCuratedSection();
    setupEventListeners();
    
    // Handle resize
    window.addEventListener('resize', handleResize);
    
    // Restore last selected category
    const lastCategory = localStorage.getItem('lastSelectedCategory');
    if (lastCategory) {
        setTimeout(() => {
            selectCategory(parseInt(lastCategory));
        }, 500);
    }
});

function handleResize() {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;
    
    // If switching between mobile and desktop, re-render with current category
    if (wasMobile !== isMobile && currentCategory) {
        selectCategory(currentCategory.id);
    }
}

// ============================================
// LOAD CATEGORIES
// ============================================
async function loadCategories() {
    const desktopList = document.getElementById('desktopCategoriesList');
    const mobileList = document.getElementById('mobileCategoriesList');
    
    // Show loading skeletons
    if (desktopList) desktopList.innerHTML = getSkeletonCategories(10);
    if (mobileList) mobileList.innerHTML = getMobileSkeletonCategories(10);
    
    try {
        // Try to load from cache first
        const cached = getCachedData(CACHE_KEYS.CATEGORIES);
        const cachedCounts = getCachedData(CACHE_KEYS.PRODUCT_COUNTS);
        
        if (cached && cachedCounts) {
            categories = cached;
            renderAllCategoryViews(cached, cachedCounts);
            
            // Select first category by default
            if (categories.length > 0 && !currentCategory) {
                selectCategory(categories[0].id);
            }
            return;
        }

        // Fetch from database
        const { data: cats, error } = await sb
            .from('categories')
            .select('id, name, image_url, icon, color_hex, display_name')
            .eq('is_active', true)
            .is('parent_id', null)
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        
        categories = cats || [];
        
        // Get product counts for each category
        const productCounts = {};
        
        for (const category of categories) {
            const { count } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .eq('category_id', category.id);
                
            productCounts[category.id] = count || 0;
        }
        
        // Cache the data
        cacheData(CACHE_KEYS.CATEGORIES, categories, 3600000); // 1 hour
        cacheData(CACHE_KEYS.PRODUCT_COUNTS, productCounts, 3600000);
        
        renderAllCategoryViews(categories, productCounts);
        
        // Select first category by default
        if (categories.length > 0) {
            selectCategory(categories[0].id);
        }
        
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// ============================================
// RENDER ALL CATEGORY VIEWS
// ============================================
function renderAllCategoryViews(cats, productCounts) {
    renderDesktopCategories(cats, productCounts);
    renderMobileCategories(cats, productCounts);
}

function renderDesktopCategories(cats, productCounts) {
    const list = document.getElementById('desktopCategoriesList');
    if (!list) return;
    
    list.innerHTML = cats.map(cat => {
        const isActive = currentCategory?.id === cat.id;
        const productCount = productCounts[cat.id] || 0;
        
        return `
            <div class="category-main-item ${isActive ? 'active' : ''}" 
                 onclick="selectCategory(${cat.id})"
                 data-category-id="${cat.id}">
                <span class="category-main-name">${escapeHtml(cat.display_name || cat.name)}</span>
                <span class="category-main-count">${productCount}</span>
            </div>
        `;
    }).join('');
}

function renderMobileCategories(cats, productCounts) {
    const list = document.getElementById('mobileCategoriesList');
    if (!list) return;
    
    list.innerHTML = cats.map(cat => {
        const isActive = currentCategory?.id === cat.id;
        
        return `
            <div class="mobile-category-item ${isActive ? 'active' : ''}" 
                 onclick="selectCategory(${cat.id})"
                 data-category-id="${cat.id}">
                ${escapeHtml(cat.display_name || cat.name)}
            </div>
        `;
    }).join('');
}

// ============================================
// SELECT CATEGORY
// ============================================
window.selectCategory = async function(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    currentCategory = category;
    
    // Save to localStorage
    localStorage.setItem('lastSelectedCategory', categoryId);
    
    // Update active states
    updateActiveStates(categoryId);
    
    // Update headers
    updateCategoryHeaders(category);
    
    // Show loading in subcategories
    showSubcategoryLoading();
    
    try {
        // Try to load from cache first
        const cacheKey = `${CACHE_KEYS.SUBCATEGORIES_PREFIX}${categoryId}`;
        const cached = getCachedData(cacheKey);
        
        if (cached) {
            renderAllSubcategoryViews(cached.subcategories, cached.counts);
            return;
        }
        
        // Fetch subcategories
        const { data: subs, error } = await sb
            .from('categories')
            .select('id, name, image_url, icon, color_hex, display_name')
            .eq('is_active', true)
            .eq('parent_id', categoryId)
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        
        const subcategories = subs || [];
        
        // Get product counts for subcategories
        const subCounts = {};
        
        for (const sub of subcategories) {
            const { count } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .eq('subcategory_id', sub.id);
                
            subCounts[sub.id] = count || 0;
        }
        
        // Cache subcategory data
        cacheData(cacheKey, {
            subcategories: subcategories,
            counts: subCounts
        }, 3600000); // 1 hour
        
        renderAllSubcategoryViews(subcategories, subCounts);
        
    } catch (error) {
        console.error('Error loading subcategories:', error);
    }
};

function updateActiveStates(categoryId) {
    // Desktop
    document.querySelectorAll('.category-main-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.categoryId == categoryId) {
            item.classList.add('active');
        }
    });
    
    // Mobile
    document.querySelectorAll('.mobile-category-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.categoryId == categoryId) {
            item.classList.add('active');
        }
    });
}

function updateCategoryHeaders(category) {
    // Desktop
    const desktopHeader = document.getElementById('desktopSelectedCategoryName');
    const desktopViewAll = document.getElementById('desktopViewAllLink');
    if (desktopHeader) desktopHeader.textContent = category.display_name || category.name;
    if (desktopViewAll) desktopViewAll.href = `category.html?id=${category.id}`;
    
    // Mobile
    const mobileHeader = document.getElementById('mobileSelectedCategory');
    if (mobileHeader) mobileHeader.textContent = category.display_name || category.name;
}

function showSubcategoryLoading() {
    // Desktop
    const desktopGrid = document.getElementById('desktopSubcategoriesGrid');
    if (desktopGrid) desktopGrid.innerHTML = getSkeletonSubcategories(8);
    
    // Mobile
    const mobileGrid = document.getElementById('mobileSubcategoriesGrid');
    if (mobileGrid) mobileGrid.innerHTML = getMobileSkeletonSubcategories(8);
}

function renderAllSubcategoryViews(subs, counts) {
    renderDesktopSubcategories(subs, counts);
    renderMobileSubcategories(subs, counts);
}

function renderDesktopSubcategories(subs, counts) {
    const grid = document.getElementById('desktopSubcategoriesGrid');
    if (!grid) return;
    
    if (!subs || subs.length === 0) {
        grid.innerHTML = '<p>No subcategories found</p>';
        return;
    }
    
    grid.innerHTML = subs.map(sub => {
        const imageUrl = sub.image_url;
        const hasImage = imageUrl && imageUrl.trim() !== '';
        const productCount = counts[sub.id] || 0;
        
        return `
            <a href="category.html?id=${sub.id}" class="subcategory-card">
                <div class="subcategory-image">
                    ${hasImage ? 
                        `<img src="${imageUrl}" alt="${escapeHtml(sub.display_name || sub.name)}" loading="lazy">` : 
                        `<i class="fas ${sub.icon || 'fa-tag'}"></i>`
                    }
                </div>
                <div class="subcategory-name">${escapeHtml(sub.display_name || sub.name)}</div>
                <div class="subcategory-count">${productCount} products</div>
            </a>
        `;
    }).join('');
}

function renderMobileSubcategories(subs, counts) {
    const grid = document.getElementById('mobileSubcategoriesGrid');
    if (!grid) return;
    
    if (!subs || subs.length === 0) {
        grid.innerHTML = '<p>No subcategories found</p>';
        return;
    }
    
    grid.innerHTML = subs.map(sub => {
        const imageUrl = sub.image_url;
        const hasImage = imageUrl && imageUrl.trim() !== '';
        const productCount = counts[sub.id] || 0;
        
        return `
            <a href="category.html?id=${sub.id}" class="mobile-subcategory-item">
                <div class="mobile-subcategory-image">
                    ${hasImage ? 
                        `<img src="${imageUrl}" alt="${escapeHtml(sub.display_name || sub.name)}" loading="lazy">` : 
                        `<i class="fas ${sub.icon || 'fa-tag'}"></i>`
                    }
                </div>
                <div class="mobile-subcategory-info">
                    <div class="mobile-subcategory-name">${escapeHtml(sub.display_name || sub.name)}</div>
                    <div class="mobile-subcategory-count">${productCount} products</div>
                </div>
            </a>
        `;
    }).join('');
}

// ============================================
// CURATED SECTION
// ============================================
function renderCuratedSection() {
    const curatedItems = document.getElementById('curatedItems');
    if (!curatedItems) return;
    
    const items = [
        'Headband', 'Charms', 'Fine Jewelry Necklaces',
        'Acrylic beads', 'Silicone Beads', 'Hair Jewelry',
        'Crystal Beads', 'Jewelry Tools', 'Moonstone'
    ];
    
    curatedItems.innerHTML = items.map(item => `
        <span class="curated-item" onclick="searchCurated('${item}')">${item}</span>
    `).join('');
}

window.selectCuratedTab = function(tabName) {
    document.querySelectorAll('.curated-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.trim() === tabName) {
            tab.classList.add('active');
        }
    });
};

window.searchCurated = function(query) {
    window.location.href = `B2B-search.html?q=${encodeURIComponent(query)}`;
};

// ============================================
// SKELETON LOADERS
// ============================================
function getSkeletonCategories(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="category-main-item">
                <div class="skeleton-line" style="width: 70%;"></div>
                <div class="skeleton-text" style="width: 30px;"></div>
            </div>
        `;
    }
    return html;
}

function getMobileSkeletonCategories(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="mobile-category-item">
                <div class="skeleton-line" style="width: 80%;"></div>
            </div>
        `;
    }
    return html;
}

function getSkeletonSubcategories(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="subcategory-card">
                <div class="skeleton-circle"></div>
                <div class="skeleton-text" style="width: 100px;"></div>
                <div class="skeleton-text" style="width: 60px;"></div>
            </div>
        `;
    }
    return html;
}

function getMobileSkeletonSubcategories(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="mobile-subcategory-item">
                <div class="skeleton-circle"></div>
                <div class="mobile-subcategory-info">
                    <div class="skeleton-text" style="width: 100px;"></div>
                    <div class="skeleton-text" style="width: 60px;"></div>
                </div>
            </div>
        `;
    }
    return html;
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Search button
    document.getElementById('searchBtn')?.addEventListener('click', () => {
        window.location.href = 'B2B-search.html';
    });
}

// ============================================
// CACHE MANAGEMENT
// ============================================
function cacheData(key, data, ttl = 3600000) {
    const cacheItem = {
        data: data,
        timestamp: Date.now(),
        ttl: ttl
    };
    localStorage.setItem(key, JSON.stringify(cacheItem));
}

function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    try {
        const { data, timestamp, ttl } = JSON.parse(cached);
        
        if (Date.now() - timestamp < ttl) {
            return data;
        }
        
        localStorage.removeItem(key);
        return null;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
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

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#0B4F6C',
        warning: '#F59E0B'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL USE
// ============================================
window.selectCategory = selectCategory;
window.selectCuratedTab = selectCuratedTab;
window.searchCurated = searchCurated;
window.showToast = showToast;