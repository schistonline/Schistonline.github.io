// ============================================
// DISCOVER PAGE - MINIMAL VERSION
// ============================================

console.log('🚀 Discover page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const DiscoverPage = {
    categories: [],
    parentCategories: [],
    subCategories: [],
    products: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Discover page initializing...');
        
        try {
            await this.loadCategories();
            await this.loadProducts();
            this.renderCategoryPills();
            this.renderDiscoverSections();
            this.setupEventListeners();
            this.initCarousels();
            
            console.log('✅ Discover page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
        }
    },
    
    // ============================================
    // LOAD DATA
    // ============================================
    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true, nullsFirst: false });

            if (error) throw error;

            this.categories = data || [];
            this.parentCategories = this.categories.filter(c => !c.parent_id);
            this.subCategories = this.categories.filter(c => c.parent_id);
            
            console.log(`✅ Loaded ${this.categories.length} categories`);
            
        } catch (error) {
            console.error('❌ Error loading categories:', error);
        }
    },
    
    async loadProducts() {
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    id,
                    image_urls,
                    category_id,
                    subcategory_id
                `)
                .eq('status', 'active')
                .limit(500);

            if (error) throw error;

            this.products = data || [];
            console.log(`✅ Loaded ${this.products.length} products`);
            
        } catch (error) {
            console.error('❌ Error loading products:', error);
        }
    },
    
    // ============================================
    // RENDER CATEGORY PILLS (Icons + Conducive Words)
    // ============================================
    renderCategoryPills() {
        const container = document.getElementById('categoryPills');
        if (!container) return;
        
        if (this.parentCategories.length === 0) {
            container.innerHTML = '<div class="pill-loading">No categories</div>';
            return;
        }
        
        let html = '<div class="pills-container">';
        
        // Add "All" pill
        html += `<a href="#" class="pill active" data-category="all" onclick="DiscoverPage.filterByCategory('all')">
            <i class="fas fa-th-large"></i> All
        </a>`;
        
        // Add parent categories using conducive words
        this.parentCategories.forEach(cat => {
            const icon = cat.conducive_icon || 'fa-tag';
            // Use conducive tagline as the display text, fallback to display_name
            const displayText = cat.conducive_tagline ? 
                cat.conducive_tagline.split(' ').slice(0, 2).join(' ') : // Take first 2 words
                (cat.display_name || cat.name).split(' ')[0]; // Take first word
            
            html += `<a href="#" class="pill" data-category="${cat.id}" onclick="DiscoverPage.filterByCategory(${cat.id})">
                <i class="fas ${icon}"></i> ${displayText}
            </a>`;
        });
        
        html += '</div>';
        container.innerHTML = html;
    },
    
    // ============================================
    // RENDER DISCOVER SECTIONS
    // ============================================
    renderDiscoverSections(filterCategoryId = null) {
        const container = document.getElementById('discoverSections');
        if (!container) return;
        
        let categoriesToShow = filterCategoryId ? 
            this.parentCategories.filter(c => c.id === filterCategoryId) : 
            this.parentCategories;
        
        if (categoriesToShow.length === 0) {
            container.innerHTML = '<div class="loading-sections"><div class="spinner"></div></div>';
            return;
        }
        
        let html = '';
        
        categoriesToShow.forEach(cat => {
            // Get subcategories for this parent
            const subs = this.subCategories.filter(s => s.parent_id === cat.id);
            if (subs.length === 0) return;
            
            // Use conducive tagline as section title
            const sectionTitle = cat.conducive_tagline || cat.display_name || cat.name;
            
            html += `
                <section class="discover-section" data-category="${cat.id}">
                    <div class="section-header">
                        <h2 style="color: ${cat.color_hex || '#0B4F6C'}">${sectionTitle}</h2>
                    </div>
                    
                    <div class="carousel-container">
                        <div class="swiper category-swiper-${cat.id}">
                            <div class="swiper-wrapper">
                                ${this.renderSubcategorySlides(subs, cat.color_hex)}
                            </div>
                        </div>
                    </div>
                </section>
            `;
        });
        
        container.innerHTML = html;
        
        // Initialize carousels after adding sections
        setTimeout(() => this.initCarousels(), 50);
    },
    
    renderSubcategorySlides(subcategories, color) {
        return subcategories.map(sub => {
            // Get a product image for this subcategory
            const subProducts = this.products.filter(p => p.subcategory_id === sub.id);
            const imageUrl = subProducts[0]?.image_urls?.[0] || this.getRandomImageForCategory(sub.name);
            
            return `
                <div class="swiper-slide">
                    <a href="category.html?id=${sub.id}" class="subcategory-card">
                        <div class="card-image">
                            <img src="${imageUrl}" alt="${sub.display_name || sub.name}" loading="lazy">
                        </div>
                        <div class="card-name">${sub.display_name || sub.name}</div>
                    </a>
                </div>
            `;
        }).join('');
    },
    
    // ============================================
    // FILTER BY CATEGORY
    // ============================================
    filterByCategory(categoryId) {
        // Update active pill
        document.querySelectorAll('.pill').forEach(pill => {
            pill.classList.remove('active');
            if (pill.dataset.category == categoryId) {
                pill.classList.add('active');
            }
        });
        
        if (categoryId === 'all') {
            this.renderDiscoverSections();
        } else {
            this.renderDiscoverSections(parseInt(categoryId));
        }
    },
    
    // ============================================
    // INIT CAROUSELS (No Arrows)
    // ============================================
    initCarousels() {
        // Initialize all category swipers
        this.parentCategories.forEach(cat => {
            const swiperEl = document.querySelector(`.category-swiper-${cat.id}`);
            if (swiperEl) {
                new Swiper(`.category-swiper-${cat.id}`, {
                    slidesPerView: 'auto',
                    spaceBetween: 12,
                    freeMode: true,
                    loop: false,
                    speed: 400,
                    touchRatio: 1.5,
                    resistance: true,
                    resistanceRatio: 0.8
                });
            }
        });
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    getRandomImageForCategory(categoryName) {
        // Simple placeholder images based on category
        const images = {
            'electronics': 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=200&h=200&fit=crop',
            'fashion': 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=200&h=200&fit=crop',
            'clothing': 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=200&h=200&fit=crop',
            'home': 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=200&h=200&fit=crop',
            'furniture': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200&h=200&fit=crop',
            'kitchen': 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop',
            'automotive': 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=200&h=200&fit=crop',
            'sports': 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=200&h=200&fit=crop',
            'beauty': 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&h=200&fit=crop',
            'health': 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=200&h=200&fit=crop',
            'books': 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=200&h=200&fit=crop',
            'toys': 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=200&h=200&fit=crop',
            'baby': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=200&h=200&fit=crop',
            'pet': 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=200&h=200&fit=crop',
            'office': 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=200&h=200&fit=crop',
            'tools': 'https://images.unsplash.com/photo-1581147036324-c1c88cc6e71e?w=200&h=200&fit=crop',
            'jewelry': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=200&h=200&fit=crop'
        };
        
        for (const [key, url] of Object.entries(images)) {
            if (categoryName.toLowerCase().includes(key)) {
                return url;
            }
        }
        
        return 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=200&h=200&fit=crop';
    },
    
    // ============================================
    // SEARCH TOGGLE
    // ============================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('show');
        
        if (searchBar.classList.contains('show')) {
            document.getElementById('searchInput').focus();
        }
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Search toggle
        document.getElementById('searchToggle').addEventListener('click', () => {
            this.toggleSearch();
        });
        
        document.getElementById('searchClose').addEventListener('click', () => {
            document.getElementById('searchBar').classList.remove('show');
        });
        
        // Search on enter
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query) {
                    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
                }
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    DiscoverPage.init();
});

// Make functions globally available
window.DiscoverPage = DiscoverPage;