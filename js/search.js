// ============================================
// PRODUCT VIDEO SEARCH PAGE
// Search interface for product videos
// ============================================

console.log('🔍 Search page loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SearchPage = {
    currentUser: null,
    recentSearches: [],
    trendingSearches: [],
    categories: [
        { id: 1, name: 'Electronics', icon: 'fa-laptop', count: 245, color: '#0B4F6C' },
        { id: 2, name: 'Fashion', icon: 'fa-tshirt', count: 189, color: '#10B981' },
        { id: 3, name: 'Home & Living', icon: 'fa-home', count: 156, color: '#F59E0B' },
        { id: 4, name: 'Beauty', icon: 'fa-spa', count: 98, color: '#EC4899' },
        { id: 5, name: 'Sports', icon: 'fa-futbol', count: 67, color: '#3B82F6' },
        { id: 6, name: 'Automotive', icon: 'fa-car', count: 54, color: '#EF4444' },
        { id: 7, name: 'Food', icon: 'fa-utensils', count: 112, color: '#8B5CF6' },
        { id: 8, name: 'Industrial', icon: 'fa-industry', count: 43, color: '#6B7280' }
    ],
    suppliers: [],
    
    async init() {
        try {
            await this.checkAuth();
            await this.loadTrending();
            await this.loadSuppliers();
            this.loadRecentSearches();
            this.renderCategories();
            this.renderTrending();
            this.renderRecent();
            this.renderSuppliers();
            this.setupEventListeners();
            
            console.log('✅ Search page ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading search', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
        } catch (error) {
            console.error('Auth check error:', error);
        }
    },
    
    async loadTrending() {
        try {
            const { data, error } = await sb
                .from('search_history')
                .select('query, count')
                .order('count', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            
            this.trendingSearches = data || [
                { query: 'smartphone', count: 1250 },
                { query: 'laptop', count: 980 },
                { query: 'fashion', count: 876 },
                { query: 'sneakers', count: 654 },
                { query: 'handbag', count: 543 },
                { query: 'watch', count: 432 },
                { query: 'headphones', count: 321 },
                { query: 'dress', count: 298 },
                { query: 'shoes', count: 276 },
                { query: 'bag', count: 245 }
            ];
        } catch (error) {
            console.error('Error loading trending:', error);
        }
    },
    
    async loadSuppliers() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    id,
                    business_name,
                    profile:profiles!suppliers_profile_id_fkey (
                        avatar_url
                    )
                `)
                .limit(10);
            
            if (error) throw error;
            
            this.suppliers = data || [];
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    },
    
    loadRecentSearches() {
        try {
            const saved = localStorage.getItem('recentSearches');
            this.recentSearches = saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading recent searches:', error);
            this.recentSearches = [];
        }
    },
    
    saveRecentSearch(query) {
        if (!query.trim()) return;
        
        // Remove if already exists
        this.recentSearches = this.recentSearches.filter(q => q !== query);
        
        // Add to beginning
        this.recentSearches.unshift(query);
        
        // Keep only last 10
        if (this.recentSearches.length > 10) {
            this.recentSearches = this.recentSearches.slice(0, 10);
        }
        
        // Save to localStorage
        localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
        
        // Save to database if user is logged in
        if (this.currentUser) {
            sb.from('search_history').upsert({
                user_id: this.currentUser.id,
                query: query,
                count: 1,
                searched_at: new Date().toISOString()
            }).then();
        }
        
        this.renderRecent();
    },
    
    renderCategories() {
        const grid = document.getElementById('categoriesGrid');
        if (!grid) return;
        
        grid.innerHTML = this.categories.map(cat => `
            <a href="search-results.html?category=${cat.name.toLowerCase()}" class="category-card">
                <div class="category-icon" style="background: ${cat.color}20; color: ${cat.color};">
                    <i class="fas ${cat.icon}"></i>
                </div>
                <div class="category-name">${cat.name}</div>
                <div class="category-count">${cat.count}+ videos</div>
            </a>
        `).join('');
    },
    
    renderTrending() {
        const list = document.getElementById('trendingList');
        if (!list) return;
        
        list.innerHTML = this.trendingSearches.map((item, index) => `
            <div class="trending-item" onclick="SearchPage.search('${item.query}')">
                <div class="trending-info">
                    <div class="trending-rank ${index < 3 ? 'top-3' : ''}">${index + 1}</div>
                    <span class="trending-text">${this.escapeHtml(item.query)}</span>
                </div>
                <span class="trending-count">${item.count.toLocaleString()} searches</span>
            </div>
        `).join('');
    },
    
    renderRecent() {
        const list = document.getElementById('recentList');
        if (!list) return;
        
        if (this.recentSearches.length === 0) {
            list.innerHTML = `
                <div class="empty-recent">
                    <i class="fas fa-history"></i>
                    <p>No recent searches</p>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.recentSearches.map(query => `
            <div class="recent-item">
                <div class="recent-info" onclick="SearchPage.search('${query}')">
                    <i class="fas fa-history"></i>
                    <span class="recent-text">${this.escapeHtml(query)}</span>
                </div>
                <button class="remove-recent" onclick="SearchPage.removeRecent('${query}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },
    
    renderSuppliers() {
        const scroll = document.getElementById('suppliersScroll');
        if (!scroll) return;
        
        if (this.suppliers.length === 0) {
            scroll.innerHTML = '<div style="padding: 20px; color: var(--gray-500);">No suppliers yet</div>';
            return;
        }
        
        scroll.innerHTML = this.suppliers.map(supplier => {
            const name = supplier.business_name || 'Supplier';
            const initial = name.charAt(0).toUpperCase();
            const avatar = supplier.profile?.avatar_url;
            
            return `
                <div class="supplier-chip" onclick="SearchPage.search('${name}')">
                    <div class="supplier-avatar">
                        ${avatar ? `<img src="${avatar}" alt="${name}">` : initial}
                    </div>
                    <span class="supplier-name">${this.escapeHtml(name)}</span>
                </div>
            `;
        }).join('');
    },
    
    search(query) {
        if (!query.trim()) return;
        
        this.saveRecentSearch(query);
        window.location.href = `search-results.html?q=${encodeURIComponent(query)}`;
    },
    
    removeRecent(query) {
        this.recentSearches = this.recentSearches.filter(q => q !== query);
        localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
        this.renderRecent();
        this.showToast('Removed from recent', 'info');
    },
    
    clearAllRecent() {
        this.recentSearches = [];
        localStorage.removeItem('recentSearches');
        this.renderRecent();
        this.showToast('All recent searches cleared', 'success');
    },
    
    clearSearch() {
        const input = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearBtn');
        
        if (input) {
            input.value = '';
            input.focus();
        }
        if (clearBtn) {
            clearBtn.classList.remove('show');
        }
        
        const dropdown = document.getElementById('suggestionsDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    },
    
    async showSuggestions(query) {
        const dropdown = document.getElementById('suggestionsDropdown');
        if (!dropdown || !query.trim()) {
            if (dropdown) dropdown.classList.remove('show');
            return;
        }
        
        try {
            // Get suggestions from database
            const { data, error } = await sb
                .from('product_videos')
                .select('caption, product:ads(title), supplier:suppliers(business_name)')
                .or(`caption.ilike.%${query}%,product.title.ilike.%${query}%,supplier.business_name.ilike.%${query}%`)
                .limit(5);
            
            if (error) throw error;
            
            const suggestions = data || [];
            
            if (suggestions.length > 0) {
                dropdown.innerHTML = suggestions.map(item => {
                    const text = item.caption || item.product?.title || item.supplier?.business_name;
                    const type = item.caption ? 'caption' : (item.product ? 'product' : 'supplier');
                    
                    return `
                        <div class="suggestion-item" onclick="SearchPage.search('${text}')">
                            <i class="fas fa-search"></i>
                            <span class="suggestion-text">${this.escapeHtml(text)}</span>
                            <span class="suggestion-type">${type}</span>
                        </div>
                    `;
                }).join('');
                dropdown.classList.add('show');
            } else {
                dropdown.classList.remove('show');
            }
        } catch (error) {
            console.error('Error getting suggestions:', error);
        }
    },
    
    openVoiceSearch() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showToast('Voice search not supported in this browser', 'error');
            return;
        }
        
        document.getElementById('voiceModal').classList.add('show');
        
        // Start voice recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        recognition.start();
        
        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            document.getElementById('voiceModal').classList.remove('show');
            this.search(speechResult);
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            document.getElementById('voiceModal').classList.remove('show');
            this.showToast('Voice recognition failed', 'error');
        };
        
        recognition.onend = () => {
            setTimeout(() => {
                document.getElementById('voiceModal').classList.remove('show');
            }, 5000);
        };
    },
    
    closeVoiceSearch() {
        document.getElementById('voiceModal').classList.remove('show');
    },
    
    showToast(message, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearBtn');
        
        if (searchInput) {
            // Search on enter
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.search(searchInput.value);
                }
            });
            
            // Show clear button when typing
            searchInput.addEventListener('input', (e) => {
                if (clearBtn) {
                    if (e.target.value.length > 0) {
                        clearBtn.classList.add('show');
                        this.showSuggestions(e.target.value);
                    } else {
                        clearBtn.classList.remove('show');
                        document.getElementById('suggestionsDropdown')?.classList.remove('show');
                    }
                }
            });
            
            // Focus input
            searchInput.focus();
        }
        
        // Category chips
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                const category = e.target.dataset.category;
                if (category !== 'all') {
                    this.search(category);
                }
            });
        });
        
        // Quick filters
        document.querySelectorAll('.quick-filter').forEach(filter => {
            filter.addEventListener('click', (e) => {
                document.querySelectorAll('.quick-filter').forEach(f => f.classList.remove('active'));
                e.target.classList.add('active');
                // Apply filter logic here
            });
        });
        
        // Click outside to close suggestions
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('suggestionsDropdown');
            const input = document.getElementById('searchInput');
            
            if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
                dropdown.classList.remove('show');
            }
        });
    }
};

// Global functions
window.SearchPage = SearchPage;
window.clearSearch = () => SearchPage.clearSearch();
window.openVoiceSearch = () => SearchPage.openVoiceSearch();
window.closeVoiceSearch = () => SearchPage.closeVoiceSearch();
window.clearAllRecent = () => SearchPage.clearAllRecent();
window.removeRecent = (query) => SearchPage.removeRecent(query);

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SearchPage.init());
} else {
    SearchPage.init();
}