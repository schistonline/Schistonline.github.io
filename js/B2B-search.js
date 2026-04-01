// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SearchPage = {
    currentUser: null,
    searchHistory: [],
    popularSearches: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('🔍 Initializing search page...');
        
        // Check authentication
        await this.checkAuth();
        
        // Load all sections
        await Promise.all([
            this.loadPopularSearches(),
            this.loadQuickCategories()
        ]);
        
        // Load search history if logged in
        if (this.currentUser) {
            await this.loadSearchHistory();
        } else {
            // Load local search history for non-logged in users
            this.loadLocalSearchHistory();
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Set active nav item
        this.setActiveNav();
    },
    
    // ============================================
    // AUTHENTICATION
    // ============================================
    async checkAuth() {
        try {
            var userData = await sb.auth.getUser();
            this.currentUser = userData.data.user;
            
            if (this.currentUser) {
                console.log('✅ User logged in:', this.currentUser.id);
            } else {
                console.log('👤 User not logged in');
            }
        } catch (error) {
            console.error('❌ Auth error:', error);
            this.currentUser = null;
        }
    },
    
    // ============================================
    // SET ACTIVE NAV ITEM
    // ============================================
    setActiveNav() {
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('href') === 'B2B-search.html') {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    },
    
    // ============================================
    // SETUP EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        var searchForm = document.getElementById('searchForm');
        var searchInput = document.getElementById('searchInput');
        var clearBtn = document.getElementById('clearSearch');
        
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                var query = searchInput.value.trim();
                if (!query) {
                    e.preventDefault();
                    this.showToast('Please enter a search term', 'error');
                    return;
                }
                
                // Save to history
                this.saveSearchHistory(query);
                
                // Form will naturally submit
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchInput.focus();
                clearBtn.style.display = 'none';
            });
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                clearBtn.style.display = this.value ? 'block' : 'none';
            });
            
            // Focus the input
            searchInput.focus();
        }
    },
    
    // ============================================
    // LOAD SEARCH HISTORY (Logged in users)
    // ============================================
    async loadSearchHistory() {
        if (!this.currentUser) return;
        
        try {
            var historyData = await sb
                .from('search_history')
                .select('query, searched_at')
                .eq('user_id', this.currentUser.id)
                .order('searched_at', { ascending: false })
                .limit(10);

            if (historyData.error) throw historyData.error;

            var section = document.getElementById('recentSearchesSection');
            var container = document.getElementById('recentSearchesList');
            
            if (!section || !container) return;
            
            if (!historyData.data || historyData.data.length === 0) {
                container.innerHTML = this.getEmptyHistoryHTML();
                return;
            }

            var historyHtml = historyData.data.map(item => {
                var timeAgo = this.getTimeAgo(new Date(item.searched_at));
                
                return `
                    <div class="history-item">
                        <a href="B2B-search-results.html?q=${encodeURIComponent(item.query)}" class="history-link">
                            <i class="fas fa-history"></i>
                            <span class="history-text">${this.escapeHtml(item.query)}</span>
                            <span class="history-time">${timeAgo}</span>
                        </a>
                        <button class="remove-history" onclick="SearchPage.removeSearchHistory('${this.escapeHtml(item.query)}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');

            container.innerHTML = historyHtml;

        } catch (error) {
            console.error('Error loading search history:', error);
            document.getElementById('recentSearchesList').innerHTML = this.getErrorHTML();
        }
    },
    
    // ============================================
    // LOAD LOCAL SEARCH HISTORY (Non-logged in users)
    // ============================================
    loadLocalSearchHistory() {
        try {
            var localHistory = JSON.parse(localStorage.getItem('localSearchHistory') || '[]');
            var container = document.getElementById('recentSearchesList');
            
            if (!container) return;
            
            if (localHistory.length === 0) {
                container.innerHTML = this.getEmptyHistoryHTML();
                return;
            }
            
            var historyHtml = localHistory.map(item => {
                var timeAgo = this.getTimeAgo(new Date(item.searched_at));
                
                return `
                    <div class="history-item">
                        <a href="B2B-search-results.html?q=${encodeURIComponent(item.query)}" class="history-link">
                            <i class="fas fa-history"></i>
                            <span class="history-text">${this.escapeHtml(item.query)}</span>
                            <span class="history-time">${timeAgo}</span>
                        </a>
                        <button class="remove-history" onclick="SearchPage.removeLocalSearchHistory('${this.escapeHtml(item.query)}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');
            
            container.innerHTML = historyHtml;
            
        } catch (error) {
            console.error('Error loading local history:', error);
        }
    },
    
    // ============================================
    // SAVE SEARCH HISTORY
    // ============================================
    async saveSearchHistory(query) {
        if (!query || query.trim().length < 2) return;
        
        var trimmedQuery = query.trim();
        
        if (this.currentUser) {
            // Save to database
            try {
                await sb
                    .from('search_history')
                    .insert([{
                        user_id: this.currentUser.id,
                        query: trimmedQuery,
                        searched_at: new Date().toISOString()
                    }]);
                    
                // Reload history
                await this.loadSearchHistory();
                
            } catch (error) {
                console.error('Error saving search history:', error);
            }
        } else {
            // Save to localStorage
            try {
                var localHistory = JSON.parse(localStorage.getItem('localSearchHistory') || '[]');
                
                // Remove if exists
                localHistory = localHistory.filter(item => item.query !== trimmedQuery);
                
                // Add new
                localHistory.unshift({
                    query: trimmedQuery,
                    searched_at: new Date().toISOString()
                });
                
                // Keep only last 10
                localHistory = localHistory.slice(0, 10);
                
                localStorage.setItem('localSearchHistory', JSON.stringify(localHistory));
                
                // Reload history
                this.loadLocalSearchHistory();
                
            } catch (error) {
                console.error('Error saving local history:', error);
            }
        }
    },
    
    // ============================================
    // REMOVE SEARCH HISTORY (Database)
    // ============================================
    async removeSearchHistory(query) {
        if (!this.currentUser) return;
        
        try {
            await sb
                .from('search_history')
                .delete()
                .eq('user_id', this.currentUser.id)
                .eq('query', query);
                
            this.showToast('Removed from history', 'success');
            await this.loadSearchHistory();
            
        } catch (error) {
            console.error('Error removing search history:', error);
            this.showToast('Error removing item', 'error');
        }
    },
    
    // ============================================
    // REMOVE LOCAL SEARCH HISTORY
    // ============================================
    removeLocalSearchHistory(query) {
        try {
            var localHistory = JSON.parse(localStorage.getItem('localSearchHistory') || '[]');
            localHistory = localHistory.filter(item => item.query !== query);
            localStorage.setItem('localSearchHistory', JSON.stringify(localHistory));
            
            this.showToast('Removed from history', 'success');
            this.loadLocalSearchHistory();
            
        } catch (error) {
            console.error('Error removing local history:', error);
            this.showToast('Error removing item', 'error');
        }
    },
    
    // ============================================
    // CLEAR SEARCH HISTORY
    // ============================================
    async clearSearchHistory() {
        if (!confirm('Clear all search history?')) return;
        
        if (this.currentUser) {
            try {
                await sb
                    .from('search_history')
                    .delete()
                    .eq('user_id', this.currentUser.id);
                    
                this.showToast('Search history cleared', 'success');
                await this.loadSearchHistory();
                
            } catch (error) {
                console.error('Error clearing search history:', error);
                this.showToast('Error clearing history', 'error');
            }
        } else {
            localStorage.removeItem('localSearchHistory');
            this.showToast('Search history cleared', 'success');
            this.loadLocalSearchHistory();
        }
    },
    
    // ============================================
    // LOAD POPULAR SEARCHES (From database)
    // ============================================
    async loadPopularSearches() {
        try {
            // Get most frequent searches from search_history
            var searchesData = await sb
                .from('search_history')
                .select('query, count(*)', { count: 'exact' })
                .order('count', { ascending: false })
                .limit(10)
                .group('query');

            if (searchesData.error) throw searchesData.error;

            var container = document.getElementById('popularSearches');
            if (!container) return;
            
            // Fallback popular searches if none in database
            var popularSearches = [
                'see thru micro skirts',
                'mesh dress',
                'bacarat rough 540 perfume',
                'retractable measuring tape',
                'perfume',
                'wholesale electronics',
                'bulk clothing',
                'office furniture'
            ];
            
            var searchesHtml = popularSearches.map(search => {
                return `
                    <div class="popular-item">
                        <a href="B2B-search-results.html?q=${encodeURIComponent(search)}" class="popular-link">
                            <i class="fas fa-fire"></i>
                            <span class="popular-text">${this.escapeHtml(search)}</span>
                        </a>
                    </div>
                `;
            }).join('');

            container.innerHTML = searchesHtml;

        } catch (error) {
            console.error('Error loading popular searches:', error);
            this.loadDefaultPopularSearches();
        }
    },
    
    // ============================================
    // LOAD DEFAULT POPULAR SEARCHES (Fallback)
    // ============================================
    loadDefaultPopularSearches() {
        var container = document.getElementById('popularSearches');
        if (!container) return;
        
        var popularSearches = [
            'see thru micro skirts',
            'mesh dress',
            'bacarat rough 540 perfume',
            'retractable measuring tape',
            'perfume',
            'wholesale electronics',
            'bulk clothing',
            'office furniture'
        ];
        
        var searchesHtml = popularSearches.map(search => {
            return `
                <div class="popular-item">
                    <a href="B2B-search-results.html?q=${encodeURIComponent(search)}" class="popular-link">
                        <i class="fas fa-fire"></i>
                        <span class="popular-text">${this.escapeHtml(search)}</span>
                    </a>
                </div>
            `;
        }).join('');
        
        container.innerHTML = searchesHtml;
    },
    
    // ============================================
    // LOAD QUICK CATEGORIES
    // ============================================
    async loadQuickCategories() {
        try {
            var categoriesData = await sb
                .from('categories')
                .select('id, name, icon')
                .eq('is_active', true)
                .order('display_order')
                .limit(6);

            if (categoriesData.error) throw categoriesData.error;

            var container = document.getElementById('quickCategories');
            if (!container) return;
            
            if (!categoriesData.data || categoriesData.data.length === 0) {
                this.loadDefaultCategories();
                return;
            }

            var categoriesHtml = categoriesData.data.map(cat => {
                var icon = cat.icon || this.getCategoryIcon(cat.name);
                return `
                    <a href="B2B-search-results.html?category=${cat.id}" class="category-item">
                        <i class="fas ${icon}"></i>
                        <span>${this.escapeHtml(cat.name)}</span>
                    </a>
                `;
            }).join('');

            container.innerHTML = categoriesHtml;

        } catch (error) {
            console.error('Error loading categories:', error);
            this.loadDefaultCategories();
        }
    },
    
    // ============================================
    // LOAD DEFAULT CATEGORIES
    // ============================================
    loadDefaultCategories() {
        var container = document.getElementById('quickCategories');
        if (!container) return;
        
        var defaultCategories = [
            { name: 'Electronics', icon: 'fa-tv' },
            { name: 'Fashion', icon: 'fa-tshirt' },
            { name: 'Home & Garden', icon: 'fa-home' },
            { name: 'Automotive', icon: 'fa-car' },
            { name: 'Health & Beauty', icon: 'fa-heartbeat' },
            { name: 'Sports', icon: 'fa-futbol' }
        ];
        
        var categoriesHtml = defaultCategories.map(cat => {
            return `
                <a href="B2B-search-results.html?q=${encodeURIComponent(cat.name)}" class="category-item">
                    <i class="fas ${cat.icon}"></i>
                    <span>${cat.name}</span>
                </a>
            `;
        }).join('');
        
        container.innerHTML = categoriesHtml;
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    getCategoryIcon(categoryName) {
        var icons = {
            'electronics': 'fa-tv',
            'fashion': 'fa-tshirt',
            'home': 'fa-home',
            'garden': 'fa-seedling',
            'automotive': 'fa-car',
            'health': 'fa-heartbeat',
            'beauty': 'fa-spa',
            'sports': 'fa-futbol',
            'books': 'fa-book',
            'toys': 'fa-gamepad',
            'food': 'fa-utensils',
            'furniture': 'fa-couch',
            'phones': 'fa-mobile-alt',
            'computers': 'fa-laptop',
            'tools': 'fa-tools'
        };
        
        var lowerName = categoryName.toLowerCase();
        for (var key in icons) {
            if (lowerName.includes(key)) {
                return icons[key];
            }
        }
        return 'fa-tag';
    },
    
    getTimeAgo(date) {
        var seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + ' min' + (minutes > 1 ? 's' : '') + ' ago';
        
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
        
        var days = Math.floor(hours / 24);
        if (days < 7) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
        
        var weeks = Math.floor(days / 7);
        return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago';
    },
    
    getEmptyHistoryHTML() {
        return `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No recent searches</p>
            </div>
        `;
    },
    
    getErrorHTML() {
        return `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading history</p>
            </div>
        `;
    },
    
    showToast(message, type = 'info') {
        var toast = document.getElementById('toast');
        if (!toast) return;
        
        var colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#6B21E5',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SearchPage.init();
});

// Make functions globally available
window.SearchPage = SearchPage;